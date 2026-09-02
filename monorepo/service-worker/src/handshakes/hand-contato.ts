// src/handshakes/hand-contato.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Contato } from "@loco/utils/interfaces";
import { gerarId, buscarHandshake, salvarHandshake, buscarProfile, buscarContatoPorChave, salvarContato, serializarPublicKeyVapid, listarHandshakes, removerHandshake, removerContatoPorHash, removerTodoHistoricoChat, extrairDadosCompactos, expandirDadosCompactos, CompactContact } from "@loco/utils/db";
import { processarFilaHandshake } from "../sw/handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

interface ContatoOutParams {
  function: string;
  contato: string;
  campos?: string[];
  responder?: boolean;
}

export async function ExpurgarHandshakesContato(contatoHash: string) {
  addDebugLog("warn", "HAND-CONTATO", `🗑️ Expurgando handshakes de conexão do contato ${contatoHash}`);
  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.contato || h.out?.rotas.contato)) {
      await removerHandshake(h.id);
    }
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ContatoOutParams }) {
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    
    const contatoReq = handshake.in.rotas.contato;
    
    if (contatoReq.removerContato === true) {
      addDebugLog("warn", "HAND-CONTATO", `📩 Comando de EXCLUSÃO DE CONTATO recebido do remoto (aud: ${handshake.aud})`);
      await removerTodoHistoricoChat(handshake.aud);
      await removerContatoPorHash(handshake.aud);
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      }
      addDebugLog("success", "HAND-CONTATO", `🗑️ Contato ${handshake.aud} e seu histórico foram expurgados remotamente por solicitação do remetente.`);
      return;
    }
    
    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      addDebugLog(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: Record<string, unknown> = { id: handshake.aud };
      
      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = await extrairDadosCompactos(contato);
        if (camposSet.has('vapidPublicKey')) rotasContatoData.vp = cp.vp;
        if (camposSet.has('e2ePublicKey')) rotasContatoData.ep = cp.ep;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; rotasContatoData.ps = cp.ps; }
        if (camposSet.has('vapidPrivateKeyEnvelope')) rotasContatoData.ve = cp.ve;
        if (camposSet.has('email')) rotasContatoData.em = cp.em;
        if (camposSet.has('name')) rotasContatoData.nm = cp.nm;
        if (camposSet.has('trusted')) rotasContatoData.tr = contato.trusted;
      }
      
      handshake.out = { status: 'pendente', tentativas: 0, rotas: { contato: { data: rotasContatoData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (contatoReq.data) {
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();
      if (!contato || !profile) return;
      
      const d = contatoReq.data as Record<string, unknown>;
      const mp = await extrairDadosCompactos(profile);
      let novoMeStatus = contato.me;
      
      if (!d.se) {
        novoMeStatus = 'none'; 
      } else {
        if (d.tr === true) novoMeStatus = 'trusted';
        else novoMeStatus = 'saved';
        
        const d_vp = d.vp as any || { x: d.vx, y: d.vy };
        const d_ep = d.ep as any || { n: d.en };
        
        if (d.se !== mp.se || d.sp !== mp.sp || d.sa !== mp.sa || 
            d_vp.x !== mp.vp.x || d_vp.y !== mp.vp.y || d_ep.n !== mp.ep.n || d.ve !== mp.ve) {
          novoMeStatus = 'wrong';
        }
      }
      
      if (contato.me !== novoMeStatus) {
        contato.me = novoMeStatus;
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
        }
      }
    }
    else if (contatoReq.sync) {
      const syncData = contatoReq.sync as unknown as CompactContact;
      if ((syncData as any).vx && !syncData.vp) {
        syncData.vp = { x: (syncData as any).vx, y: (syncData as any).vy };
        syncData.ep = { n: (syncData as any).en };
      }
      const expanded = expandirDadosCompactos(syncData);
      const contatoAntigo = await buscarContatoPorChave(handshake.aud);
      const eleConfiaEmMim = syncData.tr === true; 
      const novoMeStatus = eleConfiaEmMim ? 'trusted' : 'saved';
      
      const novoContato: Contato = {
        id: handshake.aud,
        vapidPublicKey: expanded.vapidPublicKey!,
        e2ePublicKey: expanded.e2ePublicKey!,
        email: expanded.email || '',
        name: expanded.name || '',
        subscription: expanded.subscription!,
        vapidPrivateKeyEnvelope: expanded.vapidPrivateKeyEnvelope!,
        trusted: contatoAntigo ? contatoAntigo.trusted : false, 
        me: novoMeStatus, 
        createdAt: contatoAntigo ? contatoAntigo.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      
      await salvarContato(novoContato);
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      }
      
      if (syncData.req) {
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  if (outParams) {
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      if (!profile) return;
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");
      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;
      const compactSyncData = await extrairDadosCompactos(profile, !outParams.responder, euConfio);
      
      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData as unknown as Record<string, unknown> } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
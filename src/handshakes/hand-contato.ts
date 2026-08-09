// src/handshakes/hand-contato.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Contato } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarProfile,
  buscarContatoPorChave,
  salvarContato,
  serializarPublicKeyVapid
} from "../utils/db-helpers.ts";
import { extrairDadosCompactos, expandirDadosCompactos } from "../utils/share-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    const contatoReq = handshake.in.rotas.contato;

    // 1. Recebemos um Pull (O contato quer saber se confiamos nele e se temos os dados certos)
    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      addDebugLog(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: any = { id: handshake.aud };

      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = extrairDadosCompactos(contato); // Puxa os dados espremidos
        
        if (camposSet.has('vapidPublicKey')) { rotasContatoData.vx = cp.vx; rotasContatoData.vy = cp.vy; }
        if (camposSet.has('e2ePublicKey')) rotasContatoData.en = cp.en;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; }
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

    // 2. Recebemos a Resposta do Pull (Avaliando a consistência)
    else if (contatoReq.data) {
      addDebugLog(`[HAND-CONTATO] 📩 Resposta de status recebida. Avaliando consistência...`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();

      if (contato && profile) {
        const d = contatoReq.data;
        const mp = extrairDadosCompactos(profile); // Puxa o nosso perfil espremido para bater de frente
        let novoMeStatus = contato.me;

        if (!d.se) {
          novoMeStatus = 'none'; 
        } else {
          if (d.tr === true) novoMeStatus = 'trusted';
          else novoMeStatus = 'saved';

          if (d.se !== mp.se || d.sp !== mp.sp || d.sa !== mp.sa || 
              d.vx !== mp.vx || d.vy !== mp.vy || d.en !== mp.en || d.ve !== mp.ve) {
            novoMeStatus = 'wrong';
          }
        }

        if (contato.me !== novoMeStatus) {
          contato.me = novoMeStatus;
          contato.updatedAt = Date.now();
          await salvarContato(contato);
          addDebugLog(`[HAND-CONTATO] ✅ Status do contato atualizado para: ${novoMeStatus}`);
          
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
        }
      }
    }

    // 3. Recebemos um Push (enviarSubscription/sync)
    else if (contatoReq.sync) {
      addDebugLog(`[HAND-CONTATO] 📩 Pacote PUSH com perfil atualizado recebido.`);
      
      const expanded = expandirDadosCompactos(contatoReq.sync);
      const contatoAntigo = await buscarContatoPorChave(handshake.aud);
      
      // Avaliação blindada do status enviado pelo remetente
      const eleConfiaEmMim = contatoReq.sync.tr === true; 
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
      addDebugLog(`[HAND-CONTATO] ✅ Contato salvo. Status: ${novoMeStatus}`);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));

      if (contatoReq.sync.req) {
        addDebugLog(`[HAND-CONTATO] 🔄 Devolvendo meus dados em reciprocidade...`);
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT)
  // ==========================================
  if (outParams) {
    // PULL - Diagnóstico
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      const meuHash = await serializarPublicKeyVapid(profile!.vapidPublicKey);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de confirmação de inscrição (Pull) criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // PUSH - Forçar Sincronização
    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");

      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;

      // Utiliza a função importada para reduzir DRY
      const compactSyncData = extrairDadosCompactos(profile, !outParams.responder, euConfio);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de sync de contato (Push) criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
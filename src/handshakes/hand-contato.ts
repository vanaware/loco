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
import { extrairDadosCompactos, expandirDadosCompactos, CompactContact } from "../utils/share-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

interface ContatoOutParams {
  function: string;
  contato: string;
  campos?: string[];
  responder?: boolean;
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ContatoOutParams }) {
  
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    const contatoReq = handshake.in.rotas.contato;

    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      addDebugLog(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: Record<string, unknown> = { id: handshake.aud };

      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = extrairDadosCompactos(contato);
        
        if (camposSet.has('vapidPublicKey')) { rotasContatoData.vx = cp.vx; rotasContatoData.vy = cp.vy; }
        if (camposSet.has('e2ePublicKey')) rotasContatoData.en = cp.en;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; }
        if (camposSet.has('vapidPrivateKeyEnvelope')) rotasContatoData.ve = cp.ve;
        if (camposSet.has('email')) rotasContatoData.em = cp.em;
        if (camposSet.has('name')) rotasContatoData.nm = cp.nm;
        if (camposSet.has('trusted')) rotasContatoData.tr = contato.trusted;
      } else {
        addDebugLog(`[HAND-CONTATO] ⚠️ Contato não localizado no banco local para aud: ${handshake.aud}`);
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { contato: { data: rotasContatoData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (contatoReq.data) {
      addDebugLog(`[HAND-CONTATO] 📩 Resposta de status recebida. Avaliando consistência...`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();

      if (!contato) {
        addDebugLog(`[HAND-CONTATO] ⚠️ Falha na avaliação: Contato não encontrado no banco local (aud: ${handshake.aud}).`);
        return;
      }

      if (!profile) {
        addDebugLog(`[HAND-CONTATO] ⚠️ Falha na avaliação: Perfil local não encontrado.`);
        return;
      }

      const d = contatoReq.data as Record<string, unknown>;
      const mp = extrairDadosCompactos(profile);
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
        const statusAnterior = contato.me;
        contato.me = novoMeStatus;
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-CONTATO] ✅ Status alterado de '${statusAnterior}' para: '${novoMeStatus}'`);
        
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      } else {
        addDebugLog(`[HAND-CONTATO] ✅ Consistência avaliada. Status mantido em: '${novoMeStatus}'`);
      }
    }

    else if (contatoReq.sync) {
      addDebugLog(`[HAND-CONTATO] 📩 Pacote PUSH com perfil atualizado recebido.`);
      
      const syncData = contatoReq.sync as unknown as CompactContact;
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
      addDebugLog(`[HAND-CONTATO] ✅ Contato salvo. Status: ${novoMeStatus}`);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));

      if (syncData.req) {
        addDebugLog(`[HAND-CONTATO] 🔄 Devolvendo meus dados em reciprocidade...`);
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  if (outParams) {
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      if (!profile) {
        addDebugLog(`[HAND-CONTATO] ❌ Erro ao criar Pull: Perfil local ausente.`);
        return;
      }
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de confirmação de inscrição (Pull) criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");

      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;

      const compactSyncData = extrairDadosCompactos(profile, !outParams.responder, euConfio);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData as unknown as Record<string, unknown> } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de sync de contato (Push) criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
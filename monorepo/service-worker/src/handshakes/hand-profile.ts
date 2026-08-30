// src/handshakes/hand-profile.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake } from "@loco/utils/interfaces";
import { gerarId, buscarHandshake, salvarHandshake, buscarProfile, buscarContatoPorChave, salvarContato, serializarPublicKeyVapid, listarHandshakes, removerHandshake } from "@loco/utils/db";
import { minifyVapidPublic, expandVapidPublic, minifyRsaPublic, expandRsaPublic } from "@loco/utils/crypto";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "@loco/utils/debug";

interface ProfileOutParams {
  function: string;
  contato: string;
  campos?: string[];
}

export async function ExpurgarHandshakesProfile(contatoHash: string) {
  addDebugLog("warn", "HAND-PROFILE", `🗑️ Expurgando handshakes de perfil do contato ${contatoHash}`);
  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.profile || h.out?.rotas.profile)) {
      await removerHandshake(h.id);
    }
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ProfileOutParams }) {
  if (handshakeId) {
    addDebugLog(`[HAND-PROFILE] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.profile) {
      addDebugLog(`[HAND-PROFILE] ⚠️ Handshake ${handshakeId} não contém rotas de profile.`);
      return;
    }

    const profileReq = handshake.in.rotas.profile;
    if (Array.isArray(profileReq.campos)) {
      addDebugLog(`[HAND-PROFILE] 📩 Solicitação de dados recebida. Campos:`, profileReq.campos);
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil local não encontrado para responder à requisição.");
      
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      const rotasProfileData: Record<string, unknown> = { id: meuHash };
      const camposSet = new Set(profileReq.campos);
      
      if (camposSet.has('name')) rotasProfileData.name = profile.name;
      if (camposSet.has('email')) rotasProfileData.email = profile.email;
      if (camposSet.has('vapidPublicKey')) rotasProfileData.vapidPublicKey = minifyVapidPublic(profile.vapidPublicKey);
      if (camposSet.has('vapidPrivateKeyEnvelope')) rotasProfileData.vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
      if (camposSet.has('e2ePublicKey')) rotasProfileData.e2ePublicKey = minifyRsaPublic(profile.e2ePublicKey);
      if (camposSet.has('subscription')) rotasProfileData.subscription = profile.subscription;

      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: { profile: { data: rotasProfileData } }
      };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
    else if (profileReq.data && typeof profileReq.data.id === 'string') {
      addDebugLog(`[HAND-PROFILE] 📩 Resposta de dados recebida do contato ${profileReq.data.id}`);
      const contatoId = profileReq.data.id;
      const contato = await buscarContatoPorChave(contatoId);
      
      if (contato) {
        const d = profileReq.data;
        if (typeof d.name === 'string') contato.name = d.name;
        if (typeof d.email === 'string') contato.email = d.email;
        if (typeof d.vapidPrivateKeyEnvelope === 'string') contato.vapidPrivateKeyEnvelope = d.vapidPrivateKeyEnvelope;
        if (d.subscription !== undefined) contato.subscription = d.subscription as any;
        if (d.vapidPublicKey !== undefined) contato.vapidPublicKey = expandVapidPublic(d.vapidPublicKey);
        if (d.e2ePublicKey !== undefined) contato.e2ePublicKey = expandRsaPublic(d.e2ePublicKey);
        
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-PROFILE] ✅ Contato ${contatoId} atualizado com sucesso no DB.`);
        
        if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => {
            client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
          });
        }
      } else {
        addDebugLog(`[HAND-PROFILE] ⚠️ Resposta recebida, mas contato ${contatoId} não existe no banco.`);
      }
    }
  }

  if (outParams) {
    addDebugLog(`[HAND-PROFILE] 📤 Preparando saída manual de profile:`, outParams);
    if (outParams.function === 'solicitarPerfil') {
      const contatoId = outParams.contato;
      const campos = outParams.campos;
      if (!contatoId || !campos) {
        throw new Error("Parâmetros inválidos para solicitarPerfil. Exigido 'contato' e 'campos'.");
      }
      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: { profile: { campos: campos } }
        }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-PROFILE] ✅ Handshake de solicitação de perfil criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
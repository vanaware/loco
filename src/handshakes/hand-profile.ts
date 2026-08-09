// src/handshakes/hand-profile.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarProfile,
  buscarContatoPorChave,
  salvarContato,
  serializarPublicKeyVapid
} from "../utils/db-helpers.ts";

// Importamos a função principal do roteador para forçar a fila a andar quando criamos uma saída
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  // ==========================================
  // 📥 FLUXO DE ENTRADA (IN)
  // ==========================================
  if (handshakeId) {
    addDebugLog(`[HAND-PROFILE] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.profile) {
      addDebugLog(`[HAND-PROFILE] ⚠️ Handshake ${handshakeId} não contém rotas de profile.`);
      return;
    }

    const profileReq = handshake.in.rotas.profile;

    // 1. Recebemos uma SOLICITAÇÃO (campos array) -> Devemos gerar a Resposta (FluxoOut)
    if (Array.isArray(profileReq.campos)) {
      addDebugLog(`[HAND-PROFILE] 📩 Solicitação de dados recebida. Campos:`, profileReq.campos);
      
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil local não encontrado para responder à requisição.");

      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      
      // Monta os dados a serem enviados de volta
      const rotasProfileData: any = { id: meuHash };
      const camposSet = new Set(profileReq.campos);

      if (camposSet.has('name')) rotasProfileData.name = profile.name;
      if (camposSet.has('email')) rotasProfileData.email = profile.email;
      if (camposSet.has('vapidPublicKey')) rotasProfileData.vapidPublicKey = profile.vapidPublicKey;
      if (camposSet.has('vapidPrivateKeyEnvelope')) rotasProfileData.vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
      if (camposSet.has('e2ePublicKey')) rotasProfileData.e2ePublicKey = profile.e2ePublicKey;
      if (camposSet.has('subscription')) rotasProfileData.subscription = profile.subscription;

      // O próprio handshake recebido ganha um out (resposta)
      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: {
          profile: {
            data: rotasProfileData
          }
        }
      };
      
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);

      // Aciona o processador para enviar a resposta imediatamente
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos uma RESPOSTA (data object) -> Devemos salvar no IndexedDB
    else if (profileReq.data && profileReq.data.id) {
      addDebugLog(`[HAND-PROFILE] 📩 Resposta de dados recebida do contato ${profileReq.data.id}`);
      
      const contatoId = profileReq.data.id;
      const contato = await buscarContatoPorChave(contatoId);
      
      if (contato) {
        const d = profileReq.data;
        
        // Atualiza apenas os campos que o contato enviou de volta
        if (d.name !== undefined) contato.name = d.name;
        if (d.email !== undefined) contato.email = d.email;
        if (d.vapidPublicKey !== undefined) contato.vapidPublicKey = d.vapidPublicKey;
        if (d.vapidPrivateKeyEnvelope !== undefined) contato.vapidPrivateKeyEnvelope = d.vapidPrivateKeyEnvelope;
        if (d.e2ePublicKey !== undefined) contato.e2ePublicKey = d.e2ePublicKey;
        if (d.subscription !== undefined) contato.subscription = d.subscription;

        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-PROFILE] ✅ Contato ${contatoId} atualizado com sucesso no DB.`);

        // Notifica a Interface (UI) para se recarregar
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
        });
      } else {
        addDebugLog(`[HAND-PROFILE] ⚠️ Resposta recebida, mas contato ${contatoId} não existe no banco.`);
      }
    }
  }
  
  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT - Acionado por nós)
  // ==========================================
  if (outParams) {
    addDebugLog(`[HAND-PROFILE] 📤 Preparando saída manual de profile:`, outParams);
    
    // Função: solicitarPerfil
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
          rotas: {
            profile: {
              campos: campos
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-PROFILE] ✅ Handshake de solicitação de perfil criado.`);
      
      // Aciona a fila para processar o envio
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
// src/handshakes/hand-mensagem.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Chat } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarChat,
  salvarChat,
  buscarContatoPorChave,
  buscarProfile,
} from "../utils/db-helpers.ts";
import { ehContatoProprio } from "../utils/self-contact-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts"; 

interface MensagemOutParams {
  function: string;
  contato: string;
  conteudo?: string;
  mensagem?: string;
  campos?: string[];
  msgId?: string;       
  handshakeId?: string; 
  createdAt?: number;
}

async function notificarUI(chatId: string) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'CHAT_ATUALIZADO', payload: { chatId } }));
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: MensagemOutParams }) {
  
  // 📥 LÓGICA DE ENTRADA (Recebendo Push Criptografado da Rede)
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    const msgReq = handshake.in.rotas.mensagem;

    // Cenário 1: Solicitação PULL de status
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação PULL de status da mensagem ${msgReq.recebida}.`);
      const msgLocal = await buscarChat(msgReq.recebida);
      const rotasMsgData: Record<string, unknown> = { recebida: msgReq.recebida };

      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('readAt')) rotasMsgData.readAt = msgLocal.readAt;
        if (camposSet.has('receivedAt')) rotasMsgData.receivedAt = msgLocal.receivedAt;
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { mensagem: { data: rotasMsgData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // Cenário 2: Auto-Ack Recebido (Confirmação de chegada física no destino)
    else if (msgReq.data && typeof msgReq.data.recebida === 'string' && typeof msgReq.data.status === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Auto-Ack recebido. Status: ${msgReq.data.status}`);
      
      const msgLocal = await buscarChat(msgReq.data.recebida);
      
      if (msgLocal && msgLocal.tipo === 'out') {
        if (msgReq.data.status === 'entregue') msgLocal.receivedAt = Date.now();
        if (msgReq.data.status === 'lida') msgLocal.readAt = Date.now();
        
        await salvarChat(msgLocal);
        notificarUI(msgLocal.id);
      }
    }

    // Cenário 3: Recebendo uma MENSAGEM NOVA
    else if (msgReq.enviada && msgReq.conteudo) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do remetente ${handshake.aud}`);
      
      const novaMsgRecebida: Chat = {
        id: msgReq.enviada,
        contatoHash: handshake.aud,
        conteudo: msgReq.conteudo,
        tipo: 'in',
        createdAt: Date.now(),
        receivedAt: Date.now(),
        handshake: handshakeId
      };
      await salvarChat(novaMsgRecebida);

      // Devolve Auto-Ack de recebimento físico para o remetente
      const ackHandshake: Handshake = {
        id: gerarId(),
        aud: handshake.aud,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente', tentativas: 0,
          rotas: { mensagem: { data: { recebida: novaMsgRecebida.id, status: 'entregue' } } }
        }
      };
      await salvarHandshake(ackHandshake);

      // 🔍 VERIFICAÇÃO DE CLIENTES ABERTOS
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appEstaAberto = windowClients.length > 0;

      // 🔥 Só exibe notificação nativa do sistema se o aplicativo estiver totalmente fechado
      if (!appEstaAberto) {
        const contato = await buscarContatoPorChave(handshake.aud);
        const nomeExibicao = contato?.name?.trim() || "Anônimo";
        
        await self.registration.showNotification(`📥 Nova mensagem`, {
          body: `${novaMsgRecebida.conteudo}\n\nDe: ${nomeExibicao}`,
          icon: '/icon-192.png',
          tag: novaMsgRecebida.id
        });
      } else {
        addDebugLog(`[HAND-MENSAGEM] 👁️ O app está aberto (${windowClients.length} janela(s)). Notificação nativa suprimida.`);
      }

      notificarUI(novaMsgRecebida.id);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
  // 📤 LÓGICA DE SAÍDA (Criando pacotes Push para enviar)
  if (outParams) {
    if (outParams.function === 'confirmarEntrega') {
      const { contato: contatoId, mensagem: mensagemId, campos } = outParams;
      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { recebida: mensagemId, campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (outParams.function === 'enviarMensagem') {
      const { contato: contatoId, conteudo, msgId, handshakeId, createdAt } = outParams;
      if (!conteudo) throw new Error("Conteúdo da mensagem não fornecido.");

      // 🔍 VERIFICA SE É MENSAGEM PARA SI MESMO (AUTO-MENSAGEM)
      const profile = await buscarProfile();
      const ehParaSiMesmo = await ehContatoProprio(contatoId, profile);
      
      if (ehParaSiMesmo) {
        // 🔄 FLUXO ESPECIAL: Mensagem para si mesmo (sem envio real, sem handshake)
        addDebugLog(`[HAND-MENSAGEM] 🔄 Detectado envio para si mesmo. Salvando localmente sem handshake.`);
        
        const idReal = msgId || gerarId();
        const agora = Date.now();
        
        // Cria a mensagem já com status completo (enviada, recebida, lida)
        const chatAuto: Chat = {
          id: idReal,
          contatoHash: contatoId,
          conteudo,
          tipo: 'out',
          createdAt: createdAt || agora,
          sentAt: agora,        // ✅ Marcada como enviada
          receivedAt: agora,    // ✅ Marcada como recebida
          readAt: agora,        // ✅ Marcada como lida
          notifiedAt: agora,    // ✅ Marcada como notificada
          handshake: 'self'     // 🔥 Handshake especial indicando auto-envio
        };
        
        await salvarChat(chatAuto);
        notificarUI(idReal);
        addDebugLog(`[HAND-MENSAGEM] ✅ Auto-mensagem ${idReal} salva com fluxo completo simulado.`);
        return; // ⚠️ Sai imediatamente sem criar handshake
      }

      // 📤 FLUXO NORMAL: Mensagem para outro contato (com handshake)
      const idReal = msgId || gerarId();
      const handIdReal = handshakeId || gerarId();
      
      const chatExistente = await buscarChat(idReal);
      if (!chatExistente) {
        const chatOut: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || Date.now(), handshake: handIdReal
        };
        await salvarChat(chatOut);
      }

      const novoHandshake: Handshake = {
        id: handIdReal, aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: idReal, conteudo } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] ✅ Mensagem ${idReal} posta na fila de saída do SW.`);
      
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
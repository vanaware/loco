// src/handshakes/hand-mensagem.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Chat } from "../../../utils/src/interfaces/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarChat,
  salvarChat,
  buscarContatoPorChave,
  buscarProfile,
  removerTodoHistoricoChat,
  removerChat,
  listarHandshakes,
  removerHandshake
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
  if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => client.postMessage({ type: 'CHAT_ATUALIZADO', payload: { chatId } }));
  }
}

// 🔥 EXPURGO ATUALIZADO: Apaga localmente e (opcionalmente) envia Handshake Único ao Contato
export async function ExpurgarMensagens(contatoHash: string, notificarRemoto = false) {
  addDebugLog("warn", "HAND-MENSAGEM", `🗑️ Expurgando histórico de mensagens do contato ${contatoHash} (Notificar Remoto: ${notificarRemoto})`);
  
  await removerTodoHistoricoChat(contatoHash);

  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.mensagem || h.out?.rotas.mensagem)) {
      await removerHandshake(h.id);
    }
  }

  // Se a limpeza foi iniciada pelo usuário local, envia UM ÚNICO handshake avisando o remoto
  if (notificarRemoto) {
    const novoHandshake: Handshake = {
      id: gerarId(),
      aud: contatoHash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      out: {
        status: 'pendente',
        tentativas: 0,
        rotas: { mensagem: { limparHistorico: true } }
      }
    };
    await salvarHandshake(novoHandshake);
    addDebugLog("info", "HAND-MENSAGEM", `🚀 Handshake de limpeza total de histórico enviado para a fila (aud: ${contatoHash}).`);
    setTimeout(() => processarFilaHandshake(), 100);
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: MensagemOutParams }) {
  
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    const msgReq = handshake.in.rotas.mensagem;

    // 🔥 NOVO: Recebimento da instrução "Limpar Histórico Completo Remoto"
    if (msgReq.limparHistorico === true) {
      addDebugLog("warn", "HAND-MENSAGEM", `📩 Solicitação de expurgo TOTAL de histórico recebida do contato ${handshake.aud}`);
      await removerTodoHistoricoChat(handshake.aud);
      await notificarUI("ALL_PURGED");
      addDebugLog("success", "HAND-MENSAGEM", `🗑️ Todo o histórico do contato ${handshake.aud} foi apagado com sucesso.`);
      return;
    }

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

    else if (msgReq.data && typeof msgReq.data.recebida === 'string' && typeof msgReq.data.status === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Auto-Ack recebido. Status: ${msgReq.data.status}`);
      
      const msgLocal = await buscarChat(msgReq.data.recebida);
      
      if (msgLocal && msgLocal.tipo === 'out') {
        if (msgReq.data.status === 'entregue') msgLocal.receivedAt = Date.now();
        if (msgReq.data.status === 'lida') msgLocal.readAt = Date.now();
        
        await salvarChat(msgLocal);
        await notificarUI(msgLocal.id);
      }
    }

    else if (msgReq.excluida && typeof msgReq.excluida === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação de exclusão remota da mensagem ${msgReq.excluida}`);
      const msgLocal = await buscarChat(msgReq.excluida);
      
      if (msgLocal && msgLocal.contatoHash === handshake.aud) {
        await removerChat(msgReq.excluida, handshake.aud);
        await notificarUI(msgReq.excluida);
        addDebugLog(`[HAND-MENSAGEM] 🗑️ Mensagem ${msgReq.excluida} apagada remotamente com sucesso.`);
      }
    }

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

      let appEstaAberto = false;
      if (typeof self !== 'undefined' && self.clients && typeof self.clients.matchAll === 'function') {
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        appEstaAberto = windowClients.length > 0;
      }

      if (!appEstaAberto && typeof self !== 'undefined' && self.registration && typeof self.registration.showNotification === 'function') {
        const contato = await buscarContatoPorChave(handshake.aud);
        const nomeExibicao = contato?.name?.trim() || "Anônimo";
        
        await self.registration.showNotification(`📥 Nova mensagem`, {
          body: `${novaMsgRecebida.conteudo}\n\nDe: ${nomeExibicao}`,
          icon: '/icon-192.png',
          tag: novaMsgRecebida.id
        });
      }

      await notificarUI(novaMsgRecebida.id);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
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

    else if (outParams.function === 'excluirMensagem') {
      const { contato: contatoId, msgId } = outParams;
      if (!msgId) throw new Error("ID da mensagem não fornecido para exclusão.");

      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { excluida: msgId } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] 🗑️ Handshake de exclusão da mensagem ${msgId} criado e posto na fila.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (outParams.function === 'enviarMensagem') {
      const { contato: contatoId, conteudo, msgId, handshakeId, createdAt } = outParams;
      if (!conteudo) throw new Error("Conteúdo da mensagem não fornecido.");

      const profile = await buscarProfile();
      const ehParaSiMesmo = profile ? await ehContatoProprio(contatoId, profile) : false;
      
      if (ehParaSiMesmo) {
        const idReal = msgId || gerarId();
        const agora = Date.now();
        
        const chatAuto: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || agora, sentAt: agora, receivedAt: agora,
          readAt: agora, notifiedAt: agora, handshake: 'self'
        };
        
        await salvarChat(chatAuto);
        await notificarUI(idReal);
        return;
      }

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
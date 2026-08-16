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

export async function ExpurgarMensagens(contatoHash: string) {
  addDebugLog("warn", "HAND-MENSAGEM", `🗑️ Expurgando histórico de mensagens e handshakes do contato ${contatoHash}`);
  
  await removerTodoHistoricoChat(contatoHash);

  const todos = await listarHandshakes();
  for (const h of todos) {
    if (h.aud === contatoHash && (h.in?.rotas.mensagem || h.out?.rotas.mensagem)) {
      await removerHandshake(h.id);
    }
  }
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: MensagemOutParams }) {
  
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    const msgReq = handshake.in.rotas.mensagem;

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

    // 🔥 ARQUITETURA [Exclusão Bidirecional]: Recebimento do comando "Apagar para Todos"
    else if (msgReq.excluida && typeof msgReq.excluida === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação de exclusão remota da mensagem ${msgReq.excluida}`);
      const msgLocal = await buscarChat(msgReq.excluida);
      
      // SEGURANÇA: Só permitimos que a pessoa apague se a mensagem estiver vinculada ao Hash dela
      // Removida a trava de 'msgLocal.tipo === in', permitindo exclusão bidirecional.
      if (msgLocal && msgLocal.contatoHash === handshake.aud) {
        await removerChat(msgReq.excluida, handshake.aud);
        await notificarUI(msgReq.excluida); // UI atualizará a tela se o chat estiver aberto
        addDebugLog(`[HAND-MENSAGEM] 🗑️ Mensagem ${msgReq.excluida} apagada remotamente com sucesso.`);
      } else {
        addDebugLog(`[HAND-MENSAGEM] ⚠️ Ignorando exclusão. Mensagem inexistente ou violação de autoridade.`);
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
      } else {
        addDebugLog(`[HAND-MENSAGEM] 👁️ O app está aberto ou ambiente sem UI/Notificação. Notificação nativa suprimida.`);
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

    // 🔥 ARQUITETURA: Cria o pacote para exclusão remota ("Apagar para todos")
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
        addDebugLog(`[HAND-MENSAGEM] 🔄 Detectado envio para si mesmo. Salvando localmente sem handshake.`);
        
        const idReal = msgId || gerarId();
        const agora = Date.now();
        
        const chatAuto: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || agora, sentAt: agora, receivedAt: agora,
          readAt: agora, notifiedAt: agora, handshake: 'self'
        };
        
        await salvarChat(chatAuto);
        await notificarUI(idReal);
        addDebugLog(`[HAND-MENSAGEM] ✅ Auto-mensagem ${idReal} salva com fluxo completo simulado.`);
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
// src/handshakes/hand-mensagem.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, MensagemRecebida, MensagemEnviada } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarMensagemEnviada,
  salvarMensagemEnviada,
  buscarMensagemRecebida,
  salvarMensagemRecebida,
  buscarContatoPorChave
} from "../utils/db-helpers.ts";

import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts"; // 🔥 Ajustado para Logger Puro

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  // ==========================================
  // 📥 FLUXO DE ENTRADA (IN)
  // ==========================================
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    const msgReq = handshake.in.rotas.mensagem;

    // 1. Recebemos uma SOLICITAÇÃO sobre uma mensagem que recebemos
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação PULL de status da mensagem ${msgReq.recebida}.`);
      const msgLocal = await buscarMensagemRecebida(msgReq.recebida);
      const rotasMsgData: any = { recebida: msgReq.recebida };

      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('status')) rotasMsgData.status = msgLocal.status;
        if (camposSet.has('conteudo')) rotasMsgData.conteudo = msgLocal.conteudo;
        if (camposSet.has('recebidoEm')) rotasMsgData.recebidoEm = msgLocal.recebidoEm;
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { mensagem: { data: rotasMsgData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos RESPOSTA de um pacote de status de leitura/entrega
    else if (msgReq.data && msgReq.data.recebida && msgReq.data.status) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Auto-Ack recebido. A mensagem ${msgReq.data.recebida} consta como ${msgReq.data.status} no destino.`);
      
      const msgEnviada = await buscarMensagemEnviada(msgReq.data.recebida);
      
      if (msgEnviada) {
        msgEnviada.status = 'entregue';
        msgEnviada.updatedAt = Date.now();
        await salvarMensagemEnviada(msgEnviada);

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: msgEnviada.id } }));
      }
    }

    // 3. Recebemos uma NOVA MENSAGEM de fato
    else if (msgReq.enviada && msgReq.conteudo) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do remetente ${handshake.aud}`);
      
      const novaMsgRecebida: MensagemRecebida = {
        id: msgReq.enviada,
        contatoPublicKeyVapid: handshake.aud,
        conteudo: msgReq.conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      await salvarMensagemRecebida(novaMsgRecebida);

      // Auto-Ack para bater o Double-Check lá no emisor!
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

      const contato = await buscarContatoPorChave(handshake.aud);
      const nomeExibicao = contato?.name?.trim() || "Anônimo";
      
      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: `${novaMsgRecebida.conteudo}\n\nDe: ${nomeExibicao}`,
        icon: '/icon-192.png',
        tag: novaMsgRecebida.id
      });

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({ type: "PUSH_RECEIVED", payload: { id: novaMsgRecebida.id } });
      });

      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT)
  // ==========================================
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
      const { contato: contatoId, conteudo } = outParams;
      const msgId = gerarId();

      const msgEnviada: MensagemEnviada = {
        id: msgId, contatoHash: contatoId, conteudo, status: 'pendente',
        tentativas: 0, createdAt: Date.now(), updatedAt: Date.now()
      };
      await salvarMensagemEnviada(msgEnviada);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: msgId, conteudo } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] ✅ Mensagem ${msgId} salva na fila do Service Worker.`);
      
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
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

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  // ==========================================
  // 📥 FLUXO DE ENTRADA (IN)
  // ==========================================
  if (handshakeId) {
    console.log(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) {
      console.warn(`[HAND-MENSAGEM] ⚠️ Handshake ${handshakeId} não contém rotas de mensagem.`);
      return;
    }

    const msgReq = handshake.in.rotas.mensagem;

    // 1. Recebemos uma SOLICITAÇÃO sobre uma mensagem que recebemos (campos array + recebida)
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      console.log(`[HAND-MENSAGEM] 📩 Solicitação de status da mensagem ${msgReq.recebida}.`);
      
      const msgLocal = await buscarMensagemRecebida(msgReq.recebida);
      const rotasMsgData: any = { recebida: msgReq.recebida };

      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('status')) rotasMsgData.status = msgLocal.status;
        if (camposSet.has('conteudo')) rotasMsgData.conteudo = msgLocal.conteudo;
        if (camposSet.has('recebidoEm')) rotasMsgData.recebidoEm = msgLocal.recebidoEm;
        if (camposSet.has('lidaEm')) rotasMsgData.lidaEm = msgLocal.lidaEm;
        if (camposSet.has('notificadaEm')) rotasMsgData.notificadaEm = msgLocal.notificadaEm;
      }

      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: {
          mensagem: { data: rotasMsgData }
        }
      };
      
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos uma RESPOSTA de status de uma mensagem que nós enviamos (data object com recebida)
    // Isso atualiza o nosso balão de mensagem para Entregue / Lida (Os "dois tiques" ✓✓)
    else if (msgReq.data && msgReq.data.recebida && msgReq.data.status) {
      console.log(`[HAND-MENSAGEM] 📩 Confirmação recebida para a mensagem enviada ${msgReq.data.recebida}: ${msgReq.data.status}`);
      
      const msgEnviada = await buscarMensagemEnviada(msgReq.data.recebida);
      
      if (msgEnviada) {
        msgEnviada.status = 'entregue'; // Para expansão futura, mapear msgReq.data.status direto
        msgEnviada.updatedAt = Date.now();
        await salvarMensagemEnviada(msgEnviada);

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: msgEnviada.id, entregueEm: Date.now() } });
        });
      }
    }

    // 3. Recebemos uma NOVA MENSAGEM de um contato (🔥 CORRIGIDO: lendo direto da raiz de msgReq)
    else if (msgReq.enviada && msgReq.conteudo) {
      console.log(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do contato ${handshake.aud}: ${msgReq.enviada}`);
      
      // Cria a mensagem na Caixa de Entrada
      const novaMsgRecebida: MensagemRecebida = {
        id: msgReq.enviada,
        contatoPublicKeyVapid: handshake.aud,
        conteudo: msgReq.conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      await salvarMensagemRecebida(novaMsgRecebida);

      // Cria um NOVO handshake para enviar o Recibo de Entrega (Auto-Ack)
      const ackHandshake: Handshake = {
        id: gerarId(),
        aud: handshake.aud,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            mensagem: {
              data: {
                recebida: novaMsgRecebida.id,
                status: 'nao_lida'
              }
            }
          }
        }
      };
      await salvarHandshake(ackHandshake);

      // Busca dados do contato para notificação visual
      const contato = await buscarContatoPorChave(handshake.aud);
      const nomeExibicao = contato?.name?.trim() || "Anônimo";
      const statusEmoji = contato?.trusted ? '✅' : '🔄';

      // Mostra a notificação do Sistema Operacional
      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: `${novaMsgRecebida.conteudo}\n\n${statusEmoji} De: ${nomeExibicao}`,
        icon: '/icon.png',
        data: {
          mensagemId: novaMsgRecebida.id,
          acao: 'ver_mensagem'
        },
        tag: novaMsgRecebida.id,
        vibrate: [200, 100, 200]
      });

      // Avisa a Interface para renderizar o balão de chat (se o app estiver aberto)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: novaMsgRecebida.id,
            body: novaMsgRecebida.conteudo,
            remetente: nomeExibicao,
            status: 'nao_lida'
          }
        });
      });

      // Aciona a fila para mandar o recibo de volta imediatamente
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT - Acionado por nós)
  // ==========================================
  if (outParams) {
    console.log(`[HAND-MENSAGEM] 📤 Preparando saída manual de mensagem:`, outParams);
    
    // Função: confirmarEntrega (Pedir o status de uma mensagem específica)
    if (outParams.function === 'confirmarEntrega') {
      const contatoId = outParams.contato;
      const mensagemId = outParams.mensagem;
      const campos = outParams.campos;

      if (!contatoId || !mensagemId || !campos) {
        throw new Error("Parâmetros inválidos. Exigido 'contato', 'mensagem' e 'campos'.");
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
            mensagem: {
              recebida: mensagemId,
              campos: campos
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // Função: enviarMensagem (O usuário digitou e apertou enviar)
    else if (outParams.function === 'enviarMensagem') {
      const contatoId = outParams.contato;
      const conteudo = outParams.conteudo;

      if (!contatoId || !conteudo) {
        throw new Error("Parâmetros inválidos. Exigido 'contato' e 'conteudo'.");
      }

      const msgId = gerarId();

      // 1. Salva a mensagem no histórico do usuário
      const msgEnviada: MensagemEnviada = {
        id: msgId,
        contatoHash: contatoId,
        conteudo: conteudo,
        status: 'pendente',
        tentativas: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await salvarMensagemEnviada(msgEnviada);

      // 2. Cria o Handshake de transporte contendo a mensagem
      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            mensagem: {
              enviada: msgId,
              conteudo: conteudo
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      console.log(`[HAND-MENSAGEM] ✅ Handshake de envio de mensagem criado (ID Msg: ${msgId}).`);
      
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
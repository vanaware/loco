// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";

// 🔥 Constantes
const DB_NAMES = {
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

function criarStore(nome) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeMensagensEnvioA = criarStore(DB_NAMES.MENSAGENS_ENVIO_A);
const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER A (ENVIO)
// ============================================================

async function salvarMensagemEnvio(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensEnvioA);
}

async function buscarMensagemEnvio(id) {
  return get(id, storeMensagensEnvioA);
}

async function listarMensagensEnvioPorStatus(status) {
  const todas = await listarMensagensEnvio();
  return todas.filter(m => m.status === status);
}

async function listarMensagensEnvio() {
  const entriesList = await entries(storeMensagensEnvioA);
  return entriesList.map(([_, msg]) => msg);
}

async function atualizarStatusMensagemEnvio(id, status, erro) {
  const mensagem = await buscarMensagemEnvio(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.atualizadoEm = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnvio(mensagem);
  }
}

async function removerMensagemEnvio(id) {
  await del(id, storeMensagensEnvioA);
}

// 🔥 ENVIA UMA MENSAGEM PARA O SERVIDOR
async function enviarMensagemParaServidor(mensagem) {
  try {
    console.log(`[SW-MSG] 📤 Enviando mensagem ${mensagem.id} para o servidor...`);
    
    const response = await fetch("/api/proxy-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...mensagem.bundle,
        payloadText: mensagem.payloadText
      })
    });

    if (response.ok) {
      console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} enviada com sucesso!`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'enviada');
      return true;
    } else {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${mensagem.id}:`, err);
    
    // Incrementa tentativas
    mensagem.tentativas++;
    mensagem.erro = err.message;
    
    if (mensagem.tentativas >= mensagem.maxTentativas) {
      console.log(`[SW-MSG] ⛔ Mensagem ${mensagem.id} excedeu tentativas máximas.`);
      await atualizarStatusMensagemEnvio(mensagem.id, 'falha', err.message);
    } else {
      await salvarMensagemEnvio(mensagem);
    }
    
    return false;
  }
}

// 🔥 PROCESSADOR DE FILA DE ENVIO
async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");
  
  const pendentes = await listarMensagensEnvioPorStatus('pendente');
  const enviando = await listarMensagensEnvioPorStatus('enviando');
  
  // Recupera mensagens que ficaram presas em 'enviando'
  const todasEnviando = enviando.filter(m => {
    // Se está em 'enviando' há mais de 30 segundos, recupera
    return (Date.now() - m.atualizadoEm) > 30000;
  });
  
  const paraProcessar = [...pendentes, ...todasEnviando];
  
  if (paraProcessar.length === 0) {
    console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
    return;
  }
  
  console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);
  
  for (const msg of paraProcessar) {
    // Marca como 'enviando'
    await atualizarStatusMensagemEnvio(msg.id, 'enviando');
    
    // Envia
    await enviarMensagemParaServidor(msg);
    
    // Pequena pausa entre envios
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER B (RECEBIDAS)
// ============================================================

async function salvarMensagemRecebida(mensagem) {
  await set(mensagem.id, mensagem, storeMensagensRecebidasB);
}

async function listarMensagensRecebidasPorStatus(status) {
  const todas = await listarMensagensRecebidas();
  return todas.filter(m => m.status === status);
}

async function listarMensagensRecebidas() {
  const entriesList = await entries(storeMensagensRecebidasB);
  return entriesList.map(([_, msg]) => msg);
}

async function atualizarStatusMensagemRecebida(id, status) {
  const mensagem = await get(id, storeMensagensRecebidasB);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await set(id, mensagem, storeMensagensRecebidasB);
  }
}

// 🔥 PROCESSADOR DE FILA DE NOTIFICAÇÃO
async function processarFilaNotificacao() {
  console.log("[SW-MSG] 🔔 Processando fila de notificações...");
  
  const naoLidas = await listarMensagensRecebidasPorStatus('nao_lida');
  
  if (naoLidas.length === 0) {
    console.log("[SW-MSG] ℹ️ Nenhuma mensagem não lida.");
    return;
  }
  
  console.log(`[SW-MSG] 📦 ${naoLidas.length} mensagens para notificar`);
  
  for (const msg of naoLidas) {
    try {
      console.log(`[SW-MSG] 🔔 Notificando mensagem ${msg.id}...`);
      
      await self.registration.showNotification(`📥 De: ${msg.remetente}`, {
        body: msg.conteudo,
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200],
        data: msg.dadosJwt,
        tag: msg.id,
        requireInteraction: true
      });
      
      await atualizarStatusMensagemRecebida(msg.id, 'notificada');
      console.log(`[SW-MSG] ✅ Mensagem ${msg.id} notificada com sucesso!`);
      
      // Pequena pausa entre notificações
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`[SW-MSG] ❌ Erro ao notificar mensagem ${msg.id}:`, err);
    }
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================

// 🔥 OUVE MENSAGENS DA PÁGINA (Browser A)
self.addEventListener('message', async (event) => {
  const data = event.data;
  
  if (data.type === 'ENVIAR_MENSAGEM') {
    console.log(`[SW-MSG] 📩 Recebida mensagem da página para enviar: ${data.payload.id}`);
    await salvarMensagemEnvio(data.payload);
    
    // Tenta enviar imediatamente
    await processarFilaEnvio();
    
    // Responde para a página
    if (event.source) {
      event.source.postMessage({
        type: 'MENSAGEM_ENVIADA',
        id: data.payload.id,
        status: 'pendente'
      });
    }
  }
  
  if (data.type === 'LISTAR_MENSAGENS_PENDENTES') {
    const mensagens = await listarMensagensEnvioPorStatus('pendente');
    if (event.source) {
      event.source.postMessage({
        type: 'LISTA_MENSAGENS',
        mensagens: mensagens
      });
    }
  }
});

// 🔥 SINC - Disparado quando o navegador está online
self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
  
  if (event.tag === 'sync-notificar-mensagens') {
    event.waitUntil(processarFilaNotificacao());
  }
});

// 🔥 PERIODIC SYNC (se disponível) - para processar filas em background
self.addEventListener('periodicsync', async function(event) {
  console.log(`[SW-MSG] ⏰ Periodic sync: ${event.tag}`);
  
  if (event.tag === 'periodic-sync-mensagens') {
    await processarFilaEnvio();
    await processarFilaNotificacao();
  }
});

// 🔥 ONLINE/OFFLINE - Processa filas quando volta online
self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
  await processarFilaNotificacao();
});

// 🔥 EXPORTA FUNÇÕES PARA O SERVICE WORKER PRINCIPAL
self.processarFilaEnvio = processarFilaEnvio;
self.processarFilaNotificacao = processarFilaNotificacao;
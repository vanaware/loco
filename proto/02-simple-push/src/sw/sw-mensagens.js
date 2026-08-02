// src/sw/sw-mensagens.js
import { get, set, createStore, del, entries } from "idb-keyval";

// 🔥 Constantes
const DB_NAMES = {
  MENSAGENS_ENVIO_A: "BrowserA_MensagensEnvio_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  CONTATOS: "BrowserB_Contatos_DB", // 🔥 Adicionado
};

const STORE_NAMES = {
  KEYVAL: "keyval",
};

// 🔥 Cria as stores IMEDIATAMENTE (não lazy)
const storeMensagensEnvioA = createStore(DB_NAMES.MENSAGENS_ENVIO_A, STORE_NAMES.KEYVAL);
const storeMensagensRecebidasB = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
const storeContatos = createStore(DB_NAMES.CONTATOS, STORE_NAMES.KEYVAL); // 🔥 Store de contatos

console.log("[SW-MSG] ✅ Stores criadas com sucesso!");

// ============================================================
// FUNÇÕES AUXILIARES PARA CONTATOS (copiadas do db-helpers)
// ============================================================
async function sha256(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function serializarPublicKeyVapid(jwk) {
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

async function buscarContatoPorChave(chaveOuJwk) {
  try {
    let key;
    if (typeof chaveOuJwk === 'string') {
      key = chaveOuJwk;
    } else if (chaveOuJwk && chaveOuJwk.kty) {
      key = await serializarPublicKeyVapid(chaveOuJwk);
    } else {
      return null;
    }
    return await get(key, storeContatos) || null;
  } catch {
    return null;
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER A (ENVIO)
// ============================================================

async function salvarMensagemEnvio(mensagem) {
  try {
    console.log(`[SW-MSG] 💾 Salvando mensagem ${mensagem.id}...`);
    await set(mensagem.id, mensagem, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
    throw err;
  }
}

async function buscarMensagemEnvio(id) {
  try {
    return await get(id, storeMensagensEnvioA);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao buscar mensagem ${id}:`, err);
    return null;
  }
}

async function listarMensagensEnvioPorStatus(status) {
  try {
    const todas = await listarMensagensEnvio();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens por status:", err);
    return [];
  }
}

async function listarMensagensEnvio() {
  try {
    const entriesList = await entries(storeMensagensEnvioA);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    return [];
  }
}

async function atualizarStatusMensagemEnvio(id, status, erro) {
  try {
    const mensagem = await buscarMensagemEnvio(id);
    if (mensagem) {
      mensagem.status = status;
      mensagem.atualizadoEm = Date.now();
      if (erro) mensagem.erro = erro;
      await salvarMensagemEnvio(mensagem);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

async function removerMensagemEnvio(id) {
  try {
    await del(id, storeMensagensEnvioA);
    console.log(`[SW-MSG] ✅ Mensagem ${id} removida`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao remover mensagem ${id}:`, err);
  }
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
  
  try {
    const pendentes = await listarMensagensEnvioPorStatus('pendente');
    const enviando = await listarMensagensEnvioPorStatus('enviando');
    
    const todasEnviando = enviando.filter(m => {
      return (Date.now() - m.atualizadoEm) > 30000;
    });
    
    const paraProcessar = [...pendentes, ...todasEnviando];
    
    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);
    
    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnvio(msg.id, 'enviando');
      await enviarMensagemParaServidor(msg);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// PROCESSADOR DE MENSAGENS - BROWSER B (RECEBIDAS)
// ============================================================

async function salvarMensagemRecebida(mensagem) {
  try {
    await set(mensagem.id, mensagem, storeMensagensRecebidasB);
    console.log(`[SW-MSG] ✅ Mensagem ${mensagem.id} salva no IndexedDB`);
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao salvar mensagem ${mensagem.id}:`, err);
  }
}

async function listarMensagensRecebidasPorStatus(status) {
  try {
    const todas = await listarMensagensRecebidas();
    return todas.filter(m => m.status === status);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function listarMensagensRecebidas() {
  try {
    const entriesList = await entries(storeMensagensRecebidasB);
    return entriesList.map(([_, msg]) => msg);
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao listar mensagens recebidas:", err);
    return [];
  }
}

async function atualizarStatusMensagemRecebida(id, status) {
  try {
    const mensagem = await get(id, storeMensagensRecebidasB);
    if (mensagem) {
      mensagem.status = status;
      if (status === 'lida') mensagem.lidaEm = Date.now();
      if (status === 'notificada') mensagem.notificadaEm = Date.now();
      await set(id, mensagem, storeMensagensRecebidasB);
      console.log(`[SW-MSG] ✅ Mensagem ${id} atualizada para status: ${status}`);
    }
  } catch (err) {
    console.error(`[SW-MSG] ❌ Erro ao atualizar mensagem ${id}:`, err);
  }
}

/**
 * Tenta exibir uma notificação com timeout de 5 segundos.
 */
async function mostrarNotificacaoComTimeout(titulo, opcoes, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn("[SW-MSG] ⚠️ Timeout ao exibir notificação, prosseguindo...");
      resolve(false);
    }, timeoutMs);

    self.registration.showNotification(titulo, opcoes)
      .then(() => {
        clearTimeout(timeout);
        resolve(true);
      })
      .catch((err) => {
        clearTimeout(timeout);
        console.error("[SW-MSG] ❌ Erro ao exibir notificação:", err);
        resolve(false);
      });
  });
}

// 🔥 PROCESSADOR DE FILA DE NOTIFICAÇÃO (com busca do nome do contato)
async function processarFilaNotificacao() {
  console.log("[SW-MSG] 🔔 Processando fila de notificações...");
  
  try {
    const naoLidas = await listarMensagensRecebidasPorStatus('nao_lida');
    
    if (naoLidas.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem não lida.");
      return;
    }
    
    console.log(`[SW-MSG] 📦 ${naoLidas.length} mensagens para notificar`);
    
    // Ícone fallback (caso logo.svh não seja encontrado)
    const fallbackIcon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const iconUrl = '/logo.svg'; // 🔥 ícone principal
    
    for (const msg of naoLidas) {
      try {
        console.log(`[SW-MSG] 🔔 Notificando mensagem ${msg.id}...`);
        
        // 🔥 Busca o contato usando a chave armazenada na mensagem
        let nomeRemetente = 'Remetente desconhecido';
        if (msg.contatoPublicKeyVapid) {
          const contato = await buscarContatoPorChave(msg.contatoPublicKeyVapid);
          if (contato && contato.nome) {
            nomeRemetente = contato.nome;
          }
        }
        
        // Verifica se o ícone existe (fallback se não)
        let iconToUse = iconUrl;
        try {
          const resp = await fetch(iconUrl, { method: 'HEAD' });
          if (!resp.ok) {
            iconToUse = fallbackIcon;
          }
        } catch {
          iconToUse = fallbackIcon;
        }

        const exibida = await mostrarNotificacaoComTimeout(
          `📥 De: ${nomeRemetente}`,
          {
            body: msg.conteudo,
            icon: iconToUse,
            badge: iconToUse,
            vibrate: [200, 100, 200],
            data: msg.dadosJwt || {},
            tag: msg.id,
            requireInteraction: true
          },
          5000 // timeout de 5 segundos
        );

        if (exibida) {
          await atualizarStatusMensagemRecebida(msg.id, 'notificada');
          console.log(`[SW-MSG] ✅ Mensagem ${msg.id} notificada com sucesso!`);
        } else {
          console.warn(`[SW-MSG] ⚠️ Notificação para ${msg.id} não foi exibida (timeout ou erro).`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao notificar mensagem ${msg.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de notificações:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================

self.addEventListener('message', async (event) => {
  const data = event.data;
  
  if (data.type === 'ENVIAR_MENSAGEM') {
    console.log(`[SW-MSG] 📩 Recebida mensagem da página para enviar: ${data.payload.id}`);
    try {
      await salvarMensagemEnvio(data.payload);
      await processarFilaEnvio();
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ENVIADA',
          id: data.payload.id,
          status: 'pendente'
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
      if (event.source) {
        event.source.postMessage({
          type: 'MENSAGEM_ERRO',
          id: data.payload.id,
          error: err.message
        });
      }
    }
  }
  
  if (data.type === 'LISTAR_MENSAGENS_PENDENTES') {
    try {
      const mensagens = await listarMensagensEnvioPorStatus('pendente');
      if (event.source) {
        event.source.postMessage({
          type: 'LISTA_MENSAGENS',
          mensagens: mensagens
        });
      }
    } catch (err) {
      console.error("[SW-MSG] ❌ Erro ao listar mensagens:", err);
    }
  }
});

self.addEventListener('sync', async function(event) {
  console.log(`[SW-MSG] 🔄 Sync disparado: ${event.tag}`);
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
  if (event.tag === 'sync-notificar-mensagens') {
    event.waitUntil(processarFilaNotificacao());
  }
});

self.addEventListener('periodicsync', async function(event) {
  console.log(`[SW-MSG] ⏰ Periodic sync: ${event.tag}`);
  if (event.tag === 'periodic-sync-mensagens') {
    await processarFilaEnvio();
    await processarFilaNotificacao();
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
  await processarFilaNotificacao();
});

self.processarFilaEnvio = processarFilaEnvio;
self.processarFilaNotificacao = processarFilaNotificacao;

console.log("[SW-MSG] 📦 Módulo de mensagens carregado com sucesso!");
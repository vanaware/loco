// src/sw/sync.js

import { del, entries, createStore } from "idb-keyval";

const storeFilaDisparosA = createStore("BrowserA_OfflineFila_DB", "keyval");

self.addEventListener('sync', function(event) {
  console.log(`[SW-SYNC] 🔄 Sincronização em segundo plano disparada! Tag: ${event.tag}`);
  if (event.tag === 'sync-push-notifications') {
    event.waitUntil(enviarMensagensPendentes());
  }
});

async function enviarMensagensPendentes() {
  try {
    const todasAsChavesFila = await entries(storeFilaDisparosA);
    if (!todasAsChavesFila || todasAsChavesFila.length === 0) {
      console.log("[SW-SYNC] ℹ️ Nenhuma mensagem pendente na fila de sincronização.");
      return;
    }

    console.log(`[SW-SYNC] 📦 Encontrados ${todasAsChavesFila.length} push(es) pendentes para enviar...`);
    let totalSucesso = 0;

    for (const [id, payload] of todasAsChavesFila) {
      try {
        const response = await fetch("/api/proxy-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          totalSucesso++;
          console.log(`[SW-SYNC] ✅ Mensagem enviada com sucesso ao servidor!`);
          await del(id, storeFilaDisparosA);
        } else {
          console.error("[SW-SYNC] ❌ Servidor rejeitou o POST da fila. Removendo item inválido.");
          await del(id, storeFilaDisparosA);
        }
      } catch (fetchErr) {
        console.error("[SW-SYNC] 🔌 Servidor inalcançável ou desligado. Reagendando mensagens no idb-keyval...");
        throw fetchErr; 
      }
    }

    if (totalSucesso > 0) {
      await self.registration.showNotification("✨ Conexão Restaurada!", {
        body: "Sua fila de notificações offline foi transmitida com sucesso!",
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [100, 50, 100] // 📳 Vibração curta indicando sucesso de fundo
      });
    }

  } catch (err) {
    console.error("[SW-SYNC] ⚠️ Falha ao processar o envio de fundo:", err);
    throw err;
  }
}

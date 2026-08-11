// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-handshakes.ts";

import { processarFilaHandshake } from "./sw/sw-handshakes.ts";
import { Processar as ProcessarProfile } from "./handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "./handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "./handshakes/hand-contato.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

self.addEventListener('activate', (event: any) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
    })()
  );
});

self.addEventListener('message', (event: any) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  if (type === 'PROCESSAR_FILA_HANDSHAKE') {
    processarFilaHandshake().catch(err => console.error(err));
    return;
  }

  if (type === 'CRIAR_HANDSHAKE_OUT') {
    const { rotasModulo, params } = payload;
    console.log(`[SW] 📨 Recebido comando da UI para CRIAR_HANDSHAKE_OUT [Módulo: ${rotasModulo}]`);
    
    if (rotasModulo === 'profile') {
      ProcessarProfile({ out: params }).catch(err => console.error("[SW] Erro no hand-profile:", err));
    } else if (rotasModulo === 'mensagem') {
      ProcessarMensagem({ out: params }).catch(err => console.error("[SW] Erro no hand-mensagem:", err));
    } else if (rotasModulo === 'contato') {
      ProcessarContato({ out: params }).catch(err => console.error("[SW] Erro no hand-contato:", err));
    } else {
      console.warn(`[SW] ⚠️ Módulo de rotas desconhecido ou não implementado: ${rotasModulo}`);
    }
  }
});
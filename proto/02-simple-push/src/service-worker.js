// src/service-worker.js

// Importa os módulos fatiados para que o Deno consolidar tudo em IIFE
import "./sw/cache.js";
import "./sw/push.js";
import "./sw/sync.js";
import "./sw/click.js";

console.log("[SW] 🌌 Orquestrador Modular do Service Worker carregado com sucesso!");

import { fileResponse } from "./sw-server.ts";

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  // Delega a resposta para o módulo sw-server
  const res = fileResponse(event);
  if (res) event.respondWith(res);
});

self.addEventListener("activate", () => {
  self.clients.claim();
});
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  console.log("[SW] Template instalado");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

export {};

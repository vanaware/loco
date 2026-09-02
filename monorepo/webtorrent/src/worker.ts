// Arquivo: monorepo/webtorrent/src/sw/worker.ts
/// <reference lib="webworker" />
import fileResponse from './worker-server.ts';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event: FetchEvent) => {
  const res = fileResponse(event);
  if (res) event.respondWith(res);
});

self.addEventListener('activate', () => {
  self.clients.claim();
});
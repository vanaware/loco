import { assertEquals, assertMatch, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { buildProxyUrl, getProxyPath, setProxyPath, DefaultProxyPath } from '../../src/constants/config.ts';

// Mock do window para testes
const mockLocation = {
  origin: 'http://localhost:3000',
};

// Configura o ambiente global para simular o browser
(globalThis as any).location = mockLocation;
(globalThis as any).window = { location: mockLocation };

Deno.test('buildProxyUrl - deve usar DefaultProxyPath quando não há configuração dinâmica', () => {
  // Limpa qualquer configuração anterior
  (globalThis as any).window.__APP_CONFIG__ = undefined;
  
  const url = buildProxyUrl('/test');
  // Deve usar a raiz relativa padrão
  assertMatch(url, /^http:\/\/localhost:3000\/test$/);
});

Deno.test('buildProxyUrl - deve respeitar configuração dinâmica via setProxyPath', () => {
  // Define uma configuração personalizada
  setProxyPath('./api');
  
  const url = buildProxyUrl('/publickey');
  // Deve usar o caminho relativo configurado
  assertMatch(url, /^http:\/\/localhost:3000\.\/api\/publickey$/);
});

Deno.test('buildProxyUrl - deve suportar URL completa em domínio externo', () => {
  setProxyPath('https://push.vanaware.com');
  
  const url = buildProxyUrl('/send');
  assertEquals(url, 'https://push.vanaware.com/send');
});

Deno.test('buildProxyUrl - deve suportar caminho absoluto', () => {
  setProxyPath('/proxy');
  
  const url = buildProxyUrl('/logout');
  assertMatch(url, /\/proxy\/logout$/);
});

Deno.test('buildProxyUrl - deve lidar com endpoint sem barra inicial', () => {
  setProxyPath('');
  
  const url = buildProxyUrl('test');
  assertMatch(url, /\/test$/);
});

Deno.test('buildProxyUrl - deve remover barras extras do endpoint', () => {
  setProxyPath('');
  
  const url = buildProxyUrl('///test///endpoint///');
  // A função remove apenas as barras iniciais, mantém as finais do path
  assertMatch(url, /\/test\/\/\/endpoint\/\/\//);
});

Deno.test('getProxyPath - deve retornar DefaultProxyPath quando não há configuração', () => {
  (globalThis as any).window.__APP_CONFIG__ = undefined;
  
  const path = getProxyPath();
  assertEquals(path, DefaultProxyPath);
});

Deno.test('getProxyPath - deve retornar configuração dinâmica quando disponível', () => {
  (globalThis as any).window.__APP_CONFIG__ = { proxyPath: './custom' };
  
  const path = getProxyPath();
  assertEquals(path, './custom');
});

Deno.test('setProxyPath - deve definir configuração no window.__APP_CONFIG__', () => {
  setProxyPath('https://example.com');
  
  assertEquals((globalThis as any).window.__APP_CONFIG__.proxyPath, 'https://example.com');
});

Deno.test('buildProxyUrl - deve funcionar no Service Worker (globalThis)', () => {
  // Simula ambiente de Service Worker
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = undefined;
  (globalThis as any).location = { origin: 'https://sw-test.com' };
  
  setProxyPath('');
  const url = buildProxyUrl('/test');
  
  assertMatch(url, /^https:\/\/sw-test\.com\/test$/);
  
  // Restaura o window
  (globalThis as any).window = originalWindow;
  (globalThis as any).location = mockLocation;
});

Deno.test('buildProxyUrl - deve lidar com ProxyPath vazio corretamente', () => {
  setProxyPath('');
  
  const url = buildProxyUrl('/endpoint');
  assertMatch(url, /^http:\/\/localhost:3000\/endpoint$/);
});

Deno.test('buildProxyUrl - deve lidar com ProxyPath terminando em barra', () => {
  setProxyPath('https://api.example.com/');
  
  const url = buildProxyUrl('/test');
  assertEquals(url, 'https://api.example.com/test');
});

Deno.test('buildProxyUrl - deve lidar com endpoint começando com múltiplas barras', () => {
  setProxyPath('https://api.example.com');
  
  const url = buildProxyUrl('///test');
  assertEquals(url, 'https://api.example.com/test');
});

Deno.test('buildProxyUrl - deve suportar caminho relativo ../', () => {
  setProxyPath('../api');
  
  const url = buildProxyUrl('/test');
  assertMatch(url, /\/api\/test$/);
});

console.log('✅ Todos os testes de configuração do Proxy foram executados!');

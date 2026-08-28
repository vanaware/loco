// tests/utils/config.test.ts
/// <reference lib="deno.ns" />
import { assertEquals, assertStringIncludes } from "@std/assert";
import { getAbsoluteProxyUrl, buildProxyUrl } from "../../../utils/src/config/proxy.ts";

// Helper para injetar um Mock do objeto `location` global (simulando o Browser no Deno)
function mockGlobalLocation(origin: string, pathname: string) {
  (globalThis as any).location = {
    origin,
    pathname,
  };
}

Deno.test("Config Utils - getAbsoluteProxyUrl respeita URLs absolutas informadas pelo contato", async () => {
  const urlDestinoExterna = "https://servidor-amigo.workers.dev";
  
  // Se o contato forneceu a URL absoluta do servidor dele, o sistema NÂO deve reescrever isso
  const result = await getAbsoluteProxyUrl(urlDestinoExterna);
  
  assertEquals(result, urlDestinoExterna, "Deve retornar a URL absoluta intacta");
});

Deno.test("Config Utils - getAbsoluteProxyUrl limpa barras duplicadas no final da URL absoluta", async () => {
  const urlSuja = "https://proxy-baguncado.com//";
  const result = await getAbsoluteProxyUrl(urlSuja);
  
  assertEquals(result, "https://proxy-baguncado.com", "Deve remover barras à direita (trailing slashes)");
});

Deno.test("Config Utils - getAbsoluteProxyUrl resolve rotas relativas baseado na origem atual do App", async () => {
  // Simulando que o App está rodando em "https://meu-loco-app.com/"
  mockGlobalLocation("https://meu-loco-app.com", "/");
  
  const rotaRelativaProxy = "/api";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  
  assertEquals(result, "https://meu-loco-app.com/api", "Deve concatenar a origem local com o caminho do proxy");
});

Deno.test("Config Utils - getAbsoluteProxyUrl entende quando o PWA é servido a partir de um subdiretório", async () => {
  // Simulando que o App está hospedado no Github Pages (subdiretório: /meu-repo/)
  mockGlobalLocation("https://usuario.github.io", "/meu-repo/index.html");
  
  const rotaRelativaProxy = "/push-handler";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  
  // Note que ele deve entender que "/meu-repo/" é a base, e ignorar o arquivo "index.html"
  assertEquals(result, "https://usuario.github.io/meu-repo/push-handler", "Deve respeitar o subdiretório de hospedagem");
});

Deno.test("Config Utils - buildProxyUrl monta a URI do endpoint corretamente", async () => {
  const proxyAbsoluto = "https://relay.loco.net";
  
  const urlPush = await buildProxyUrl("/push", proxyAbsoluto);
  const urlPing = await buildProxyUrl("ping", proxyAbsoluto); // Sem barra inicial para testar resiliência
  
  assertEquals(urlPush, "https://relay.loco.net/push");
  assertEquals(urlPing, "https://relay.loco.net/ping");
});
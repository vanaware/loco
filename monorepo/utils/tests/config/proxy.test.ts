/// <reference lib="deno.ns" />
import { assertEquals } from "@std/assert";
import { getAbsoluteProxyUrl, buildProxyUrl } from "@loco/utils/config";

function mockGlobalLocation(origin: string, pathname: string) {
  (globalThis as any).location = { origin, pathname };
}

Deno.test("Config Utils - getAbsoluteProxyUrl respeita URLs absolutas informadas pelo contato", async () => {
  const urlDestinoExterna = "https://servidor-amigo.workers.dev";
  const result = await getAbsoluteProxyUrl(urlDestinoExterna);
  assertEquals(result, urlDestinoExterna, "Deve retornar a URL absoluta intacta");
});

Deno.test("Config Utils - getAbsoluteProxyUrl limpa barras duplicadas no final da URL absoluta", async () => {
  const urlSuja = "https://proxy-baguncado.com//";
  const result = await getAbsoluteProxyUrl(urlSuja);
  assertEquals(result, "https://proxy-baguncado.com", "Deve remover barras à direita (trailing slashes)");
});

Deno.test("Config Utils - getAbsoluteProxyUrl resolve rotas relativas baseado na origem atual do App", async () => {
  mockGlobalLocation("https://meu-loco-app.com", "/");
  const rotaRelativaProxy = "/api";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  assertEquals(result, "https://meu-loco-app.com/api", "Deve concatenar a origem local com o caminho do proxy");
});

Deno.test("Config Utils - getAbsoluteProxyUrl entende quando o PWA é servido a partir de um subdiretório", async () => {
  mockGlobalLocation("https://usuario.github.io", "/meu-repo/index.html");
  const rotaRelativaProxy = "/push-handler";
  const result = await getAbsoluteProxyUrl(rotaRelativaProxy);
  assertEquals(result, "https://usuario.github.io/meu-repo/push-handler", "Deve respeitar o subdiretório de hospedagem");
});

Deno.test("Config Utils - buildProxyUrl monta a URI do endpoint corretamente", async () => {
  const proxyAbsoluto = "https://relay.loco.net";
  const urlPush = await buildProxyUrl("/push", proxyAbsoluto);
  const urlPing = await buildProxyUrl("ping", proxyAbsoluto);
  assertEquals(urlPush, "https://relay.loco.net/push");
  assertEquals(urlPing, "https://relay.loco.net/ping");
});
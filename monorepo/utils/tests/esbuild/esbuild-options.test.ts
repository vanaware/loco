/// <reference lib="deno.ns" />

import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildEsbuildOptions } from "../../src/esbuild/mod.ts";

import type { TargetConfig } from "../../src/interfaces/mod.ts";

// Helper para criar config mínimo válida
function makeConfig(overrides: Partial<TargetConfig> = {}): TargetConfig {
  return {
    srcdir: "src",
    distdir: "dist",
    entryPoints: ["src/main.tsx"],
    ...overrides,
  };
}

describe("buildEsbuildOptions", () => {
  describe("configuração básica", () => {
    it("usa outfile quando definido", async () => {
      const config = makeConfig({ outfile: "dist/app.js" });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.outfile, "dist/app.js");
      assertEquals(options.outdir, undefined);
    });

    it("usa distdir como outdir quando outfile não definido", async () => {
      const config = makeConfig({ distdir: "monorepo/dist" });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.outdir, "monorepo/dist");
      assertEquals(options.outfile, undefined);
    });

    it("entryPoints é sempre preservado", async () => {
      const config = makeConfig({ entryPoints: ["a.ts", "b.ts"] });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.entryPoints, ["a.ts", "b.ts"]);
    });
  });

  describe("propriedades opcionais", () => {
    it("inclui platform quando definido", async () => {
      const config = makeConfig({ platform: "browser" });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.platform, "browser");
    });

    it("omite propriedades undefined", async () => {
      const config = makeConfig();
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.platform, undefined);
      assertEquals(options.minify, undefined);
    });

    it("inclui todas as propriedades configuradas", async () => {
      const config = makeConfig({
        platform: "browser",
        format: "esm",
        bundle: true,
        minify: true,
        sourcemap: "linked",
        target: "es2022",
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.platform, "browser");
      assertEquals(options.format, "esm");
      assertEquals(options.bundle, true);
      assertEquals(options.minify, true);
      assertEquals(options.sourcemap, "linked");
      assertEquals(options.target, "es2022");
    });
  });

  describe("define", () => {
    it("injeta __APP_VERSION__ com v", async () => {
      const config = makeConfig();
      const options = await buildEsbuildOptions("ui", config, "1.2.3-abc");
      assertEquals(options.define.__APP_VERSION__, '"v1.2.3-abc"');
    });

    it("preserva defines customizados do config", async () => {
      const config = makeConfig({
        define: {
          "__FEATURE_X__": "true",
          "__API_URL__": '"https://api.example.com"',
        },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.define.__FEATURE_X__, "true");
      assertEquals(options.define.__API_URL__, '"https://api.example.com"');
      assertEquals(options.define.__APP_VERSION__, '"v1.0.0"');
    });
  });

  describe("banner e footer", () => {
    it("substitui __APP_VERSION__ no banner", async () => {
      const config = makeConfig({
        banner: {
          js: "/* Loco v__APP_VERSION__ */\n",
        },
      });
      const options = await buildEsbuildOptions("ui", config, "2.0.0");
      assertStringIncludes(options.banner.js, "Loco v2.0.0");
    });

    it("substitui múltiplas ocorrências de __APP_VERSION__", async () => {
      const config = makeConfig({
        banner: {
          js: "/* __APP_VERSION__ build __APP_VERSION__ */",
        },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      // Substituição global
      assertEquals(options.banner.js.includes("__APP_VERSION__"), false);
    });

    it("substitui __APP_VERSION__ no CSS também", async () => {
      const config = makeConfig({
        banner: {
          css: "/* CSS __APP_VERSION__ */",
        },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertStringIncludes(options.banner.css, "CSS 1.0.0");
    });

    it("substitui __APP_VERSION__ no footer", async () => {
      const config = makeConfig({
        footer: {
          js: "/* End __APP_VERSION__ */",
        },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertStringIncludes(options.footer.js, "End 1.0.0");
    });

    it("lida com banner sem js", async () => {
      const config = makeConfig({
        banner: { css: "/* css only __APP_VERSION__ */" },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.banner.js, undefined);
      assertStringIncludes(options.banner.css, "1.0.0");
    });
  });

  describe("lógica especial para SW", () => {
    it("injeta __GENERATED_ASSETS__ quando targetName é 'sw'", async () => {
      const config = makeConfig();
      const mockListFn = async () => ["./app.js", "./index.html"];

      const options = await buildEsbuildOptions("sw", config, "1.0.0", mockListFn);

      const assets = JSON.parse(options.define.__GENERATED_ASSETS__);
      assertEquals(assets, ["./app.js", "./index.html"]);
    });

    it("não injeta __GENERATED_ASSETS__ para outros alvos", async () => {
      const config = makeConfig();
      const mockListFn = async () => ["./app.js"];

      const options = await buildEsbuildOptions("ui", config, "1.0.0", mockListFn);

      assertEquals(options.define.__GENERATED_ASSETS__, undefined);
    });

    it("não injeta __GENERATED_ASSETS__ se listFn não fornecida", async () => {
      const config = makeConfig();
      const options = await buildEsbuildOptions("sw", config, "1.0.0");
      assertEquals(options.define.__GENERATED_ASSETS__, undefined);
    });
  });

  describe("novas opções (1-13)", () => {
    it("inclui splitting", async () => {
      const config = makeConfig({ splitting: true });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.splitting, true);
    });

    it("inclui loader customizado", async () => {
      const config = makeConfig({
        loader: { ".png": "file", ".svg": "dataurl" },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.loader[".png"], "file");
    });

    it("inclui alias", async () => {
      const config = makeConfig({
        alias: { "@": "./src", "moment": "dayjs" },
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.alias["@"], "./src");
      assertEquals(options.alias.moment, "dayjs");
    });

    it("inclui inject", async () => {
      const config = makeConfig({
        inject: ["./polyfills.ts"],
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.inject, ["./polyfills.ts"]);
    });

    it("inclide target como string", async () => {
      const config = makeConfig({ target: "es2022" });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.target, "es2022");
    });

    it("inclui target como array", async () => {
      const config = makeConfig({ target: ["es2022", "chrome90"] });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.target, ["es2022", "chrome90"]);
    });

    it("inclui drop", async () => {
      const config = makeConfig({ drop: ["console", "debugger"] });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.drop, ["console", "debugger"]);
    });

    it("inclui pure", async () => {
      const config = makeConfig({ pure: ["console.log"] });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.pure, ["console.log"]);
    });

    it("inclui logLevel", async () => {
      const config = makeConfig({ logLevel: "warning" });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.logLevel, "warning");
    });

    it("inclui entryNames/chunkNames/assetNames", async () => {
      const config = makeConfig({
        entryNames: "[name]-[hash]",
        chunkNames: "chunks/[name]",
        assetNames: "assets/[name]",
      });
      const options = await buildEsbuildOptions("ui", config, "1.0.0");
      assertEquals(options.entryNames, "[name]-[hash]");
      assertEquals(options.chunkNames, "chunks/[name]");
      assertEquals(options.assetNames, "assets/[name]");
    });
  });
});
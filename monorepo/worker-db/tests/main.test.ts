import { assertEquals } from "@std/assert";

if (typeof Deno !== "undefined") {
  Deno.env.set("USE_FAKE", "true");
}

import { db } from "../src/mod.ts";

Deno.test({
  name: "Deve suportar _id e as funções em lote getSome, delSome, setSome e query",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await db.clear();

    const loja = db("LOJA", "produtos", "PROD_");
    
    await loja.setMany([
      ["001", { nome: "Lápis", preco: 2, ativo: true }],
      ["002", { nome: "Borracha", preco: 3, ativo: false }],
      ["003", { nome: "Caderno", preco: 15, ativo: true }],
      ["004", { nome: "Mochila", preco: 150, ativo: true }],
    ]);

    // 1. QUERY
    const activeCount = await loja.query<{ preco: number, ativo: boolean }, number>(
      (items) => items.filter(i => i.ativo).length
    );
    assertEquals(activeCount, 3);

    // 2. GET_SOME (Verifica _id injetado)
    const caros = await loja.getSome<{ preco: number, nome: string }>(
      (items) => items.filter(i => i.preco > 10).toSorted((a, b) => b.preco - a.preco)
    );
    assertEquals(caros.length, 2);
    assertEquals(caros[0]?.nome, "Mochila");
    assertEquals(caros[0]?._id, "004");

    // 3. SET_SOME
    await loja.setSome<{ preco: number, ativo: boolean, nome: string }>(
      (items) => items.filter(i => i.ativo),
      (item) => ({ ...item, preco: item.preco * 1.1 })
    );
    
    const lapisAtt = await loja.get<{ preco: number }>("001");
    assertEquals(lapisAtt?.preco, 2.2);

    // 4. DEL_SOME
    await loja.delSome<{ ativo: boolean }>(
      (items) => items.filter(i => i.ativo === false)
    );

    const remainingKeys = await loja.keys();
    assertEquals(remainingKeys.length, 3);
    
    db.terminate();
  },
});
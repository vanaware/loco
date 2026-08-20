import { assertEquals } from "jsr:@std/assert@1.0.0";

function getLayoutClasses(selectedChatId: string | null) {
  const masterClasses = selectedChatId ? "m4 l3 m l" : "s12 m4 l3";
  const detailClasses = selectedChatId ? "s12 m8 l9" : "m8 l9 m l";
  return { masterClasses, detailClasses };
}

Deno.test("Master-Detail - Seleção Ativa: Master oculta no mobile e Detail 100%", () => {
  const { masterClasses, detailClasses } = getLayoutClasses("chat_123");

  assertEquals(masterClasses.includes("m l"), true);
  assertEquals(masterClasses.includes("s12"), false);

  assertEquals(detailClasses.includes("s12"), true);
});

Deno.test("Master-Detail - Sem Seleção: Master 100% no mobile e Detail oculta", () => {
  const { masterClasses, detailClasses } = getLayoutClasses(null);

  assertEquals(masterClasses.includes("s12"), true);

  assertEquals(detailClasses.includes("m l"), true);
  assertEquals(detailClasses.includes("s12"), false);
});
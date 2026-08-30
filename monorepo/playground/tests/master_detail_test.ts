import { assertEquals } from "@std/assert";
import { signal } from "@preact/signals";

// Auxiliar de geração de classes idêntico ao utilitário da UI
function getMasterClasses(selectedId: string | null): string {
  return `col ${selectedId ? "m4 l3 m l" : "s12 m4 l3"} surface border-right`;
}

function getDetailClasses(selectedId: string | null): string {
  return `col ${selectedId ? "s12 m8 l9" : "m8 l9 m l"} surface-container-lowest`;
}

Deno.test("MasterDetail - Estado Inicial sem Chat Selecionado", () => {
  const selectedChatId = signal<string | null>(null);

  const masterClass = getMasterClasses(selectedChatId.value);
  const detailClass = getDetailClasses(selectedChatId.value);

  // Painel Master deve ter a classe 's12' para ocupar 100% no mobile
  assertEquals(masterClass.includes("s12"), true);
  assertEquals(masterClass.includes("m l"), false);

  // Painel Detail deve ter as classes 'm l' para ficar OCULTO no mobile
  assertEquals(detailClass.includes("m l"), true);
  assertEquals(detailClass.includes("s12"), false);
});

Deno.test("MasterDetail - Seleção de Chat Ativo", () => {
  const selectedChatId = signal<string | null>("chat_123");

  const masterClass = getMasterClasses(selectedChatId.value);
  const detailClass = getDetailClasses(selectedChatId.value);

  // Painel Master deve conter 'm l' para ser OCULTO no mobile
  assertEquals(masterClass.includes("m l"), true);
  assertEquals(masterClass.includes("s12"), false);

  // Painel Detail deve conter 's12' para ocupar 100% no mobile
  assertEquals(detailClass.includes("s12"), true);
  assertEquals(detailClass.includes("m l"), false);
});

Deno.test("MasterDetail - Retorno à Lista de Conversas", () => {
  const selectedChatId = signal<string | null>("chat_123");

  // Simula clique no botão de voltar (limpa a seleção)
  selectedChatId.value = null;

  const masterClass = getMasterClasses(selectedChatId.value);
  
  assertEquals(masterClass.includes("s12"), true);
  assertEquals(masterClass.includes("m l"), false);
});
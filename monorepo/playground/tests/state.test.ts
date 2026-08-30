import { assertEquals } from "@std/assert";
import { signal, computed } from "@preact/signals-core"; // Usando core apenas para teste de lógica isolada

Deno.test("Estado global: Fila de mensagens deve calcular pendências corretamente", () => {
  type Message = { id: string; status: "pending" | "synced" };
  
  const messages = signal<Message[]>([]);
  const pendingCount = computed(() => messages.value.filter(m => m.status === "pending").length);

  // Inicial
  assertEquals(pendingCount.value, 0);

  // Adiciona mensagem pendente
  messages.value = [...messages.value, { id: "1", status: "pending" }];
  assertEquals(pendingCount.value, 1);

  // Simula Handshake de Sincronização
  messages.value = messages.value.map(m => ({ ...m, status: "synced" }));
  assertEquals(pendingCount.value, 0);
});
import { assertEquals } from "jsr:@std/assert@1.0.0";
import { signal, computed } from "@preact/signals";

Deno.test("Subcomponentes - Fluxo de Dados entre Signals e Active Contact", () => {
  const selectedChatId = signal<string | null>(null);
  const mockContacts = [
    { id: "1", name: "Alice", avatar: "", lastMessage: "", time: "", unreadCount: 0, online: true },
    { id: "2", name: "Bob", avatar: "", lastMessage: "", time: "", unreadCount: 0, online: false }
  ];

  const activeContact = computed(() =>
    mockContacts.find((c) => c.id === selectedChatId.value) || null
  );

  assertEquals(activeContact.value, null);

  selectedChatId.value = "1";
  assertEquals(activeContact.value?.name, "Alice");

  selectedChatId.value = "2";
  assertEquals(activeContact.value?.name, "Bob");
});
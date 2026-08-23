# 📦 Loco PWA - Worker DB (Data Layer)

O **Worker DB** é o coração da persistência de dados *Offline-First* do Loco PWA. Ele provê uma interface unificada, escalável e de altíssima performance para acessar o **IndexedDB**, **LocalStorage** e **OPFS** (Origin Private File System), garantindo que a Interface de Usuário (UI) nunca seja bloqueada por operações pesadas de leitura/escrita.

## 🏗️ Arquitetura e Conceitos Core

1. **Multithreading (Web Workers):** Operações no IndexedDB na Main Thread podem causar *jank* (quedas de FPS) na UI do Preact ao lidar com arrays gigantes de mensagens. O pacote principal atua como uma ponte (Proxy) via `postMessage`, enviando todo o trabalho pesado de I/O e processamento de arrays para um Web Worker dedicado (`worker-db.js`).
2. **Isolamento por Prefixos:** Diferentes módulos do PWA podem compartilhar a mesma Object Store ou LocalStorage sem colidir, utilizando o conceito de instâncias com prefixo (ex: `LOCO_AUTH_` vs `LOCO_PREF_`).
3. **Geração Automática de IDs:** Delegação total da criação de chaves UUID e Hashes diretamente para a engine de banco de dados, suportando o comando explícito `_id: "auto"` dentro do objeto ou como chave primária `set("auto", {...})`.

---

## 🚀 Como Utilizar nos Diferentes Ambientes

A principal regra arquitetural deste módulo é **utilizar o import correto para o ambiente em que o código está rodando**.

### 1. No Frontend (Browser / Main Thread)
Para componentes da UI, páginas e rotinas normais do navegador, importe os utilitários de `src/mod.ts`. Ele garante que tudo rode no Web Worker.

> 💡 **Exemplo prático:** Veja o arquivo `example/main.ts` para uma demonstração interativa completa rodando no navegador.

```ts
import { db, ls } from "@loco/worker-db/mod.ts";

// 1. Inicializa a conexão com o Web Worker (obrigatório na carga do app)
db.init();

// 2. Instancia Storages isolados
const prefStore = ls("LOCO_PREF_"); // Síncrono (LocalStorage)
const msgStore = db("LOCO_DATA", "messages", "MSG_"); // Assíncrono (IndexedDB via Worker)

// 3. Operações de CRUD com ID automático
const newKey = await msgStore.set("auto", { content: "Olá Mundo!", status: "pending" });
const myMsg = await msgStore.get(newKey);

```

### 2. No Service Worker (Background Sync / Handshakes)

O Service Worker **já é uma background thread** e não pode instanciar Web Workers filhos. Para interagir com o IndexedDB mantendo a mesma API e regras de negócio, utilize o `src/db-sw.ts`.

```ts
// ⚠️ Uso EXCLUSIVO dentro do sw.ts (Service Worker)
import { db } from "@loco/worker-db/db-sw.ts";

self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-messages') {
    const msgStore = db("LOCO_DATA", "messages", "MSG_");
    const pendentes = await msgStore.getSome(items => items.filter(i => i.status === "pending"));
    // Realiza o Handshake com o servidor...
  }
});

```

### 3. Nos Testes Unitários e CI/CD (Deno)

O ambiente nativo do Deno (terminal) não possui IndexedDB ou OPFS. Para rodar testes automatizados simulando a memória real do navegador com fidelidade, utilize o `src/fake/fake-mod.ts`.

```ts
import { db, ls } from "../src/fake/fake-mod.ts";
import { assertEquals } from "@std/assert";

Deno.test("Deve isolar instâncias por prefixo", async () => {
  const storeA = db("SHARED", "keyval", "APP_A_");
  const storeB = db("SHARED", "keyval", "APP_B_");
  await storeA.set("config", { theme: "dark" });
  await storeB.set("config", { theme: "light" });
  // storeA não enxerga os dados de storeB!
});

```

---

## 🧠 Funções Avançadas e Computação Remota

O verdadeiro diferencial arquitetural do Worker DB reside na capacidade de realizar **computação na borda da memória do banco**. Evitamos o imenso custo de "clonar" (Structured Clone) milhares de registros da thread do Worker para a Main Thread apenas para contar, ordenar ou filtrar itens.

### 1. `query(fn)` - Análises e Agregações Remotas

Executa o callback injetado *dentro* da thread do Worker (ou SW). Retorna apenas o resultado final computado, zerando gargalos de transferência de memória.

* **Diferencial:** Permite usar funções nativas de Array JS (`reduce`, `toSorted`, `findLast`) diretamente nos dados brutos.

```ts
// Exemplo real retirado de testes avançados:
const stats = await msgStore.query((items) => {
  return {
    totalPending: items.filter(i => i.status === "pending").length,
    highestPriorityPending: items
      .filter(i => i.status === "pending")
      .toSorted((a, b) => b.priority - a.priority)[0], // toSorted do ES2023 no Worker!
    hasUrgent: items.some(i => i.priority >= 5),
    oldestMessage: items.reduce((oldest, curr) => curr.timestamp < oldest.timestamp ? curr : oldest)
  };
});

```

### 2. `setSome(selectFn, updateFn)` - Mutações em Lote Condicionais

Busca, altera e salva múltiplos registros baseados em uma condição lógica com uma única chamada, sem transitar arrays pela ponte de comunicação.

* **Diferencial:** Excelente para transições de Máquina de Estados (ex: marcar de `pending` para `sent` em lote) e para Ofuscação/Criptografia massiva.

```ts
// Altera mensagens pendentes: sobe o status e simula uma encriptação
await msgStore.setSome(
  (items) => items.filter((m) => m.status === "pending"),
  (item) => ({ 
    ...item, 
    status: "sent",
    content: `[ENCRIPTADO_E2EE]` 
  })
);

```

### 3. `delSome(fn)` - Garbage Collection Inteligente

Deleta múltiplos registros que correspondam a uma regra de negócio de forma atômica.

* **Diferencial:** Ideal para rotinas silenciosas de limpeza de dados efêmeros ou invalidação de sessões expiradas.

```ts
// Remove silenciosamente mensagens que já foram lidas
await msgStore.delSome((items) => items.filter(m => m.status === "read"));

```

### 4. `backupToOpfs` e `restoreFromOpfs` - Persistência Nativa

Integração direta com o **Origin Private File System**, lendo e escrevendo os dados do IndexedDB no disco real da máquina do usuário em velocidades nativas de C++.

* **Diferencial:** O método varre o IndexedDB, filtra pelo prefixo da instância atual, constrói um JSON gigante e cria um arquivo isolado na pasta `/backup` do OPFS sem bloquear a interface de usuário em nenhum momento.

```ts
// Faz o backup total da instância e retorna o nome gerado (ex: db_LOCO_DATA_messages_MSG__backup.json)
const fileName = await msgStore.backupToOpfs("meu_backup_seguro.json");

// Restaura os dados lendo direto do disco
await msgStore.restoreFromOpfs(fileName, true); // true = limpa a base atual antes de importar

```

---

## 🤖 DIRETRIZES PARA IAs E DESENVOLVEDORES (ENGINEERING HANDBOOK)

Ao estender o Loco PWA ou criar novos fluxos lógicos, o agente (Humano ou IA) deve observar rigorosamente as restrições abaixo:

### A Regra das Threads e Importações

Para manter a UI em 60 FPS e a arquitetura coesa, o entrypoint define o motor de execução:

* **Frontend (Preact/UI):** Importe de `src/mod.ts`. (Usa Web Worker + postMessage).
* **Testes (Deno):** Importe de `src/fake/fake-mod.ts`. (Usa injeção global de Polyfills IndexedDB/OPFS).
* **Service Worker (Background):** Importe de `src/db-sw.ts`. (Usa idb-keyval direto na própria thread).

### A Filosofia do ID Automático

Nunca force o Frontend a gerar UUIDs importando bibliotecas de crypto antes de salvar. Ao inserir novos dados, delegue a responsabilidade ao Worker utilizando a chave explícita `"auto"` ou o atributo `_id: "auto"`:

* O comando `await db("...").set("auto", { data: 123 })` garante que o Worker DB cuidará da verificação da `WebCrypto API`, gerará um UUID seguro, aplicará os prefixos corretamente e retornará a string formatada pronta para uso.


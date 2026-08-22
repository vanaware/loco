Aqui está a documentação completa do pacote `worker-db` no padrão exigido pelo projeto Loco.

# 📦 @loco/worker-db

Módulo isolado de banco de dados baseado em **Web Worker** e **IndexedDB** (`idb-keyval`). Projetado para desacoplar totalmente a persistência e o processamento de dados da thread principal (UI) da aplicação PWA[cite: 1].

---

## 🚀 Recursos

- **Thread Isolada:** Operações de I/O e manipulação do IndexedDB executadas fora da Main Thread para manter 60 FPS.
- **Proxy Assíncrono (`mod.ts`):** Interface limpa baseada em `Promises` com suporte a operações unitárias, em lote e coleções[cite: 1].
- **Suporte a FakeDB:** Injeção automática de `fake-indexeddb` em memória para testes e prototipagem offline[cite: 1].
- **Gestão de Ciclo de Vida:** Funções para inicialização (`init`), reinicialização (`restart`) e finalização (`terminate`) da thread do Worker[cite: 1].
- **Resiliência:** Tratamento de erros graves com recriação automática da thread caso o Worker venha a falhar[cite: 1].

---

## 📁 Estrutura do Pacote

- `src/mod.ts`: Ponto de entrada consumido pela aplicação (Main Thread). Gerencia a instância do Worker e expõe o objeto `db`[cite: 1].
- `src/main.ts`: Código que roda dentro do Web Worker. Executa os comandos CRUD chamando o `idb-keyval`[cite: 1].
- `src/config.ts`: Central de configurações e verificação do ambiente (Browser vs Deno CLI)[cite: 1].
- `build.ts`: Script de compilação que gera o bundle otimizado em `build/worker-db.js`[cite: 1].
- `tests/main.test.ts`: Testes automatizados executados via Deno CLI em modo FakeDB[cite: 1].

---

## 🛠️ Como Utilizar

Importe o objeto `db` exportado por `src/mod.ts` para interagir com o banco de dados[cite: 1]:

```typescript
import { db } from "./src/mod.ts";

// 🔹 Operações Unitárias
await db.set("user_1", { name: "Alice", role: "Dev" });
const user = await db.get<{ name: string; role: string }>("user_1");

// 🔹 Atualização Atômica na Main Thread (evita falhas de clonagem de funções)
await db.update<{ name: string; role: string }>("user_1", (prev) => ({
  ...prev!,
  role: "Lead Dev"
}));

// 🔹 Operações em Lote (Batch)
await db.setMany([
  ["settings_theme", "dark"],
  ["settings_lang", "pt-BR"]
]);

// 🔹 Consultas e Coleções
const allKeys = await db.keys();
const allValues = await db.values();

// 🔹 Limpeza de Dados
await db.clear();

// 🔹 Controle de Ciclo de Vida
db.restart();   // Reinicia a thread do Worker
db.terminate(); // Encerra o Worker e libera recursos

// 🔹 Operações de uso prático:
import { db, gerarIdComPrefixo } from "./worker-db/src/mod.ts";

// Opção A: Usando a fábrica isolada por banco
const userStore = db.forDB("USUARIOS_DB");

const userId = gerarIdComPrefixo("USER"); // "USER:a1b2c3d4e5f6"
await userStore.set(userId, { name: "Carlos", email: "carlos@email.com" });

const user = await userStore.get(userId);
const allUsers = await userStore.getByPrefix("USER:");

// Opção B: Passando a opção de banco diretamente
await db.set("CONFIG:THEME", "dark", { dbName: "CONFIGS_DB" });

```

---

## 🧪 Comandos de Build e Teste

Os comandos são gerenciados pelas tarefas declaradas no `deno.jsonc`:

| Comando | Descrição |
| --- | --- |
| `deno task build` | Compila o arquivo `src/main.ts` gerando o bundle ESM em `build/worker-db.js`.

 |
| `deno task test` | Executa o build e roda a suíte de testes com a flag `USE_FAKE_DB` ativa.

 |
| `deno task check` | Executa a verificação estática de tipos nos arquivos do módulo.

 |

---

## ⚙️ Alternância de Banco (Fake vs Real)

A seleção do banco é controlada dinamicamente pelo `src/config.ts`:

1. **Em ambiente de testes / CLI:** A variável de ambiente `USE_FAKE_DB="true"` força o uso do `fake-indexeddb`.


2. **No navegador (desenvolvimento/protótipo):** Por padrão, a propriedade `USE_FAKE_DB` no `config.ts` é definida como `true`. Para chavear para o IndexedDB real do navegador, altere esse valor para `false`.

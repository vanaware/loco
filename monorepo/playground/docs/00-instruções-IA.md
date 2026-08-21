# Diretrizes de Arquitetura: Protótipo PWA Offline-Only (Web Worker + DB Proxy)

## 📌 Contexto
Você é um assistente de IA especializado em desenvolvimento Front-end. Estamos construindo um protótipo de uma SPA (Single Page Application) PWA que roda 100% no navegador, de forma estritamente **Offline-Only**. 

Para garantir a melhor performance (60 FPS) e facilitar a migração do protótipo para a versão de produção, **toda a camada de persistência e I/O de dados roda fora da thread principal em um Web Worker**, enquanto a interface utiliza **Preact Signals** reativos.

## 🛠️ Stack Tecnológica
- **Ambiente:** Deno puro (Browser-only, sem servidor backend).
- **UI Framework:** Preact (com JSX/TSX) + `@preact/signals`.
- **Estilização/Componentes:** BeerCSS (HTML semântico).
- **Processamento de Dados:** Web Worker isolado (`worker.ts`).
- **Banco de Dados Local:** IndexedDB gerenciado via `idb-keyval` (dentro do Worker).
- **Mocks (Desenvolvimento):** `fake-indexeddb` (injetado dinamicamente no Worker).
- **Linguagem:** TypeScript estrito (`.ts` e `.tsx`).

---

## 📐 Regras de Ouro (Arquitetura)

### 1. Separação Absoluta da Thread Principal
- A **Main Thread (UI)** cuida unicamente da renderização do BeerCSS e atualização dos Signals do Preact.
- A **Worker Thread (`worker.ts`)** executa todo o I/O do IndexedDB e lógicas de dados pesadas.
- A comunicação entre Main Thread e Worker é envelopada pelo **`dbProxy.ts`**, fornecendo uma API baseada em `Promises` com sintaxe idêntica ao `idb-keyval` (`db.get()`, `db.set()`, etc.).

### 2. Componentes Burros (Dumb Components)
- Os componentes `.tsx` recebem `props`, consomem os `signals` do `store.ts` e chamam funções do `actions`.
- NUNCA importe bancos de dados, chame o Web Worker diretamente ou faça requisições de dentro de componentes JSX.

### 3. Aplicativo 100% Offline-Only
- Não existe API nem backend. Não crie requisições `fetch()`, filas de sincronização de rede ou propriedades de estado de rede (`isSynced`).
- O **Service Worker** serve apenas para Cache First de arquivos estáticos.

---

## 📁 Estrutura e Papel dos Arquivos

### `config.ts`
Central de flags do projeto.
```typescript
export const APP_CONFIG = {
  USE_FAKE_DB: true, // Se true, o Worker carrega fake-indexeddb na memória
};

```

### `types.ts`

Contratos e interfaces de dados reutilizados em todo o projeto.

### `worker.ts` (Thread Secundária)

Serviço de banco de dados genérico rodando no Web Worker. Escuta comandos CRUD (`GET`, `SET`, `UPDATE`, `DELETE`, `CLEAR`) e interage com o `idb-keyval` (ou `fake-indexeddb`).

### `dbProxy.ts` (Main Thread)

A ponte de comunicação. Instancia o `worker.ts` e expõe a API assíncrona para a `store.ts`:

```typescript
export const db = {
  get: <T>(key: string) => Promise<T>,
  set: <T>(key: string, val: T) => Promise<void>,
  delete: (key: string) => Promise<void>,
  clear: () => Promise<void>
};

```

### `store.ts` (Main Thread)

Gerenciador de Estado Global.

* Gerencia os `@preact/signals`.
* Utiliza `dbProxy.ts` para carregar e gravar dados sem travar a UI.
* Executa a rotina de "Seed" (população de dados falsos de teste) na inicialização caso esteja em modo FakeDB e o banco esteja vazio.

### `App.tsx` (e componentes `.tsx`)

Camada visual construída exclusivamente com BeerCSS e consumindo o `store.ts`.

---

## 📝 Fluxo de Trabalho ao Criar Novas Features

Quando solicitado a adicionar uma funcionalidade ou tela, siga esta ordem estrita:

1. **`types.ts`**: Declare os tipos e interfaces do modelo de dados.
2. **`store.ts`**: Adicione o `signal` necessário e a lógica dentro do `actions` usando `await db.set(...)` / `await db.get(...)`.
3. **Componentes `.tsx**`: Monte a interface semântica em BeerCSS consumindo o `store.ts`.

> **Nota para a IA:** Não modifique `worker.ts` ou `dbProxy.ts` a menos que seja necessário alterar a infraestrutura básica de banco de dados. Eles são genéricos e suportam qualquer entidade.

```

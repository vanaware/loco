# 🧠 Gerenciamento de Estado no Loco — Especificação Técnica

O **Loco** adota uma arquitetura de estado reativa e descentralizada baseada em **Preact Signals** (`@preact/signals`), combinada com persistência local não-bloqueante via **IndexedDB** (`idb-keyval`) e **OPFS (Origin Private File System)**.

---

## 1. Visão Geral e Filosofia

Para garantir alta performance (60 FPS em dispositivos móveis) e separação estrita de responsabilidades, o estado da aplicação é dividido em duas camadas principais:

1. **Estado de Interface (UI Signals):** Mantido em `src/signals/state.ts`, controla a navegação entre visões, alternância de seções, responsividade mobile e depuração.
2. **Estado de Negócio e Dados (Modular Stores):** Mantido no diretório `src/stores/`, abstrai a reatividade das entidades principais (Perfil, Contatos e Mensagens) e sincroniza automaticamente as alterações com o IndexedDB.

---

## 2. Signals de UI Globais (`src/signals/state.ts`)

Os Signals globais de interface gerenciam o fluxo visual da aplicação SPA (Single Page Application):

```typescript
import { signal } from "@preact/signals";

// Seção visível na SPA ('chat' | 'contatos' | 'contato-detalhe' | 'profile' | 'advanced')
export const currentSection = signal<SectionType>("chat");

// Hash SHA-256 da chave pública do contato em exibição na timeline
export const selectedContactHash = signal<string | null>(null);

// Alternador de visualização para dispositivos móveis ('list' | 'chat' | 'detail')
export const mobileView = signal<MobileViewType>("list");

// Coleção reativa de logs consumida pelo DebugPanel.tsx
export const logs = signal<LogEntry[]>([]);
```

---

## 3. Estrutura Modular de Stores (`src/stores/`)

Diferente de arquiteturas legadas com arquivos monolíticos, a lógica de negócios e persistência do Loco é organizada em stores especializados:

```text
src/stores/
├── index.ts              # Orquestrador global de inicialização (initStores)
├── profileStore.ts       # Gerencia o Perfil Local, Chaves VAPID e E2E
├── contatosStore.ts      # Gerencia a Agenda e o Ciclo de Confiança ('me' / 'trusted')
└── mensagensStore.ts     # Gerencia as Timelines de Envio e Recebimento
```

### A. Perfil Store (`src/stores/profileStore.ts`)
* **Signal Exposto:** `profile = signal<ProfileConfig | null>(null)`
* **Responsabilidade:** Mantém as chaves criptográficas (`VAPID ECDSA` e `RSA-OAEP`), foto de perfil em Base64, subscrição Web Push e o `vapidPrivateKeyEnvelope`.
* **Persistência:** Armazenado sob a chave `"profile"` no banco `AppConfig_DB`.

### B. Contatos Store (`src/stores/contatosStore.ts`)
* **Signal Exposto:** `contatosMap = signal<Map<string, Contato>>(new Map())`
* **Responsabilidade:** Mantém a lista de contatos indexada pelo Hash SHA-256 da `vapidPublicKey`. Gerencia o estado de confiança mútua (`me` e `trusted`).
* **Persistência:** Cada contato é gravado como um registro individual no banco `BrowserB_Contatos_DB`.

### C. Mensagens Store (`src/stores/mensagensStore.ts`)
* **Signals Expostos:**
  * `mensagensEnviadasMap = signal<Map<string, MensagemEnviada>>(new Map())`
  * `mensagensRecebidasMap = signal<Map<string, MensagemRecebida>>(new Map())`
* **Responsabilidade:** Controla a timeline de cada conversa, marcas de entrega (`✓` enviado, `✓✓` entregue/lido) e carimbos de data/hora.
* **Persistência:** Dividido entre os bancos `BrowserA_MensagensEnviadas_DB` e `BrowserB_MensagensRecebidas_DB`.

---

## 4. Inicialização do Sistema (`initStores()`)

Ao abrir o aplicativo, o ponto de entrada (`src/app.tsx`) invoca a função `initStores()` em `src/stores/index.ts`. O carregamento ocorre de forma assíncrona antes da renderização da interface:

```typescript
export async function initStores(): Promise<void> {
  // 1. Carrega dados do Perfil e Chaves Criptográficas
  await loadProfile();

  // 2. Carrega a Lista de Contatos e Chaves Públicas
  await loadContatos();

  // 3. Carrega o Histórico de Mensagens Enviadas e Recebidas
  await loadMensagens();
}
```

---

## 5. Persistência Estruturada no IndexedDB (`src/utils/db-helpers.ts`)

O Loco proíbe o uso de `localStorage` para evitar bloqueios síncronos na thread principal do navegador. Todos os dados estruturados utilizam o IndexedDB através do utilitário `idb-keyval` em bancos de dados isolados (`DB_NAMES`):

| Banco de Dados (`DB_NAMES`) | Chave Primária | Entidade Armazenada | Finalidade |
| :--- | :--- | :--- | :--- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil local, pares de chaves e subscrição Push. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (`vapidPublicKey`) | `Contato` | Agenda de contatos, chaves E2E e estado de confiança (`me` / `trusted`). |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico de mensagens recebidas e timestamps de leitura. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Histórico e fila de envio de mensagens com status do ciclo de vida. |
| `Handshake_DB` | ID do Handshake (`jti`) | `Handshake` | Fila assíncrona da Máquina de Estados (fluxos `in` e `out`). |

---

## 6. Padrão de Mutação e Reatividade de Signals

Para garantir que o Preact Signals detecte alterações em coleções como `Map` e force a re-renderização dos componentes dependentes, os stores utilizam **imobilidade por substituição de referência**:

```typescript
// Exemplo de atualização reativa em contatosStore.ts
export async function saveContato(contato: Contato): Promise<void> {
  // 1. Grava no IndexedDB
  await dbSet(DB_NAMES.CONTATOS, contato.hash, contato);

  // 2. Cria uma nova instância de Map para disparar a reatividade do Signal
  const novoMap = new Map(contatosMap.value);
  novoMap.set(contato.hash, contato);
  contatosMap.value = novoMap;
}
```

---

## 7. Divisão de Responsabilidades: IndexedDB vs. OPFS

```text
                               +----------------------------+
                               |     Recursos de Dados      |
                               +--------------+-------------+
                                              |
                       +----------------------+----------------------+
                       |                                             |
            (Dados Estruturados)                              (Arquivos Grandes)
                       |                                             |
                       v                                             v
        +------------------------------+              +------------------------------+
        |          IndexedDB           |              |             OPFS             |
        |      (via idb-keyval)        |              | (Origin Private File System) |
        +------------------------------+              +------------------------------+
        | - Mensagens de texto         |              | - Imagens originais em alta  |
        | - Atributos de Contatos      |              | - Áudios e Mensagens de Voz  |
        | - Chaves Públicas / VAPID    |              | - Vídeos e Documentos P2P    |
        | - Handshakes da Fila         |              | - Anexos da Timeline         |
        +------------------------------+              +------------------------------+
```

---

## 8. Tabela Comparativa: Especificação Antiga vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Legada | Implementação Atual do Loco |
| :--- | :--- | :--- |
| **Organização do Estado** | Arquivo único `src/store.ts` | **Modularizado em `src/signals/state.ts` e `src/stores/`** |
| **Bancos do IndexedDB** | Chaves soltas em tabela genérica | **Bancos isolados e fortemente tipados (`DB_NAMES`)** |
| **Navegação Reativa** | Signal `currentView` | **`currentSection`, `selectedContactHash` e `mobileView`** |
| **Gerenciamento de Logs** | Sem suporte nativo | **Signal `logs` integrado ao `DebugPanel.tsx`** |
| **Histórico de Mensagens** | Array plano em `chatSessions` | **Mapeamento bidirecional (`BrowserA` e `BrowserB`)** |

---

## 9. Resumo

- O gerenciamento de estado do Loco utiliza **Preact Signals** divididos entre UI (`state.ts`) e Regras de Negócio (`src/stores/`).
- Não existe arquivo monolítico `store.ts`; a lógica de negócios é modular e coesa.
- A persistência é 100% assíncrona e não-bloqueante no **IndexedDB** (`idb-keyval`) e **OPFS**, utilizando bancos isolados para cada domínio de informação.
- As atualizações de estado seguem o padrão imutável de substituição de referência de `Map` para assegurar a atualização reativa automática da interface.

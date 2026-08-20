# 🏛️ Documentação de Arquitetura: Layout Master-Detail Responsivo com Beer CSS

## 📌 Contexto
No ecossistema do PWA **Loco**, a experiência do usuário precisa adaptar-se com fluidez entre dispositivos de telas grandes (Desktop) e dispositivos móveis (Mobile), mantendo o padrão do Material Design 3 fornecido pela biblioteca **Beer CSS**.

## 🛠️ Regras de Visibilidade Responsiva no Beer CSS

O Beer CSS gerencia os breakpoints de tela através dos seletores e modificadores nativos do seu Grid system:

| Breakpoint | Identificador | Intervalo de Tela | Comportamento |
| :--- | :--- | :--- | :--- |
| **Small** | `s` | `<= 600px` | Dispositivos Mobile |
| **Medium** | `m` | `601px - 992px` | Tablets |
| **Large** | `l` | `> 992px` | Desktops |
| **Tablet/Desktop** | `m l` | `> 600px` | Combinação de Medium e Large |

### 🛑 Por que classes como `hide-on-small` falhavam?
O Beer CSS não reconhece convenções do Materialize CSS ou do Bootstrap. Utilizar classes externas resultava no não ocultamento dos painéis em telas pequenas, travando a interface em um estado rígido.

---

## 🔀 Matriz de Estados do Master-Detail

Através do estado global/local gerenciado pelo Signal `selectedChatId`, as classes dos painéis alternam dinamicamente conforme a tabela abaixo:

| Estado do App | Visão Mobile (`s`) | Visão Desktop (`m` e `l`) |
| :--- | :--- | :--- |
| **Nenhum Chat Selecionado** (`selectedChatId = null`) | **Lista Master:** `s12` (100% de largura)<br>**Chat Detail:** `m l` (Oculto via `display: none`) | **Lista Master:** `m4` / `l3`<br>**Chat Detail:** `m8` / `l9` (Mostra Placeholder) |
| **Chat Selecionado** (`selectedChatId = "1"`) | **Lista Master:** `m l` (Oculta via `display: none`) <br>**Chat Detail:** `s12` (100% de largura) | **Lista Master:** `m4` / `l3`<br>**Chat Detail:** `m8` / `l9` (Mostra Mensagens) |

---

## 🔙 Fluxo de Navegação Mobile

No modo Detail em telas pequenas (`s`), o cabeçalho do Chat insere dinamicamente o botão de navegação:

```tsx
<button className="circle transparent s" onClick={() => selectedChatId.value = null}>
  <i>arrow_back</i>
</button>

```

A inclusão do modificador `s` assegura que este botão seja totalmente invísivel em desktops e tablets, onde a navegação ocorre por clique direto na lista lateral.

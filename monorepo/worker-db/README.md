# Loco Worker-DB

Um banco de dados programável de alta performance para o projeto Loco. Ele executa o IndexedDB inteiramente dentro de um Web Worker, garantindo que a thread principal da aplicação (UI) nunca seja bloqueada por operações pesadas de leitura e escrita.

## 🚀 Funções Avançadas Injetáveis (Edge Computing no Worker)

Para reduzir o tráfego de mensagens e o custo de serialização entre a thread principal e o Worker, o Loco Worker-DB permite que você **injete funções** que são executadas diretamente onde os dados estão.

Essas funções avançadas são divididas em duas categorias principais: **Seleção de Array** e **Consultas Livres (Queries)**.

---

### 1. Seleção e Filtro de Arrays (`getSome`, `setSome`, `delSome`)

Estas funções devem ser usadas exclusivamente para **selecionar, recortar ou ordenar** registros do banco de dados. A função injetada precisa manipular a lista de itens e retornar um Array.

**Regra de Retorno:** 
O retorno será sempre um Array contendo os objetos originais armazenados no banco, porém enriquecidos dinamicamente com a propriedade `_id` (a fonte da verdade é a chave no IndexedDB, sem gravar o `_id` internamente no objeto). O tipo retornado é estritamente `WithId<T>[]`.

**Métodos de Array recomendados para essas funções:**
* `filter()`: Seleciona itens com base em uma condição.
* `slice()`: Ideal para criar paginação nativa.
* `toSorted()`: Retorna os itens ordenados.
* `toReversed()`: Inverte a ordem da lista.
* `toSpliced()`: Substitui ou remove partes específicas do array.

**Exemplo (`getSome`):**
```typescript
const caros = await loja.getSome<{ preco: number, nome: string }>(
  (items) => items.filter(i => i.preco > 10).toSorted((a, b) => b.preco - a.preco)
);
// caros[0]._id estará disponível automaticamente

```

---

### 2. Consultas e Agregações Livres (`query`)

A função `query` é a ferramenta de processamento livre do banco. Você deve usá-la quando quiser extrair apenas um valor específico, fazer um cálculo ou transformar os dados completamente antes de devolvê-los para a thread principal.

**Regra de Retorno:**
Pode retornar **qualquer coisa** (`any` ou o tipo genérico `R` fornecido na chamada).

**Métodos de Array recomendados para o `query`:**

* **Cálculos e Contagem:** `reduce()`, `length`.
* **Busca de item único:** `find()`, `findLast()`, `at()`.
* **Validações Lógicas:** `some()`, `every()`, `includes()`.
* **Mapeamento e Extração:** `map()`, `flatMap()`.
* **Índices:** `findIndex()`, `findLastIndex()`, `indexOf()`.

**Exemplo (`query`):**

```typescript
const somaPrecos = await loja.query<{ preco: number }, number>(
  (items) => items.reduce((acc, curr) => acc + curr.preco, 0)
);

```
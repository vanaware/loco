# 📱 Documentação de Arquitetura: Comportamento Stack Master-Detail em Telas Pequenas (`s`)

## 📌 Contexto
Correção do comportamento de exibição empilhada/lado a lado das visões Master (Lista) e Detail (Mensagens) em telas pequenas (`s`).

---

## 📐 Matriz de Visibilidade Master-Detail

| Chat Selecionado? | Dispositivo / Breakpoint | Classe do Master | Classe do Detail | Visibilidade Efetiva |
| :--- | :--- | :--- | :--- | :--- |
| **Sim** | Mobile (`s`) | `col m4 l3 m l` | `col s12 m8 l9` | **Detail ocupa 100%** (Master oculta por `m l`) |
| **Sim** | Tablet / Desktop (`m` / `l`) | `col m4 l3 m l` | `col s12 m8 l9` | **Dividido em colunas** (4/8 em `m`, 3/9 em `l`) |
| **Não** | Mobile (`s`) | `col s12 m4 l3` | `col m8 l9 m l` | **Master ocupa 100%** (Detail oculta por `m l`) |
| **Não** | Tablet / Desktop (`m` / `l`) | `col s12 m4 l3` | `col m8 l9 m l` | **Dividido em colunas** (Placeholder exibido à direita) |

---

## 🛠️ Regra de Ocultação CSS vs Estilos Inline

- **Diagnóstico:** O BeerCSS utiliza seletores CSS `.m.l` para aplicar `display: none` no breakpoint `s`. Ao declarar `style={{ display: "flex" }}` diretamente no elemento `<section>`, o navegador dava precedência ao estilo inline, impedindo a ocultação da coluna.
- **Solução Aplicada:** O estilo Flexbox foi encapsulado numa `<div>` descendente, mantendo o elemento `<section>` limpo para aceitar as regras de exibição das classes do BeerCSS.
# 📱 Arquitetura de Interface: Ancoragem Fixa do Input de Envio em PWAs

## 📌 Contexto
Correção do comportamento de vazamento de rolagem do contêiner de mensagem em visões mobile/responsive. O grupo de envio rolava juntamente com a página em vez de permanecer fixado na base da janela de chat (acima da navegação inferior do app).

---

## 🛠️ Arquitetura de Layout (Flexbox & Viewport Lock)

1. **Restrição de Viewport (`100dvh`)**:
   - O uso de `100dvh` na raiz `.layout` impede que a barra de navegação dos navegadores móbiles altere a altura calculada da aplicação, travando a rolagem nativa da página (`overflow: hidden`).

2. **Isolamento de Eixo Flexbox**:
   - `header` (`flex-shrink: 0`): Fixo no topo do chat.
   - `scroll` (`flex: 1; overflow-y: auto`): Único contêiner com rolagem interna de mensagens.
   - `footer` (`flex-shrink: 0`): Fixo na base da área do chat, imediatamente acima de `<nav className="bottom">` quando exibido em telas pequenas.
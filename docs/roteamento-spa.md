
# Arquitetura SPA e Roteamento Reativo (Signals)

**Data de Atualização:** Agosto de 2026
**Módulo:** UI / Navegação
**Tecnologias:** Preact, `@preact/signals`, HTML5 History API (Hash)

## 1. O Problema e a Motivação
Nas versões iniciais, o Loco utilizava múltiplas páginas HTML (`index.html`, `profile.html`, `share.html`, `logout.html`) servidas pelo backend. Essa abordagem tradicional gerava alguns gargalos críticos para um **PWA Offline-First**:

1. **Perda de Estado em Memória:** A cada navegação, o navegador destruía o contexto do JavaScript, forçando a recarga massiva de chaves criptográficas, contatos e histórico do IndexedDB.
2. **Fricção Visual (Flickering):** Recarregamentos de página (mesmo cacheados pelo Service Worker) causam uma tela em branco momentânea, quebrando a sensação de "Aplicativo Nativo".
3. **Complexidade no Build:** O script de compilação do Deno precisava mapear e injetar dependências em múltiplos pontos de entrada.

## 2. A Solução: Single Page Application (SPA) Reativa
Para resolver isso sem adicionar dependências externas pesadas (como `react-router`), o Loco adota um roteador customizado, minimalista e 100% integrado ao `@preact/signals`.

A arquitetura baseia-se em **três pilares**:
1. **A URL como Fonte da Verdade (Single Source of Truth):** Utilizamos o `hash` da URL (`#chat=123`, `#profile`) para ditar o estado da tela, garantindo que o botão "Voltar" do celular funcione nativamente.
2. **Reatividade Nível-Zero:** Escutamos o evento nativo `hashchange` e refletimos isso instantaneamente em um Signal.
3. **Dicionário de Rotas (O(1)):** Em vez de usar árvores de renderização ou condicionais estruturais (`if/else`), usamos um Mapa de Componentes para busca instantânea.

## 3. Fluxo de Funcionamento

O ciclo de vida de uma navegação no Loco ocorre da seguinte forma:

1. **Gatilho de Navegação:**
   O usuário clica em um botão, que executa a função utilitária `navigate('#profile')` (ou o usuário clica fisicamente no botão de "Voltar" do smartphone).
   
2. **Intercepção Global:**
   O *Listener* nativo do navegador em `src/utils/router.ts` detecta a mudança:
   ```typescript
   globalThis.addEventListener("hashchange", () => {
     currentHash.value = globalThis.location.hash;
   });

3. **Efeito Cascata (Signals):**
    O `effect()` no roteador observa a mudança de `currentHash.value` e atualiza todos os signals de estado de negócio correspondentes (ex: `currentMobileView`, `contatoSelecionado`). Ele também extrai parâmetros da URL, como o hash do contato.
4. **Tradução de Rota (Selector):**
    O Signal computado (`computed`) chamado `activeView` simplifica a URL complexa em uma chave string direta:
    `#chat=abc123hash` ➔ `'chat'`
5. **Renderização Condicional (O(1)):**
    No `app.tsx`, o componente raiz apenas acessa a chave mapeada e renderiza o componente associado de forma performática:
    ```tsx
    const ViewMap: Record<string, ComponentType<any>> = {
    'chat': ChatSection,
    'profile': ProfileSection,
    // ...
    };

    // ... dentro do App()
    const RouteComponent = ViewMap[activeView.value] || ViewMap['home'];
    return <RouteComponent/>;

    ```

## 4. Vantagens desta Abordagem

* **Zero Dependências:** Nenhuma biblioteca de terceiros de milhares de linhas é necessária para simplesmente ler uma string da barra de endereços.
* **Guarda de Rotas (Route Guards) Simplificada:** Se o usuário não possui perfil configurado, o próprio `app.tsx` intercepta a view e força a renderização do `ProfileSection`, mantendo a segurança estrita do app.
* **Economia de Bateria e CPU:** Como o `app.tsx` nunca é desmontado, todas as chaves RSA/ECDSA e as conexões ativas permanecem intactas na RAM do dispositivo.
* **Desacoplamento UI/Lógica:** Componentes (ex: `ContactDetailSection`) não precisam saber *como* a navegação funciona, eles apenas chamam a função desacoplada `navigate()`.




# Arquitetura de Interface e Componentes

## Registro de Decisão: Adoção do BeerCSS (Agosto 2026)
Após experimentarmos o ecossistema de Web Components (`@material/web`) e wrappers React via ESM (`@m3e/react`), decidimos adotar o **BeerCSS**.

**Motivação Arquitetural:**
1. **Fricção Zero com JSX/Preact:** Web Components exigem typings complexos no TypeScript (e às vezes uso excessivo de `refs`), enquanto bibliotecas React sofrem problemas de build em CDNs (ESM). 
2. **Semântica HTML:** O BeerCSS utiliza o padrão semântico puro para implementar o Material Design 3. Escrevemos tags padrão do HTML5 (ex: `<button class="fill">`), permitindo que o Preact faça o diff no Virtual DOM de forma extremamente otimizada.
3. **Leveza:** Ideal para a nossa arquitetura PWA Offline-First, eliminando dependências JavaScript inchadas.

No futuro, para garantir o funcionamento 100% offline, os arquivos estáticos do BeerCSS serão armazenados em cache pelo Service Worker ou embutidos no nosso bundle final.
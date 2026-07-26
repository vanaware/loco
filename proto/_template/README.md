# Proto: Template

Template base para novos protótipos do Loco.

## Objetivo

Fornecer a estrutura mínima de um PWA executável com Deno, Preact e Service
Worker.

## Como rodar

```bash
cd proto/_template
deno task build
deno task start
```

Abra `http://localhost:8080` no navegador.

## Estrutura

- `index.html` — página principal.
- `src/app.tsx` — aplicação Preact.
- `src/sw.ts` — Service Worker (opcional).
- `build.ts` — empacota tudo para `dist/`.
- `main.ts` — servidor Deno estático.

## Próximo passo

Copie este diretório para `proto/<numero>-<nome>` e adapte as telas para o
recurso que deseja testar.

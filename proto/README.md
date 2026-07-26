# Laboratório de Protótipos do Loco

Esta pasta (`proto/`) agrupa pequenos PWAs executáveis e isolados. Cada
sub-diretório testa uma funcionalidade crítica do Loco sem tocar no app
principal.

## Estrutura

```
proto/
├── README.md                  # este arquivo
├── _template/                 # modelo para novos protótipos
└── 01-push-messaging/         # protótipo de envio PWA Push entre dois clientes
```

## Convenções

- Cada protótipo é um projeto Deno independente.
- Use `deno task build` para empacotar e `deno task start` para subir o
  servidor local.
- UI sempre em Preact + `@preact/signals`.
- Service Worker, quando necessário, é empacotado pelo próprio `build.ts`.
- README dentro de cada protótipo descreve o objetivo, como rodar e limitações.

## Criar um novo protótipo

1. Copie `proto/_template/` para `proto/<numero>-<nome/>`.
2. Edite `index.html`, `src/app.tsx` e `src/sw.ts` (se houver).
3. Atualize `README.md` com o objetivo do teste.
4. Rode `deno task build && deno task start`.

Quando um protótipo validar uma funcionalidade, o aprendizado pode ser migrado
para o app principal em `src/`.

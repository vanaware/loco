# QWEN.md — Instruções Rápidas para o Qwen Code

## Projeto

**Loco** — PWA de mensagens sem servidor central. Comunicação via
WebRTC/DataChannel (P2P), fallback Web Push. Armazenamento híbrido: IndexedDB
para dados, OPFS para arquivos grandes.

## Stack e restrições

- **Runtime obrigatório**: Deno 2.x. Nunca usar Node, npm ou dependências que
  exijam Node.
- **Frontend**: Preact + @preact/signals.
- **UI**: @material/web (Material Design 3).
- **Build**: custom em `build.ts` usando Deno.bundle() para bundling de múltiplos entrypoints (main, worker, sw).
- **Testes**: Deno Test (`deno task test --no-check`).

## Comandos rápidos

```bash
# Build
deno task build

# Servir na porta 8000
deno task start

# Testes
deno task test --no-check

# Checagem de tipos
deno check src/**/*.ts
```

> Sempre que for editar o projeto, rode `deno task build` e
> `deno task test --no-check` ao final.

## Regras críticas

1. **NUNCA usar `localStorage`**. Sempre usar `src/utils/storage.ts`.
2. **Signals**: importar de `@preact/signals`. Nunca de `preact/hooks`.
3. **Componentes**: evitar signals em nível de módulo; criar dentro da função do
   componente.
4. **Edições**: preferir editar arquivos existentes a criar helpers de uma
   linha.
5. **Comentários**: apenas para explicar o "porquê", nunca o "o quê".
6. **Persistência OPFS**: arquivos grandes vão para OPFS
   (`chat_files/{messageId}.{ext}`).
7. **Limpeza**: ao excluir uma conversa, remover arquivos do OPFS antes de
   limpar IndexedDB.
8. **P2P primeiro**: tentar `RTCDataChannel`; Web Push apenas como fallback.

## Estrutura de views

Navegação SPA via `currentView` em `src/store.ts`:

- `list`: lista de conversas.
- `chat`: conversa selecionada.
- `profile`: perfil do usuário.
- `settings`: configurações.
- `about`: sobre o app.
- `call`: chamada P2P.
- `scanner`: leitor de QR Code.

## Decisão estratégica

- **P2P primeiro, push como fallback.**
- **Offline-first:** tudo que é essencial ao usuário fica no dispositivo.
- **Local-first storage:** IndexedDB para dados estruturados, OPFS para binários
  grandes.
- **Segurança:** chaves VAPID e `masterKey` geradas automaticamente e
  armazenadas no IndexedDB. Nunca logar chaves privadas.

## O que fazer antes de finalizar

1. Rodar `deno task build`.
2. Rodar `deno task test --no-check`.
3. Verificar se `AGENTS.md` e/ou `docs/` precisam de atualização.

## Limitações conhecidas (não quebrar sem discussão)

- Web Push simplificado (payload não criptografado RFC 8291).
- Sinalização WebRTC ainda não implementada — chamadas geram oferta local, mas
  não trocam SDP.
- WebTorrent depende de WebRTC e trackers públicos.
- OPFS não suportado no Firefox.

## Documentação completa

Ver `AGENTS.md` e `docs/` para detalhes técnicos, arquitetura e fluxos.

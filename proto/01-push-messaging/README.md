# Proto 01 — PWA Push entre dois clientes

Protótipo para testar o envio e recebimento de mensagens via Web Push entre
dois clientes, em ambos os sentidos.

## Objetivo

- Validar o fluxo de assinatura push no navegador.
- Validar o envio de mensagens via Web Push usando chaves VAPID.
- Testar a comunicação em duas vias: cada cliente pode ser remetente e
  destinatário.

## Como rodar

```bash
cd proto/01-push-messaging
deno task build
deno task start
```

Abra **duas janelas de navegadores diferentes** (por exemplo, Chrome e Edge)
ambas em `http://localhost:8080`.

> Aviso: abrir duas abas no mesmo navegador compartilha o Service Worker e a
> subscription push, o que pode confundir os testes.

## Fluxo de uso

1. Na tela do cliente A, copie o **Meu ID**.
2. Na tela do cliente B, cole o ID do cliente A em "ID do destinatário" e
   envie uma mensagem.
3. O cliente A deve receber a mensagem e uma notificação push.
4. Repita o processo no sentido contrário.

## O que este protótipo demonstra

- Geração/carregamento de chaves VAPID no servidor.
- Exposição da chave pública VAPID para os clientes.
- Registro de subscriptions push por ID.
- Envio de push via biblioteca `@negrel/webpush`.
- Recebimento de mensagens pelo Service Worker e repasse para a UI.

## Limitações / próximos passos

- As subscriptions são mantidas apenas em memória no servidor. Reiniciar o
  servidor limpa os mapeamentos.
- O servidor funciona como relay, não é uma conexão P2P direta.
- Não há criptografia ponta-a-ponta do payload (RFC 8291) — o objetivo aqui é
  validar o canal.
- Notificações só funcionam em localhost ou HTTPS.

## Referências

- `docs/web-push.md`
- `docs/known-issues.md` (itens 4, 5, 6 e Web Push simplificado)

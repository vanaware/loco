# Como o Web Push funciona no Loco

## O que é Web Push

Web Push é um protocolo que permite que um **servidor de aplicação** envie mensagens para um **navegador**, mesmo quando o site não está aberto. No Loco, usamos Web Push como camada de fallback quando a comunicação P2P (WebRTC/DataChannel) não está disponível.

## Por que ele é importante

O Loco é um PWA sem servidor central. Quando você envia uma mensagem:

1. Primeiro, o app tenta enviar diretamente via **P2P/WebRTC** (canal direto).
2. Se o contato não está online no momento, o app usa **Web Push** para acordar o navegador do destinatário.

Isso significa que:

- O destinatário pode estar com o navegador fechado ou em segundo plano.
- O sistema operacional recebe o push e acorda o Service Worker do app.
- O Service Worker processa a notificação e, quando possível, entrega a mensagem.

## Como o navegador "dorme" e acorda

Um PWA instalado continua com o **Service Worker** registrado no sistema operacional, mesmo que:

- A aba do navegador esteja fechada.
- O dispositivo esteja ocioso.
- O app não esteja ativo na tela.

Quando um push chega, o SO executa o Service Worker em background. Esse processo é chamado de **wake-up**: o navegador "acorda" o app para processar a mensagem.

## Fluxo de envio no Loco

```
Usuário A -> Digita mensagem
     |
     v
Tentativa P2P (DataChannel/WebRTC)
     |
     |-- sucesso --> mensagem entregue diretamente
     |
     falha
     |
     v
Envio via Web Push
     |
     v
Serviço de Push do destinatário (ex: FCM, Mozilla, etc.)
     |
     v
Navegador do destinatário acorda o Service Worker
     |
     v
Notificação exibida + mensagem processada
```

## VAPID: identidade do remetente

Para enviar um push, o remetente precisa de chaves **VAPID**:

- **Chave pública**: compartilhada com o contato para validar quem enviou.
- **Chave privada**: usada para assinar a requisição de push.

No Loco, as chaves VAPID são geradas automaticamente na primeira execução e armazenadas no IndexedDB.

## Limitações importantes

- **Não é garantido**: o destinatário pode ter negado notificações ou o serviço de push pode estar indisponível.
- **Criptografia do payload**: o protocolo Web Push exige criptografia do conteúdo com as chaves do subscriber. A implementação atual do Loco envia JSON simplificado; em produção, um **relay server** é recomendado para fazer a criptografia correta.
- **Navegadores**: cada navegador usa seu próprio servidor push (Chrome=FCM, Firefox=Autopush, Safari=APNs via Safari Push).

## O futuro: relay server

Para suportar Web Push robusto sem servidor central, o Loco pode usar um **relay server opcional** que apenas encaminha pushes assinados, sem armazenar mensagens. Isso resolve:

- Criptografia de payload (RFC 8291).
- Rate limits e retries.
- Compatibilidade entre diferentes browsers.

## Resumo

Web Push é o mecanismo que permite o Loco alcançar contatos offline. Combinado com P2P quando ambos estão online, o app consegue entregar mensagens em praticamente qualquer situação em que o dispositivo tenha internet e notificações habilitadas.

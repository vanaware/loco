# Protocolo de Federação e Envelopes VAPID — Loco PWA

## Visão Geral
O servidor do Loco opera como um **Proxy Cego Federado**. Ele tenta descriptografar envelopes de notificações WebPush com sua chave privada. Se o envelope pertencer a outro servidor na rede de nós, o pacote é reencaminhado de forma transparente.

## Fluxo de Processamento de Push
1. **Inspeção do Payload:** Verifica a validade do JSON e o limite do payload (máx. 8192 bytes).
2. **Decodificação JWT:** Extrai as claims públicas do payload para identificar o servidor de destino (`proxyserver`).
3. **Prova de Posse (Proof of Ownership):** Tenta abrir o envelope criptografado usando `decryptWithServerKey`.
   * **Sucesso:** O envelope é destinado a este nó. Envia a notificação diretamente via WebPush/FCM.
   * **Falha (Descriptografia):** O envelope pertence a outro nó federado.
4. **Relé de Federação (Proxying):** Compara o `hostname` de destino com o nó local. Se for um nó remoto, realiza um `POST /push` transparente com um timeout de 10 segundos.
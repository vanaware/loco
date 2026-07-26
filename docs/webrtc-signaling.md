# WebRTC e Sinalização P2P no Loco

## O que é comunicação P2P

P2P (peer-to-peer) significa comunicação direta entre dois dispositivos, sem que
os dados passem por um servidor central. No Loco, o P2P é usado para:

- **Mensagens instantâneas**: quando ambos os contatos estão online, a mensagem
  vai direto via `RTCDataChannel`.
- **Chamadas de voz e vídeo**: usando `RTCPeerConnection`.
- **Transferência de arquivos**: via WebTorrent, que também usa WebRTC por
  baixo.

## WebRTC: o que é

WebRTC (Web Real-Time Communication) é uma API de navegador que permite:

- Capturar áudio e vídeo (`getUserMedia`).
- Conectar dois navegadores diretamente (`RTCPeerConnection`).
- Trocar dados arbitrários (`RTCDataChannel`).

Para conectar dois peers, o WebRTC precisa resolver dois problemas:

1. **Sinalização**: como os peers descobrem um ao outro e trocam metadados de
   conexão.
2. **NAT traversal**: como fazer com que computadores atrás de
   roteadores/firewalls se encontrem (usando STUN/TURN).

## O problema da sinalização

WebRTC **não define** como os peers devem trocar as ofertas/answers. Esse canal
de sinalização precisa ser implementado pelo aplicativo.

No Loco, a sinalização pode acontecer por:

- **Web Push**: enviar a oferta/answer como payload de push.
- **Mensagens P2P já estabelecidas**: reutilizar o `RTCDataChannel` aberto.
- **Link compartilhado via QR Code**: troca manual de SDP.

## Como funciona a sinalização WebRTC

Passos para estabelecer uma conexão P2P:

```
Peer A                          Peer B
  |                               |
  |-- createOffer()              |
  |-- setLocalDescription()      |
  |                               |
  |========= SDP OFFER ==========>|
  |          (via push/msg)       |
  |                               |
  |                          createAnswer()
  |                          setLocalDescription()
  |                          setRemoteDescription(offer)
  |                               |
  |<==== SDP ANSWER =============|
  |      (via push/msg)          |
  |                               |
setRemoteDescription(answer)     |
  |                               |
  |=== ICE CANDIDATES (opc.) ====>|
  |<== ICE CANDIDATES (opc.) ====|
  |                               |
  |       CONEXÃO P2P           |
```

### Termos importantes

- **SDP (Session Description Protocol)**: metadados da conexão, incluindo
  codecs, endereços e portas.
- **Offer**: proposta de conexão enviada pelo peer que inicia.
- **Answer**: resposta do outro peer aceitando a oferta.
- **ICE Candidate**: possíveis rotas para alcançar um peer (IP local, IP público
  via STUN, TURN).

## Sinalização no Loco: estado atual

Atualmente, o `CallScreen.tsx` cria uma `RTCPeerConnection` e gera uma oferta
local:

```typescript
const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
});

stream.getTracks().forEach((track) => pc.addTrack(track, stream));

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
```

**Problema**: a oferta gerada nunca é enviada para o contato. A sinalização
ainda não está implementada. Portanto, as chamadas não conseguem conectar com o
outro lado.

## Fluxo planejado para chamadas no Loco

### 1. Iniciar chamada

- Peer A abre a tela de chamada (`CallScreen`).
- Captura áudio/vídeo com `getUserMedia`.
- Cria `RTCPeerConnection` e gera uma **offer**.
- Envia a offer para o contato via **Web Push** ou **mensagem P2P**.

### 2. Aceitar chamada

- Peer B recebe a oferta via push ou DataChannel.
- O Service Worker/notificação acorda o app e abre o `CallScreen`.
- Peer B captura áudio/vídeo e cria sua `RTCPeerConnection`.
- Define a oferta como `remoteDescription`.
- Gera uma **answer** e envia de volta para Peer A.

### 3. Estabelecer conexão

- Peer A recebe a answer e define como `remoteDescription`.
- Ambos os peers trocam **ICE candidates**.
- Quando um candidato viável é encontrado, o `pc.ontrack` dispara e o
  vídeo/áudio do outro lado aparece.

## Exemplo de troca usando DataChannel já aberto

Se os peers já têm um `RTCDataChannel` aberto (para mensagens), a sinalização
pode ser feita por ele mesmo:

```typescript
// Peer A
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
dataChannel.send(JSON.stringify({ type: "call-offer", sdp: offer.sdp }));
```

```typescript
// Peer B
pc.ondatachannel = (event) => {
  const channel = event.channel;
  channel.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "call-offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channel.send(JSON.stringify({ type: "call-answer", sdp: answer.sdp }));
    }
  };
};
```

## NAT traversal e STUN/TURN

### STUN

O `stun:stun.l.google.com:19302` é um servidor público que ajuda os peers a
descobrirem seus endereços IP públicos. Funciona para a maioria dos casos.

### TURN

Se ambos os peers estão em redes restritadas (NAT simétrico, firewalls
corporativos), o STUN pode falhar. Nesse caso, um servidor **TURN** faz relay do
tráfego. O Loco ainda não usa TURN.

```
Peer A <----> TURN Server <----> Peer B
```

Para chamadas em produção, é recomendado configurar TURN.

## Resumo dos desafios

| Problema                | Solução planejada                         |
| ----------------------- | ----------------------------------------- |
| Trocar SDP entre peers  | Web Push ou DataChannel existente         |
| Descobrir endereços IP  | STUN server (já configurado)              |
| Redes restritivas       | TURN server (futuro)                      |
| Acordar contato offline | Web Push notification                     |
| Persistir conexão       | Reconectar automaticamente quando offline |

## Próximos passos para implementar

1. Criar função `sendCallOffer(contactId, offer)` no `store.ts`.
2. Criar função `handleCallOffer(sdp)` no `CallScreen`.
3. Trocar ICE candidates por mensagens P2P ou push.
4. Adicionar suporte a TURN para redes restritas.
5. Tratar desconexão e reconexão automática.

# 🌐 WebRTC e Sinalização P2P — Especificação Técnica (Funcionalidade Futura)

Este documento especifica o modelo arquitetural planejado para a integração de **WebRTC** (troca de áudio/vídeo em tempo real e canais diretos de dados via `RTCDataChannel`) ao ecossistema do **Loco**, detalhando o mecanismo de sinalização através da **Máquina de Estados de Handshakes**.

---

## 1. Visão Geral e Filosofia P2P

O **Loco** adota o paradigma *Local-First* e *Peer-to-Peer*. Atualmente, o Web Push atua como meio primário de transporte assíncrono. A evolução para **WebRTC** visa proporcionar:

1. **Latência Ultra-Baixa:** Comunicação direta ponto a ponto entre navegadores sem intermediários para mensagens em tempo real quando ambos os nós estão online.
2. **Chamadas de Voz e Vídeo:** Streaming de mídia bidirecional via `RTCPeerConnection`.
3. **Transferência de Arquivos de Alta Velocidade:** Envio direto de mídias pesadas gravadas no **OPFS** utilizando `RTCDataChannel`.

---

## 2. O Desafio da Sinalização e a Solução do Loco

O protocolo WebRTC não especifica como as propostas de conexão (**SDP Offers**, **SDP Answers**) e os candidatos de rede (**ICE Candidates**) devem ser trocados entre dois navegadores.

### A Solução: Sinalização Envelopada pelo Roteador de Handshakes
Em vez de criar um servidor WebSocket centralizado ou um sinalizador inseguro, a sinalização do WebRTC no Loco **será 100% realizada através da Máquina de Estados de Handshakes (`sw-handshakes.ts`)**:

```text
+-------------------+                                               +-------------------+
|   Nó A (Emissor)  |                                               |  Nó B (Receptor)  |
| (RTCPeerConnection|                                               |(RTCPeerConnection)|
+---------+---------+                                               +---------+---------+
          |                                                                   |
          | --- 1. Gera SDP Offer ----------------------------------------->  |
          |    (Enfileira em Handshake_DB -> FluxoOut)                       |
          |    (Cifrado E2E: RSA-OAEP + AES-GCM + GZIP)                      |
          |    (Transportado via /api/proxy-push -> Web Push FCM)            |
          |                                                                   |
          |                                                                   | --- 2. Acorda SW,
          |                                                                   |      Decifra E2E,
          |                                                                   |      Processa Offer
          |                                                                   |
          | <--- 3. Gera e Devolve SDP Answer ------------------------------  |
          |    (Enfileira em Handshake_DB -> FluxoOut)                        |
          |    (Transportado via /api/proxy-push -> Web Push FCM)             |
          |                                                                   |
          +=================== 4. CONEXÃO WEBRTC ATIVA =======================+
          |                     (DataChannel / MediaStream)                   |
```

---

## 3. Estrutura do Handshake de Sinalização (`hand-webrtc.ts`)

Será criado o módulo dedicado `src/handshakes/hand-webrtc.ts` e estendida a interface `HandshakeRotas`:

```typescript
// Extensão da interface HandshakeRotas em src/types/
export interface HandshakeRotas {
  profile?: any;
  mensagem?: any;
  contato?: any;
  webrtc?: WebRTCSignalingData; // Nova Rota de Sinalização P2P
}

export interface WebRTCSignalingData {
  type: 'offer' | 'answer' | 'candidate' | 'close';
  sessionId: string;            // Identificador da sessão de chamada/canal
  sdp?: string;                 // Session Description Protocol (comprimido)
  candidate?: RTCIceCandidateInit; // Candidato ICE para descoberta de rota
  media?: 'data' | 'audio' | 'video'; // Tipo de mídia negociada
}
```

### Garantia de Cifragem E2E
Assim como todos os handshakes do Loco, o sinal WebRTC (`sdp` e `candidates`) viaja **totalmente cifrado** (RSA-OAEP-2048 + AES-GCM-256) e comprimido via `fflate`. Nem o Proxy Deno nem o Google FCM conseguem inspecionar os metadados da chamada ou IP local trocado.

---

## 4. Estrutura Compacta (`CompactSignaling`)

Os pacotes SDP padrão podem ultrapassar 2.000 bytes. Para assegurar que o token JWT assinado não exceda o limite de **4.096 bytes** da RFC 8291 (FCM), os dados de sinalização passarão por minificação de atributos e remoção de linhas SDP redundantes via `src/utils/share-utils.ts`:

| Atributo Original | Atributo Compactado | Descrição |
| :--- | :--- | :--- |
| `type` | `tp` | Tipo da mensagem (`o`: offer, `a`: answer, `c`: candidate). |
| `sessionId` | `sid` | UUID de correlação do handshake de chamada. |
| `sdp` | `s` | String SDP minificada e comprimida via GZIP (`fflate`). |
| `candidate` | `cd` | Candidato ICE serializado. |

---

## 5. Fluxo de Execução de uma Chamada P2P

### 1. Início da Chamada (Nó A)
1. O usuário aciona "Iniciar Chamada" no componente `CallScreen.tsx`.
2. A UI requisita permissões de mídia (`navigator.mediaDevices.getUserMedia`) e cria o objeto `RTCPeerConnection`.
3. Invoca `pc.createOffer()`, define `pc.setLocalDescription(offer)`.
4. Enfileira a oferta no `Handshake_DB` (`out.rotas.webrtc = { type: 'offer', ... }`).
5. O Service Worker (`sw-handshakes.ts`) cifra e despacha o envelope via Web Push Proxy.

### 2. Atendimento da Chamada (Nó B)
1. O evento `push` desperta o Service Worker do Nó B.
2. O Service Worker decifra o payload E2E e identifica `rotas.webrtc.type === 'offer'`.
3. Dispara a notificação de chamada recebida no sistema operacional e atualiza os Signals de UI (`src/signals/state.ts`).
4. Ao atender, o Nó B aceita a chamada, instancia sua `RTCPeerConnection`, registra a oferta como `remoteDescription` e gera uma `answer`.
5. Enfileira a `answer` no `Handshake_DB` (`FluxoOut`), enviando de volta ao Nó A via Web Push Proxy.

### 3. Estabelecimento e Troca de ICE Candidates
1. Ambas as partes registram os `ICE Candidates` locais e os transmitem assincronamente como Handshakes do tipo `candidate`.
2. Quando uma rota válida (Host, STUN ou TURN) é confirmada, o canal direto P2P é aberto (`iceConnectionState === 'connected'`).
3. O áudio/vídeo passa a fluir diretamente entre as duas pontas sem consumir servidores externos.

---

## 6. Travessia de NAT: STUN e TURN

Para garantir que a conexão P2P funcione em redes corporativas, roteadores móveis (4G/5G) e firewalls restritivos:

* **Servidores STUN (Standard):** Utilizados por padrão para descobrir o endereço IP público refletido (`stun:stun.l.google.com:19302`). Funciona para a maioria das redes residenciais e móveis simples.
* **Servidores TURN (Relay de Emergência):** Se ambos os nós estiverem sob NATs simétricos restritivos, o tráfego P2P direto é bloqueado. O Loco permitirá a configuração opcional de credenciais TURN efêmeras para retransmissão de mídia cifrada.

---

## 7. Tabela Comparativa: Rascunho Antigo vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Antiga | Arquitetura Atual e Planejada |
| :--- | :--- | :--- |
| **Canal de Sinalização** | Métodos avulsos/indefinidos no `store.ts` | **Máquina de Estados de Handshakes (`sw-handshakes.ts`)** |
| **Segurança da Sinalização** | SDP em texto claro ou indefinido | **Cifragem E2E Obrigatória (RSA-OAEP-2048 + AES-GCM)** |
| **Limitação de Payload** | Risco de estouro de tamanho no Push | **Minificação + Compressão GZIP (`fflate`) em `share-utils.ts`** |
| **Gerenciamento de Estado** | Funções soltas em `CallScreen.tsx` | **Stores reativos (`src/stores/`) e Preact Signals (`state.ts`)** |
| **Persistência de Fila** | Perda de chamadas em falha de rede | **Retenção no `Handshake_DB` com retentativas automáticas** |

---

## 8. Próximos Passos de Implementação

1. **Criar Módulo `src/handshakes/hand-webrtc.ts`:** Processador de rotas especializado em tratar mensagens de sinalização `offer`, `answer` e `candidate`.
2. **Implementar Utilitário de Compactação de SDP:** Adicionar suporte a minificação de SDP no arquivo `src/utils/share-utils.ts`.
3. **Evoluir Componente `CallScreen.tsx`:** Conectar a UI reativa de chamadas aos Stores da aplicação, gerenciando o ciclo de vida da `RTCPeerConnection` via Signals de estado.

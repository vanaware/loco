# Arquitetura Avançada: Sinalização WebRTC, P2P Offline-First e Roteamento Dinâmico

Este documento estabelece as diretrizes arquiteturais do **Loco** para o estabelecimento de conexões Peer-to-Peer (P2P) seguras entre navegadores (PWAs). O Loco dispensa totalmente o uso de Servidores de Sinalização (WebSockets/Trackers) em tempo real, adotando um modelo híbrido de **Sinalização Assíncrona via Web Push, IndexedDB e Roteamento Oportunista**.

---

## 1. O Problema Fundamental do P2P no Navegador

Diferente de aplicações nativas, os navegadores não podem abrir *raw sockets* (TCP/UDP) arbitrários por razões de segurança. A única ponte direta entre dois navegadores é a API **WebRTC** (que trafega áudio, vídeo e dados arbitrários via `RTCDataChannel`).

### 1.1 O Paradoxo da Descoberta (Signaling)
O WebRTC transfere dados com excelência, mas **não sabe como encontrar o outro dispositivo**. Antes de uma conexão P2P existir, o Dispositivo A precisa enviar para o Dispositivo B um "aperto de mão":
1. **SDP (Session Description Protocol):** Parâmetros de criptografia suportada, codecs e portas.
2. **ICE Candidates:** Uma lista de IPs públicos e locais (descobertos via STUN/TURN) para furar NATs/Firewalls.

Tradicionalmente, os apps resolvem isso mantendo uma conexão WebSocket aberta 24/7 com um servidor central. No Loco (Offline-First), isso é inaceitável, pois drena bateria, expõe metadados de conectividade (presença) e centraliza a infraestrutura.

---

## 2. A Solução Loco: Sinalização Vanilla ICE via Web Push

O Loco utiliza a infraestrutura nativa do dispositivo (Firebase Cloud Messaging - FCM / Apple Push Notification service - APNs) para trafegar os pacotes de sinalização como se fossem mensagens criptografadas.

### 2.1 A Estratégia "Vanilla ICE" (Half-Trickle)
O WebRTC padrão usa *Trickle ICE* (descobre um IP e envia a mensagem, gerando dezenas de envios por segundo). Em uma rede baseada em Push, disparar 20 notificações seguidas faria o navegador bloquear o Loco por spam.

No Loco, usamos **Vanilla ICE**:
1. A Main Thread aciona o WebRTC.
2. O WebRTC coleta *todos* os ICE Candidates possíveis.
3. Empacotamos o SDP e os Candidates em um **único payload**.
4. Criptografamos o pacote com AES-GCM (Chave Simétrica derivada do Handshake E2EE do contato).
5. Enviamos **uma única notificação Push** com a Oferta.
6. O destinatário responde com **uma única notificação Push** contendo a Resposta.

---

## 3. A Arquitetura de 3 Camadas (Isolamento de Threads e Mídia)

As APIs modernas de HTML5 possuem barreiras rígidas. O WebRTC não funciona em Workers, e processos pesados de disco congelam a interface. Além disso, o motor de áudio/vídeo é engessado na thread principal por segurança. 

O Loco divide a carga de trabalho em 3 atores distintos:

### Camada 1: O Carteiro (Service Worker)
* **Onde roda:** Background Thread, ciclo de vida efêmero.
* **Missão:** Receber o Push, gerenciar notificações e alimentar o IndexedDB.
* **Limitações:** Sem acesso ao DOM, não pode instanciar WebRTC.
* **Ação:** Descriptografa o cabeçalho (para ler a `Intent`), salva o payload bruto no IndexedDB e decide se exibe notificação (`showNotification`) ou se acorda a Main Thread.

### Camada 2: O Negociador e Roteador (Main Thread / Window)
* **Onde roda:** Interface Visual (Preact / Signals).
* **Missão:** Orquestrar a Máquina de Estados, acessar o hardware (Câmera/Microfone) e gerenciar as rotas de transporte.
* **Privilégio Exclusivo:** *Único* local que pode instanciar o `RTCPeerConnection` e invocar o `getUserMedia`.
* **Ação em Chamadas (Áudio/Vídeo):** Acopla as faixas de mídia ao WebRTC nativamente (Criptografia DTLS/SRTP nativa pelo motor C++ do browser).
* **Ação em Dados:** Transfere o `RTCDataChannel` para o Web Worker Dedicado via *Transferable Objects*.

### Camada 3: O Operário Pesado (Web Worker Dedicado)
* **Onde roda:** Background Thread contínua enquanto o App estiver aberto.
* **Missão:** Processar volumes massivos de bytes (WebTorrent, encriptação E2EE AES-GCM).
* **Armazenamento:** Grava/lê arquivos no disco usando a API **OPFS (Origin Private File System)** de forma **síncrona**, garantindo velocidade sem engasgar a interface do usuário.

---

## 4. Gerenciamento de Intenções e Limitações de SO

O comportamento do navegador varia agressivamente dependendo da visibilidade do app. Para evitar o esgotamento do *Push Budget* (cota diária de Push) e punições da Apple/Google, classificamos os Handshakes em cenários:

### Cenário A: Mensagem de Texto Simples (Intent: `chat_message`)
Mensagens curtas (< 4KB) viajam no próprio payload criptografado do Push. Não abrimos WebRTC.
* **Se Aberto:** Repassa para a UI (insere no DOM).
* **Se Fechado:** Service Worker descriptografa, salva no banco e dispara notificação do SO: *"Contato: Oi!"*.

### Cenário B: Alta Intenção (Intent: `file_transfer` | `call`)
Transferências ou chamadas que exigem o túnel P2P imediato.
* **Se Aberto:** Processo silencioso e conexão P2P imediata.
* **Se Fechado:** Service Worker salva a Oferta no IndexedDB e exibe notificação: *"Maria quer te enviar um arquivo"*. Ao tocar, o PWA abre e consome a Oferta WebRTC pendente.

### Cenário C: Sincronização Silenciosa (Intent: `receipt` | `typing`)
Metadados de UX. Risco alto de bloqueio se abusado no background.
* **A Regra Loco:** O Service Worker sempre verifica `clients.matchAll()`.
    * **App Visível:** Atualiza UI (mostra tiques azuis). Sem gasto de *Push Budget*.
    * **App Fechado:** **Abortar rede.** Ignorar notificação. Salvar como "Sync Pendente" no IndexedDB. Será processado quando o usuário abrir o app voluntariamente.

---

## 5. Roteamento de Transporte Dinâmico (WebRTC vs Push)

O Loco trata o meio de transporte (Push ou P2P) como descartável. O verdadeiro dado é o **Envelope do Handshake**. 

Sempre que a Máquina de Estados precisa enviar um Handshake, o **Transport Router** (Camada 2) toma a seguinte decisão:
1. Existe um túnel WebRTC (`RTCDataChannel`) ativo com o contato?
   * **Sim:** Envia o Envelope por dentro do P2P. Custo zero, instantâneo, sem cota de Push.
   * **Não:** Faz o *Fallback* disparando pelo proxy do FCM (Web Push).

### 5.1 O "Upgrade Oportunista" (Esvaziando filas do Cenário C)
Quando o usuário abre o app após muito tempo offline, haverá dezenas de Handshakes de metadados ("Syncs pendentes") acumulados no IndexedDB. Mandar isso via Push esgotaria a cota em segundos.

**A Solução de Multiplexação:**
1. O app detecta a fila grande e envia um único Web Push do tipo `sync_upgrade` (Uma oferta SDP silenciada).
2. Se o contato destino estiver online, ele responde silenciosamente e o túnel P2P se abre.
3. A fila inteira de 50 recibos é "despejada" via WebRTC instantaneamente e de forma gratuita.

Para isso, o `RTCDataChannel` é **multiplexado**, suportando a distinção de tipos de dados trafegados no túnel.

---

## 6. Estruturas de Dados Tipadas (TypeScript)

O modelo mental das intenções e transporte:

```typescript
// Intenções determinam o impacto no SO e no Service Worker
export type SdpIntent = 
  | "chat_message"   // Texto puro. Push Budget normal.
  | "file_transfer"  // Abre WebRTC P2P (Worker DataChannel).
  | "call"           // Abre WebRTC P2P (Main Thread Mídia).
  | "sync_receipt"   // Sincronização. Aborta se app fechado.
  | "sync_upgrade";  // Tentativa oportunista de trocar Push por WebRTC.

// Metadados para o Service Worker desenhar notificações sem abrir o DOM
export interface IntentMetadata {
  fallbackMessage: string;
  fileName?: string;
  fileSize?: number;
  callType?: "audio" | "video";
}

// O Payload WebRTC (Empacota Oferta + ICE)
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string; 
}

// O Envelope Universal (Pode trafegar via Web Push FCM ou via WebRTC aberto)
export interface HandshakeEnvelope {
  id: string;              
  senderId: string;        
  intent: SdpIntent;
  metadata: IntentMetadata;
  sdpData?: SdpPayload;    
  inlineData?: string;     
  timestamp: number;
}

// Multiplexador do DataChannel (Worker Dedicado)
export type DataChannelPayload = 
  | { type: "torrent_piece", data: Uint8Array } // Fatias de arquivos brutos
  | { type: "handshake_envelope", data: HandshakeEnvelope }; // O mesmo envelope do Push

```

## 7. Resiliência e Retomada

Se a conexão WebRTC for rompida (evento `disconnected`), a Main Thread destrói a sessão e avisa o Web Worker.
Qualquer download P2P em andamento interrompe as requisições de fragmentos e preserva o estado atual na memória **OPFS**. A Máquina de Estados assume o controle, enfileira um novo envio e, assim que o contato estiver alcançável (via Push), o fluxo é retomado a partir do byte pausado.

# Arquitetura Avançada: Sinalização WebRTC e P2P Offline-First

Este documento estabelece as diretrizes arquiteturais do **Loco** para o estabelecimento de conexões Peer-to-Peer (P2P) seguras entre navegadores (PWAs). O Loco dispensa o uso de Servidores de Sinalização (WebSockets/Trackers) em tempo real, adotando um modelo de **Sinalização Assíncrona via Web Push e IndexedDB**.

---

## 1. O Problema Fundamental do P2P no Navegador

Diferente de aplicações nativas, os navegadores não podem abrir *raw sockets* (TCP/UDP) arbitrários por razões de segurança. A única ponte direta entre dois navegadores é a API **WebRTC** (para áudio, vídeo e dados arbitrários via `RTCDataChannel`).

### 1.1 O Paradoxo da Descoberta (Signaling)
O WebRTC transfere dados com excelência, mas **não sabe como encontrar o outro dispositivo**. Antes de uma conexão P2P existir, o Dispositivo A precisa enviar para o Dispositivo B:
1. **SDP (Session Description Protocol):** Criptografia suportada, codecs e portas.
2. **ICE Candidates:** Uma lista de IPs públicos e locais (descobertos via STUN/TURN) para furar NATs/Firewalls.

Tradicionalmente, os apps resolvem isso mantendo uma conexão WebSocket aberta 24/7 com um servidor central. No Loco (Offline-First), isso é inaceitável pois drena bateria, expõe metadados de conectividade (presença) e centraliza a infraestrutura.

---

## 2. A Solução Loco: Sinalização Vanilla ICE via Web Push

O Loco utiliza a infraestrutura de Web Push (Firebase Cloud Messaging - FCM / Apple Push Notification service - APNs) para trafegar os pacotes de sinalização como se fossem mensagens criptografadas assíncronas.

### 2.1 A Estratégia "Vanilla ICE" (Half-Trickle)
O WebRTC padrão usa *Trickle ICE* (descobre um IP e já envia a mensagem, gerando dezenas de mensagens por segundo). Em uma rede baseada em Push, disparar 20 notificações em 2 segundos faria o navegador bloquear o Loco por *Spam*.

No Loco, usamos **Vanilla ICE**:
1. A Main Thread aciona o WebRTC.
2. O WebRTC coleta *todos* os ICE Candidates possíveis.
3. Empacotamos o SDP e todos os Candidates em um **único payload**.
4. Criptografamos esse payload com AES-GCM (Chave Simétrica derivada do Handshake E2EE do contato).
5. Enviamos **uma única notificação Push** contendo a Oferta.
6. O destinatário responde com **uma única notificação Push** contendo a Resposta.

---

## 3. A Arquitetura de 3 Camadas (Isolamento de Threads e Mídia)

As APIs modernas de HTML5 possuem barreiras rígidas de onde podem ser executadas. O WebRTC não funciona em Workers, e processos pesados de disco congelam a interface. Além disso, o motor de áudio/vídeo é engessado na thread principal por segurança. 

Para manter a UI do Preact a 60fps e garantir a criptografia E2EE em todos os cenários, o Loco divide a carga em 3 atores:

### Camada 1: O Carteiro (Service Worker)
* **Onde roda:** Background Thread, ciclo de vida efêmero (acorda e morre).
* **Missão:** Receber o Push, gerenciar notificações e alimentar o IndexedDB.
* **Limitações:** Não tem acesso ao DOM, não pode instanciar `RTCPeerConnection`, limite de execução de poucos segundos.
* **Ação:** Descriptografa o cabeçalho da mensagem (para ler a `Intent`), salva o payload bruto no IndexedDB e decide se exibe notificação (`showNotification`) ou se acorda a Main Thread via `postMessage`.

### Camada 2: O Negociador e UI (Main Thread / Window)
* **Onde roda:** Interface Visual (Preact / Signals).
* **Missão:** Gerenciar a Máquina de Estados e orquestrar as interfaces de rede e hardware (Câmera/Microfone).
* **Privilégio Exclusivo:** É o *único* local que pode instanciar o `RTCPeerConnection` e invocar `navigator.mediaDevices.getUserMedia()`.
* **Ação em Chamadas (Áudio/Vídeo):** Acopla as faixas de mídia (`MediaStreamTracks`) diretamente ao WebRTC. Toda a criptografia da chamada (DTLS/SRTP) é feita **nativamente pelo motor C++ do navegador**, sem passar pelos nossos Workers.
* **Ação em Dados (Arquivos/Texto):** Negocia o túnel e **transfere o `RTCDataChannel`** para o Worker Dedicado via *Transferable Objects* (`worker.postMessage({ channel }, [channel])`).

### Camada 3: O Operário Pesado (Web Worker Dedicado)
* **Onde roda:** Background Thread viva enquanto o App estiver aberto.
* **Missão:** Esmagar bytes de dados (Arquivos massivos, WebTorrent, Mensageria de Texto).
* **Ação:** Recebe o `RTCDataChannel` pronto. Implementa o protocolo WebTorrent (checa hashes, pede pedaços). Criptografa/descriptografa blocos de arquivos de 1MB com AES-GCM (nossa criptografia manual) em tempo real.
* **Armazenamento:** Grava os arquivos em disco usando a **OPFS (Origin Private File System)** nativa de forma **síncrona**, o que só é permitido em Workers e garante velocidade absurda sem engasgar a tela.

---

## 4. Gerenciamento de Intenções (As Regras de Fundo e UX)

O comportamento do navegador (Chromium/WebKit) varia agressivamente com base no fato do app estar aberto ou fechado. Para evitar punições (como o bloqueio de Push), o sistema classifica os Handshakes em 3 Cenários (Intents).

### Cenário A: Mensagem de Texto Simples (Intent: `chat_message`)
Mensagens curtas não justificam o custo energético de abrir um túnel WebRTC se o usuário estiver offline.
* **Fluxo:** O texto completo é criptografado e embutido no payload do Push (< 4KB).
* **Se Aberto:** O Service Worker repassa para a UI, que insere no DOM imediatamente.
* **Se Fechado:** O Service Worker descriptografa via WebCrypto nativo, salva no IndexedDB e dispara a notificação do SO: *"Contato: Oi!"*.

### Cenário B: Conexão de Alta Intenção (Intent: `file_transfer` | `call`)
Transferências que exigem o estabelecimento imediato do túnel P2P (WebRTC obrigatório).
* **Fluxo:** O Push carrega o pacote SDP (Oferta) e metadados.
* **Se Aberto:** Processo silencioso. A Main Thread recebe o SDP, gera a Answer, envia de volta e a transferência/chamada inicia.
* **Se Fechado:** O sistema operacional bloqueia acesso a câmera e rede P2P em background sem interação do usuário. Além disso, Push exige notificação sob pena de bloqueio.
* **Ação Loco:** O Service Worker exibe uma notificação traduzida: *"Maria está te ligando"* ou *"Maria quer te enviar um arquivo (200MB)"*. Ao tocar, o PWA abre (Main Thread desperta), consome o SDP do IndexedDB e abre a conexão WebRTC.

### Cenário C: Sincronização Silenciosa (Intent: `receipt` | `typing` | `profile_sync`)
Metadados que não devem perturbar o usuário (o "Calcanhar de Aquiles" das PWAs).
* **Ameaça do "Push Budget":** Navegadores debitam uma "cota" a cada Push recebido que não gera notificação. Cota zerada = Loco sofre "Shadowban".
* **Ameaça do iOS:** O WebKit frequentemente ignora "Silent Pushes" para economizar bateria.
* **Ação Loco (A Regra de Ouro):**
  1. O Service Worker recebe o Push.
  2. Executa `clients.matchAll({ type: 'window' })` para checar visibilidade da aba.
  3. **Se Visível (Foreground):** Repassa para a UI (ex: tiques azuis de leitura aparecem). Zero impacto no "Push Budget".
  4. **Se Fechado (Background):** O Service Worker **ABORTA** processo de rede e **NÃO** exibe notificação. Atualiza o `IndexedDB` com status "Sync Pendente" e finaliza. Quando o app for aberto organicamente, a fila silenciosa é processada.

---

## 5. Estruturas de Dados do Signaling (TypeScript)

Para orquestrar esse fluxo de forma tipada e segura, o Loco utiliza o seguinte contrato de dados para o envelope SDP (que é criptografado via E2EE antes do tráfego):

```typescript
// Níveis de Intenção (Definem a urgência e a UX do Service Worker)
export type SdpIntent = 
  | "chat_message"   // Cenário A: Não abre WebRTC offline.
  | "file_transfer"  // Cenário B: Abre WebRTC (Worker lida com dados via DataChannel).
  | "call"           // Cenário B: Abre WebRTC (Main Thread lida com Áudio/Vídeo nativo).
  | "sync_receipt";  // Cenário C: Sincronização silenciosa, processada apenas se aberto.

// Metadados visuais usados pelo ServiceWorker para montar a notificação
export interface IntentMetadata {
  fallbackMessage: string; // Ex: "Recebeu um arquivo" ou "Chamada de vídeo"
  fileName?: string;
  fileSize?: number;
  callType?: "audio" | "video";
}

// O Payload WebRTC (Apenas para intents do Cenário B)
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string; // Já engloba os Vanilla ICE Candidates
}

// O Envelope Criptografado (O que viaja pelo FCM/Proxy)
export interface HandshakeEnvelope {
  id: string;              // UUID da transação
  senderId: string;        // ID público de quem enviou
  intent: SdpIntent;
  metadata: IntentMetadata;
  sdpData?: SdpPayload;    // Presente se exigir WebRTC
  inlineData?: string;     // Presente se for mensagem de texto curta (Cenário A)
  timestamp: number;
}

```

## 6. Fluxo de Retomada de Sessão (Resilience)

Se a conexão WebRTC cair (troca de Wi-Fi para 4G, suspensão do SO), o `RTCPeerConnection` emitirá o evento `oniceconnectionstatechange` como `disconnected`.
Neste cenário, a Main Thread destrói a instância, e caso haja uma transferência de arquivo via Worker (WebTorrent), ela é pausada e o progresso gravado na OPFS. Um novo Handshake SDP é enfileirado no IndexedDB para recriar o túnel e retomar do byte exato quando o destinatário estiver acessível.


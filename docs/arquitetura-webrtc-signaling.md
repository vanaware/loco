# Arquitetura Avançada: Sinalização WebRTC e P2P Offline-First

Este documento estabelece as diretrizes arquiteturais do **Loco** para o estabelecimento de conexões Peer-to-Peer (P2P) seguras entre navegadores (PWAs). O Loco dispensa o uso de Servidores de Sinalização (WebSockets/Trackers) em tempo real, adotando um modelo de **Sinalização Assíncrona via Web Push e IndexedDB**.

---

## 1. O Problema Fundamental do P2P no Navegador

Diferente de aplicações nativas, os navegadores não podem abrir *raw sockets* (TCP/UDP) arbitrários por razões de segurança. A única ponte direta entre dois navegadores é a API **WebRTC** (especificamente o `RTCDataChannel`).

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

## 3. A Arquitetura de 3 Camadas (Isolamento de Threads)

As APIs modernas de HTML5 possuem barreiras rígidas de onde podem ser executadas. O WebRTC não funciona em Workers, e processos pesados de disco congelam a interface. Para manter a UI do Preact a 60fps, o Loco divide a carga em 3 atores:

### Camada 1: O Carteiro (Service Worker)
* **Onde roda:** Background Thread, ciclo de vida efêmero (acorda e morre).
* **Missão:** Receber o Push, gerenciar notificações e alimentar o IndexedDB.
* **Limitações:** Não tem acesso ao DOM, não pode instanciar `RTCPeerConnection`, limite de execução de poucos segundos.
* **Ação:** Descriptografa o cabeçalho da mensagem (para ler a `Intent`), salva o payload bruto no IndexedDB e decide se exibe notificação (`showNotification`) ou se acorda a Main Thread via `postMessage`.

### Camada 2: O Negociador (Main Thread / Preact)
* **Onde roda:** Window (Interface Visual).
* **Missão:** Gerenciar a Máquina de Estados (Signals) e as conexões de rede P2P.
* **Privilégio Exclusivo:** É o *único* local que pode instanciar o `RTCPeerConnection`.
* **Ação:** Lê a Oferta do IndexedDB, negocia o canal WebRTC e, crucialmente, **transfere o DataChannel** para o Worker via *Transferable Objects* (`worker.postMessage({ channel }, [channel])`). Isso tira o peso da rede da interface gráfica.

### Camada 3: O Operário Pesado (Web Worker Dedicado)
* **Onde roda:** Background Thread viva enquanto o App estiver aberto.
* **Missão:** Esmagar bytes.
* **Ação:** Recebe o `RTCDataChannel` pronto. Implementa o protocolo WebTorrent (checa hashes, pede pedaços). Criptografa/descriptografa blocos de arquivos de 1MB com AES-GCM em tempo real.
* **Armazenamento:** Grava os arquivos em disco usando a **OPFS (Origin Private File System)** nativa. O Worker usa o método **síncrono** do OPFS (que só é permitido dentro de Workers) para gravar gigabytes em frações de segundo sem travar a interface.

---

## 4. Gerenciamento de Intenções (As Regras de Fundo e UX)

O comportamento do navegador (Chromium/WebKit) varia agressivamente com base no fato do app estar aberto ou fechado. Para evitar punições (como o bloqueio de Push), o sistema classifica os Handshakes em 3 Cenários (Intents).

### Cenário A: Mensagem de Texto (Intent: `chat_message`)
Mensagens pequenas não justificam o custo energético de abrir um WebRTC.
* **Tamanho:** < 4KB (Limite do FCM/APNs).
* **Fluxo:** O texto completo é criptografado e embutido no Push.
* **Se Aberto:** O Service Worker repassa para a UI (via BroadcastChannel/postMessage). A UI insere no DOM.
* **Se Fechado:** O Service Worker descriptografa via IndexedDB WebCrypto, salva a mensagem no banco e dispara `showNotification("Contato: Oi!")`.

### Cenário B: Conexão de Alta Intenção (Intent: `file_transfer` | `call`)
Transferências que exigem o estabelecimento imediato do túnel P2P.
* **Fluxo:** O Push carrega o pacote SDP (Oferta).
* **Se Aberto:** O processo ocorre 100% invisível. A Main Thread recebe o SDP, gera a Answer, envia de volta e a transferência do arquivo começa. A UI mostra uma barra de progresso.
* **Se Fechado (A Armadilha):** O WebRTC *não pode* ser aberto no background do iOS, e o Android matará o processo logo em seguida. Além disso, se não exibirmos notificação, sofremos punição.
* **Ação do Loco:** O Service Worker exibe uma notificação amigável traduzindo o log técnico: *"Maria quer te enviar um arquivo (Vídeo.mp4 - 200MB)"*. Quando o usuário clica na notificação, a Main Thread desperta, consome o SDP pendente no IndexedDB e abre a conexão WebRTC.

### Cenário C: Sincronização Silenciosa (Intent: `receipt` | `typing` | `profile_sync`)
O "Calcanhar de Aquiles" das PWAs. Metadados que não devem perturbar o usuário.
* **A Ameaça do "Push Budget":** Navegadores Chrome debitam uma "cota" a cada Push recebido que não gera notificação. Se a cota zerar, o Loco sofre "Shadowban" do navegador.
* **A Ameaça da Apple:** O iOS frequentemente ignora ou atrasa indefinidamente "Silent Pushes" para economizar bateria.
* **Ação do Loco (A Regra de Ouro):**
  1. O Service Worker recebe o Push Silencioso.
  2. Ele executa `clients.matchAll({ type: 'window' })` para ver se a aba está visível.
  3. **Se Visível:** Repassa o dado para a UI (ex: mostra que Maria visualizou a mensagem). Não consome o Push Budget.
  4. **Se Fechado:** O Service Worker **ABORTA** imediatamente o processamento de rede e **NÃO** exibe notificação. Ele apenas atualiza o `IndexedDB` com o status de "Sync Pendente" e finaliza sua execução. Quando o usuário abrir o app organicamente amanhã, o gerenciador de estado sincroniza as pendências.

---

## 5. Estruturas de Dados do Signaling (TypeScript)

Para orquestrar esse fluxo de forma tipada e segura no IndexedDB e nos canais de comunicação, o Loco utiliza o seguinte contrato de dados para o envelope SDP, que será criptografado via E2EE antes do tráfego:

```typescript
// Níveis de Intenção (Definem a urgência e a UX do Service Worker)
export type SdpIntent = 
  | "chat_message"   // Cenário A: Não abre WebRTC.
  | "file_transfer"  // Cenário B: Abre WebRTC, notifica se fechado.
  | "call"           // Cenário B: Abre WebRTC, toca notificação persistente.
  | "sync_receipt";  // Cenário C: Sincronização silenciosa, processada apenas se aberto.

// Metadados visuais usados pelo ServiceWorker para montar a notificação
export interface IntentMetadata {
  fallbackMessage: string; // Ex: "Recebeu um arquivo"
  fileName?: string;
  fileSize?: number;
  callType?: "audio" | "video";
}

// O Payload WebRTC (Apenas para intents do Cenário B)
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string; // Já engloba os Vanilla ICE Candidates
}

// O Envelope Criptografado (O que viaja pelo FCM/Fila)
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

Caso a conexão caia (ex: troca de Wi-Fi para 4G ou celular bloqueado), o WebRTC emitirá o evento `oniceconnectionstatechange` como `disconnected` ou `failed`.
Neste caso, a interface destrói a instância `RTCPeerConnection`, pausa o Worker dedicado do Torrent (que salva o progresso na OPFS) e enfileira um novo processo de "Oferta SDP" no sistema de Handshakes para ser despachado quando a rede retornar, recomeçando a transferência a partir do exato byte pausado.

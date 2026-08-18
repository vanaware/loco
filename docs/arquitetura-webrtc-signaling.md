# Arquitetura de Sinalização WebRTC e P2P (Offline-First)

Este documento detalha a arquitetura do **Loco** para estabelecimento de conexões Peer-to-Peer (P2P) no navegador, utilizando WebRTC e Web Push API, sem a dependência de servidores WebSocket centralizados.

## 1. O Desafio do P2P no Navegador

Diferente de aplicativos nativos que podem abrir sockets TCP/UDP diretamente (como o BitTorrent clássico), os navegadores web possuem restrições de segurança estritas. A única forma de comunicação direta entre dois navegadores é através do **WebRTC** (especificamente a API `RTCDataChannel`).

### O Problema da "Descoberta" (Signaling)
O WebRTC é excelente para o transporte de dados, mas **não possui um mecanismo de descoberta**. Para que o "Dispositivo A" se conecte ao "Dispositivo B", eles precisam trocar um "aperto de mão" (Handshake) prévio chamado **SDP (Session Description Protocol)** e negociar rotas de rede (ICE Candidates).
Tradicionalmente, isso exige que ambos os usuários estejam online simultaneamente, conectados a um servidor de WebSocket (Tracker/Signaling Server).

## 2. A Solução Loco: Signaling via Web Push (FCM/APNs)

Como o **Loco** adota uma filosofia **Offline-First**, manter um servidor WebSocket 24/7 vai contra os nossos princípios de economia de bateria, descentralização e privacidade.

Nossa solução utiliza uma mescla de **IndexedDB (Fila de Handshakes)** + **Web Push Notifications** como mecanismo de sinalização assíncrona.

### O Fluxo Básico de Sinalização:
1. **Intenção P2P:** Alice quer enviar um arquivo grande para Bob.
2. **Oferta (Offer):** O PWA de Alice gera uma Oferta WebRTC (SDP), criptografa via E2EE para Bob.
3. **Despertador (Push):** Alice envia o SDP via Push para o servidor cego do Loco, que repassa para o FCM/APNs.
4. **Despertar Silencioso:** O dispositivo de Bob recebe o Push, acordando o `ServiceWorker`.
5. **Resposta (Answer):** O PWA de Bob (se o usuário interagir/abrir) gera a Resposta SDP e manda de volta via Push/Proxy para Alice.
6. **Conexão Estabelecida:** A conexão WebRTC direta é formada. Dados fluem E2EE.

---

## 3. Arquitetura de 3 Camadas (Tratamento de Limitações de Threads)

As APIs do navegador impõem limites severos sobre onde certos processos podem rodar. O `RTCPeerConnection` (motor do WebRTC) **só existe na Main Thread**, o que exige uma orquestração precisa entre as threads do navegador para manter a UI (Preact) rodando a 60fps durante transferências pesadas (WebTorrent).

A arquitetura do Loco divide as responsabilidades em três atores principais:

| Camada | Ator | Responsabilidades |
| :--- | :--- | :--- |
| **1. O Carteiro** | `ServiceWorker` | Ouve os eventos Push. Verifica se o app está visível (`clients.matchAll`). Enfileira Handshakes no `IndexedDB`. Exibe notificações visuais quando necessário. |
| **2. O Negociador** | `Main Thread` | Roda o Preact/Signals. Lê a fila do `IndexedDB`. Instancia o `RTCPeerConnection`. Delega o `RTCDataChannel` para o Worker dedicado usando *Transferable Objects*. |
| **3. O Operário** | `Web Worker` (Dedicado) | Lida com criptografia/descriptografia pesada (AES-GCM). Gerencia o protocolo WebTorrent (fatiamento). Grava arquivos nativamente via `OPFS` (Origin Private File System) de forma síncrona. |

---

## 4. UX e Limitações de Background (Os 3 Cenários)

Devido às restrições dos navegadores (como o **User-Visible Requirement** e o **Push Budget**), quase todo Push recebido com o app fechado *deve* resultar em uma notificação visual, caso contrário, o navegador bloqueia futuros envios.

Para contornar isso, categorizamos os Handshakes em três cenários práticos, utilizando metadados de **Intenção (Reason/Intent)** no payload criptografado do Push.

### Cenário A: Mensagem de Texto Curta
* **Situação:** Alice envia um texto para Bob offline.
* **Ação:** O texto vai embutido dentro do próprio payload criptografado do Push. **Não abrimos WebRTC.**
* **UX/ServiceWorker:** Descriptografa e exibe notificação: *"Alice: Olá!"*. 

### Cenário B: Conexão de Alta Intenção (Arquivos, WebTorrent, Chamadas)
* **Situação:** Alice envia um arquivo de 1GB. Exige WebRTC.
* **Ação:** O Push contém um Handshake SDP de Oferta e um descritor de intenção (`Reason: file_transfer`, `filename`, `size`).
* **UX/ServiceWorker:** Salva a Oferta no IndexedDB e exibe notificação: *"Alice quer enviar um arquivo (1GB). Toque para receber."*
* **Abertura:** Quando o usuário clica na notificação, a Main Thread abre, lê a Oferta, gera a Resposta e inicia o P2P.

### Cenário C: Sincronização Silenciosa (Recibos de Leitura, Status, Perfil)
* **Situação:** O dispositivo da Alice notifica o Bob que ela leu a mensagem.
* **O Perigo:** Se o app do Bob estiver fechado e não exibirmos notificação, gastamos o "Push Budget". Se o sistema for iOS, o Push pode nem rodar.
* **Ação (A Regra de Ouro):** O Service Worker usa `clients.matchAll()`.
    * **Se o app está aberto (Foreground):** Repassa via `postMessage` para a Main Thread atualizar os sinais visuais (ex: os dois tiques azuis).
    * **Se o app está fechado (Background):** Descarta o processamento de rede/notificação. Salva como "Pendente" ou ignora. Quando o usuário reabrir o app manualmente, uma rotina de *sync* busca o estado atual.

---

## 5. Estrutura de Dados Prevista (Contexto SDP)

Para suportar essas intenções, o payload de Sinalização SDP do Loco terá o seguinte formato base (a ser criptografado antes do envio):

```typescript
type SdpIntent = "call" | "file_transfer" | "chat_stream" | "sync";

interface SdpPayload {
  type: "offer" | "answer";
  sdp: string;
  intent: SdpIntent;
  metadata?: {
    filename?: string;
    size?: number;
    fallbackMessage?: string; // Usado para montar a notificação
  };
}
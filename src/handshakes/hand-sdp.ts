// src/handshakes/hand-sdp.ts

/**
 * Handshake para Sinalização WebRTC (SDP - Session Description Protocol).
 * 
 * Este módulo gerencia a troca assíncrona de Offers e Answers para estabelecer
 * conexões Peer-to-Peer diretas, utilizando a nossa malha de Push/Handshakes 
 * sem precisar de um servidor WebSocket.
 */

// Tipagem das mensagens de sinalização que trafegarão criptografadas (E2EE)
export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string; // O Session Description Protocol (dados da conexão)
  // No modo "Vanilla ICE", os candidates já vêm embutidos no SDP, 
  // mas deixamos espaço para enviar candidates atrasados se necessário.
  iceCandidates?: RTCIceCandidateInit[];
}

export interface HandshakeSdpContext {
  senderId: string;
  recipientId: string;
  payload: SdpPayload;
  timestamp: number;
}

/**
 * Inicia a criação de uma Oferta WebRTC (Alice -> Bob).
 * Chamamos isso quando precisamos abrir um canal P2P e não há um ativo.
 */
export async function createSdpOffer(recipientId: string): Promise<HandshakeSdpContext | null> {
  try {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" } // STUN público para furar NAT
      ]
    });

    // 1. Criamos um DataChannel (onde os arquivos/mensagens vão trafegar)
    const dataChannel = peerConnection.createDataChannel("loco-p2p-channel", {
      negotiated: true,
      id: 0 // Usar um ID estático facilita a sincronização sem precisar de eventos adicionais
    });

    // TODO: Salvar `peerConnection` e `dataChannel` no state manager (Signals)
    // mapeado pelo `recipientId` para usarmos depois.

    // 2. Criamos a Oferta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // 3. Aguardamos a coleta de ICE Candidates (Vanilla ICE)
    // Para não gerar multiplos Push, esperamos a coleta terminar (ou dar timeout)
    await new Promise<void>((resolve) => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (peerConnection.iceGatheringState === "complete") {
            peerConnection.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        peerConnection.addEventListener("icegatheringstatechange", checkState);
        // Timeout de segurança (ex: 3 segundos) para não travar o envio se o STUN falhar
        setTimeout(resolve, 3000);
      }
    });

    // O SDP final (com ICE inclusos) fica salvo em localDescription
    const finalSdp = peerConnection.localDescription;
    if (!finalSdp) return null;

    return {
      senderId: "me", // Será preenchido pelo orquestrador
      recipientId,
      timestamp: Date.now(),
      payload: {
        type: "offer",
        sdp: finalSdp.sdp
      }
    };
  } catch (error) {
    console.error("Erro ao criar SDP Offer:", error);
    return null;
  }
}

/**
 * Processador principal da Máquina de Estados para Handshakes SDP.
 * Acionado (geralmente pelo Service Worker) quando um Push de SDP chega.
 */
export async function processSdpHandshake(context: HandshakeSdpContext): Promise<void> {
  console.log(`[Handshake SDP] Processando ${context.payload.type} de ${context.senderId}`);

  if (context.payload.type === "offer") {
    await handleIncomingOffer(context);
  } else if (context.payload.type === "answer") {
    await handleIncomingAnswer(context);
  }
}

/**
 * Bob recebe a Oferta de Alice, aplica, gera uma Resposta e envia de volta.
 */
async function handleIncomingOffer(context: HandshakeSdpContext): Promise<void> {
  const peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  // Configura a escuta para o DataChannel que Alice criou
  peerConnection.addEventListener("datachannel", (event) => {
    const channel = event.channel;
    console.log(`[WebRTC] DataChannel estabelecido com ${context.senderId}!`);
    
    // TODO: Conectar os eventos onmessage, onopen, onclose no State/IndexedDB
    channel.onmessage = (e) => console.log(`[P2P] Mensagem de ${context.senderId}:`, e.data);
  });

  // 1. Aplica o SDP da Alice
  await peerConnection.setRemoteDescription({
    type: "offer",
    sdp: context.payload.sdp
  });

  // 2. Cria a Resposta (Answer)
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  // 3. Aguarda os ICE Candidates do Bob
  await new Promise<void>((resolve) => {
    if (peerConnection.iceGatheringState === "complete") {
      resolve();
    } else {
      const checkState = () => {
        if (peerConnection.iceGatheringState === "complete") {
          peerConnection.removeEventListener("icegatheringstatechange", checkState);
          resolve();
        }
      };
      peerConnection.addEventListener("icegatheringstatechange", checkState);
      setTimeout(resolve, 3000); // Timeout
    }
  });

  const finalSdp = peerConnection.localDescription;
  
  if (finalSdp) {
    const answerPayload: SdpPayload = {
      type: "answer",
      sdp: finalSdp.sdp
    };

    // TODO: Chamar o orquestrador de Handshakes para encriptar e enviar
    // `answerPayload` de volta para `context.senderId` via Push/Proxy.
    console.log("[Handshake SDP] Answer gerada e pronta para envio.");
  }
}

/**
 * Alice recebe a Resposta de Bob e finaliza o túnel WebRTC.
 */
async function handleIncomingAnswer(context: HandshakeSdpContext): Promise<void> {
  // TODO: Recuperar o `peerConnection` criado pela Alice em `createSdpOffer` 
  // buscando no gerenciador de estado pelo `context.senderId`.
  const peerConnection: RTCPeerConnection | null = null; // Mock para exemplo

  if (!peerConnection) {
    console.warn(`[Handshake SDP] PeerConnection não encontrado para ${context.senderId}. Foi descartado?`);
    return;
  }

  // 1. Aplica o SDP do Bob
  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: context.payload.sdp
  });

  // Se houverem candidates atrasados enviados manualmente, os adicionamos aqui
  if (context.payload.iceCandidates) {
    for (const candidate of context.payload.iceCandidates) {
      await peerConnection.addIceCandidate(candidate);
    }
  }

  console.log(`[Handshake SDP] WebRTC Signaling finalizado com ${context.senderId}! Conexão P2P iminente.`);
}
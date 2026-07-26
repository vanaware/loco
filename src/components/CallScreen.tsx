import { useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import {
  checkCallAvailability,
  contacts,
  currentChatContact,
} from "../store.ts";
import {
  enterPiP,
  exitPiP,
  releaseWakeLock,
  requestWakeLock,
} from "../utils/pwa.ts";
import { detectCapabilities } from "../utils/capabilities.ts";

export function CallScreen() {
  const callActive = signal(false);
  const isVideoEnabled = signal(false);
  const isAudioEnabled = signal(true);
  const camera = signal<"front" | "back">("front");
  const localStream = signal<MediaStream | null>(null);
  const remoteStream = signal<MediaStream | null>(null);
  const peerConnection = signal<RTCPeerConnection | null>(null);
  const isPiP = signal(false);

  const id = currentChatContact.value;
  const contact = id ? contacts.value.get(id) : null;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const caps = detectCapabilities();

  useEffect(() => {
    if (localStream.value && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream.value;
    }
  }, [localStream.value]);

  useEffect(() => {
    if (remoteStream.value && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream.value;
    }
  }, [remoteStream.value]);

  const startCall = async (video: boolean) => {
    if (!id) return;
    const available = await checkCallAvailability(id);
    if (!available) return;

    await requestWakeLock();

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: video
          ? {
            facingMode: camera.value === "front" ? "user" : "environment",
          }
          : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.value = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteStream.value = event.streams[0];
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      peerConnection.value = pc;
      callActive.value = true;
      isVideoEnabled.value = video;
    } catch (e) {
      console.error("Erro ao iniciar chamada:", e);
      alert("Não foi possível iniciar a chamada. Verifique as permissões.");
    }
  };

  const endCall = async () => {
    peerConnection.value?.close();
    localStream.value?.getTracks().forEach((t) => t.stop());

    exitPiP();
    await releaseWakeLock();

    callActive.value = false;
    isVideoEnabled.value = false;
    isAudioEnabled.value = true;
    localStream.value = null;
    remoteStream.value = null;
    peerConnection.value = null;
    isPiP.value = false;
  };

  const toggleAudio = () => {
    localStream.value?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    isAudioEnabled.value = !isAudioEnabled.value;
  };

  const toggleVideo = () => {
    localStream.value?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    isVideoEnabled.value = !isVideoEnabled.value;
  };

  const switchCamera = async () => {
    if (!localStream.value) return;
    localStream.value.getVideoTracks().forEach((t) => t.stop());

    const newFacing = camera.value === "front" ? "back" : "front";
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: newFacing === "front" ? "user" : "environment" },
    });

    const pc = peerConnection.value;
    if (pc) {
      const senders = pc.getSenders();
      for (const track of newStream.getTracks()) {
        const sender = senders.find((s) => s.track?.kind === track.kind);
        if (sender) await sender.replaceTrack(track);
      }
    }

    localStream.value = newStream;
    camera.value = newFacing;
  };

  const handlePiP = async () => {
    if (remoteVideoRef.current && caps.pipVideo) {
      await enterPiP(remoteVideoRef.current);
      isPiP.value = true;
    }
  };

  // Se não está em chamada, mostra botões de iniciar
  if (!callActive.value) {
    return (
      <div style="padding:1rem; text-align:center;">
        <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1rem;">
          📞 Ligar para {contact?.displayName}
        </h3>
        <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
          <md-filled-button onClick={() => startCall(false)}>
            <md-icon slot="icon">call</md-icon>
            Chamada de Voz
          </md-filled-button>
          <md-filled-tonal-button onClick={() => startCall(true)}>
            <md-icon slot="icon">videocam</md-icon>
            Chamada de Vídeo
          </md-filled-tonal-button>
        </div>
      </div>
    );
  }

  // Tela de chamada ativa
  return (
    <div class="call-screen">
      {/* Vídeo remoto (fundo) */}
      <video
        ref={remoteVideoRef}
        autoplay
        playsinline
        style="width:100%; height:100%; object-fit:cover;"
      />

      {/* Vídeo local (miniatura) */}
      {isVideoEnabled.value && (
        <video
          ref={localVideoRef}
          autoplay
          playsinline
          muted
          style="
            position:absolute; top:1rem; right:1rem;
            width:120px; height:160px;
            object-fit:cover; border-radius:0.75rem;
            border:2px solid white;
            box-shadow:0 4px 12px rgba(0,0,0,0.3);
          "
        />
      )}

      {/* Info do contato */}
      <div style="
        position:absolute; top:2rem; left:1rem; right:1rem;
        color:white; text-shadow:0 2px 4px rgba(0,0,0,0.5);
      ">
        <div style="font:var(--md-sys-typescale-headline-medium);">
          {contact?.displayName}
        </div>
        <div style="font:var(--md-sys-typescale-body-medium); opacity:0.8;">
          {isVideoEnabled.value ? "📹 Vídeo chamada" : "📞 Chamada de voz"}
        </div>
      </div>

      {/* Controles */}
      <div class="call-controls">
        <md-fab
          variant="small"
          onClick={toggleAudio}
          style={`--md-fab-container-color: ${
            isAudioEnabled.value
              ? "var(--md-sys-color-surface)"
              : "var(--md-sys-color-error)"
          }`}
        >
          <md-icon slot="icon">
            {isAudioEnabled.value ? "mic" : "mic_off"}
          </md-icon>
        </md-fab>

        {isVideoEnabled.value && (
          <>
            <md-fab
              variant="small"
              onClick={toggleVideo}
              style={`--md-fab-container-color: ${
                isVideoEnabled.value
                  ? "var(--md-sys-color-surface)"
                  : "var(--md-sys-color-error)"
              }`}
            >
              <md-icon slot="icon">
                {isVideoEnabled.value ? "videocam" : "videocam_off"}
              </md-icon>
            </md-fab>

            <md-fab variant="small" onClick={switchCamera}>
              <md-icon slot="icon">flip_camera_android</md-icon>
            </md-fab>

            {caps.pipVideo && (
              <md-fab variant="small" onClick={handlePiP}>
                <md-icon slot="icon">picture_in_picture</md-icon>
              </md-fab>
            )}
          </>
        )}

        <md-fab
          variant="small"
          onClick={endCall}
          style="--md-fab-container-color: var(--md-sys-color-error);"
        >
          <md-icon slot="icon">call_end</md-icon>
        </md-fab>
      </div>
    </div>
  );
}

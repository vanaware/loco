import { useEffect, useRef } from "preact/hooks";
import { signal } from "@preact/signals";
import { addContact, navigateTo } from "../store.ts";
import { scanQRFromCamera } from "../utils/pwa.ts";
import { detectCapabilities } from "../utils/capabilities.ts";

export function QRScanner() {
  const isScanning = signal(false);
  const scanResult = signal<string | null>(null);
  const error = signal<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const caps = detectCapabilities();

  useEffect(() => {
    if (!caps.barcodeDetector) {
      error.value = "Leitor de QR Code não suportado neste navegador.";
      return;
    }

    startScanning();

    return () => {
      stopRef.current?.();
    };
  }, []);

  const startScanning = async () => {
    if (!videoRef.current) return;
    isScanning.value = true;
    error.value = null;

    try {
      const stop = await scanQRFromCamera(
        videoRef.current,
        (value) => {
          scanResult.value = value;
          isScanning.value = false;
          handleResult(value);
        },
      );
      stopRef.current = stop;
    } catch (_e) {
      error.value = "Erro ao acessar câmera. Verifique as permissões.";
      isScanning.value = false;
    }
  };

  const handleResult = (value: string) => {
    if (value.includes("#add=")) {
      try {
        const encoded = value.split("#add=")[1];
        const data = JSON.parse(decodeURIComponent(atob(encoded)));
        addContact(data.id, {
          ...data,
          displayName: data.displayName || "Novo Contato",
          theirDisplayName: data.displayName || "",
          addedAt: Date.now(),
          lastContact: null,
        });
        alert(`✅ Contato "${data.displayName || data.id}" adicionado!`);
        navigateTo("list");
        return;
      } catch { /* ignore */ }
    }

    // URL genérica
    if (value.startsWith("http")) {
      const open = confirm(
        `QR Code detectado:\n${value}\n\nDeseja abrir este link?\n(Cancelar para copiar)`,
      );
      if (open) {
        globalThis.open(value, "_blank");
      } else {
        navigator.clipboard.writeText(value);
        alert("Link copiado!");
      }
      return;
    }

    // Texto genérico
    alert(`QR Code detectado:\n${value}`);
  };

  const handleStop = () => {
    stopRef.current?.();
    isScanning.value = false;
    navigateTo("profile");
  };

  if (!caps.barcodeDetector) {
    return (
      <div style="padding:2rem; text-align:center;">
        <md-icon style="font-size:4rem; color:var(--md-sys-color-error);">
          qr_code_scanner
        </md-icon>
        <h3 style="font:var(--md-sys-typescale-title-large); margin:1rem 0;">
          Não Suportado
        </h3>
        <p style="color:var(--md-sys-color-on-surface-variant);">
          {error.value ||
            "Seu navegador não suporta a API de detecção de QR Code."}
        </p>
        <p style="margin-top:1rem; color:var(--md-sys-color-on-surface-variant);">
          Use o compartilhamento por link como alternativa.
        </p>
        <md-filled-button
          onClick={() => navigateTo("profile")}
          style="margin-top:1rem;"
        >
          Voltar
        </md-filled-button>
      </div>
    );
  }

  return (
    <div style="
      position:fixed; inset:0; background:black; z-index:3000;
      display:flex; flex-direction:column;
    ">
      {/* Header */}
      <div style="
        display:flex; align-items:center; gap:0.5rem;
        padding:1rem; color:white; z-index:1;
        background:linear-gradient(to bottom, rgba(0,0,0,0.6), transparent);
      ">
        <md-icon-button onClick={handleStop}>
          <md-icon style="color:white;">close</md-icon>
        </md-icon-button>
        <span style="font:var(--md-sys-typescale-title-medium);">
          Escanear QR Code
        </span>
      </div>

      {/* Vídeo */}
      <video
        ref={videoRef}
        autoplay
        playsinline
        style="flex:1; width:100%; object-fit:cover;"
      />

      {/* Overlay */}
      <div style="
        position:absolute; top:50%; left:50%;
        transform:translate(-50%, -50%);
        width:250px; height:250px;
        border:3px solid white;
        border-radius:1rem;
        box-shadow:0 0 0 9999px rgba(0,0,0,0.4);
      ">
        <div style="
          position:absolute; top:-3px; left:-3px;
          width:30px; height:30px;
          border-top:4px solid var(--md-sys-color-primary);
          border-left:4px solid var(--md-sys-color-primary);
          border-radius:0.5rem 0 0 0;
        " />
        <div style="
          position:absolute; top:-3px; right:-3px;
          width:30px; height:30px;
          border-top:4px solid var(--md-sys-color-primary);
          border-right:4px solid var(--md-sys-color-primary);
          border-radius:0 0.5rem 0 0;
        " />
        <div style="
          position:absolute; bottom:-3px; left:-3px;
          width:30px; height:30px;
          border-bottom:4px solid var(--md-sys-color-primary);
          border-left:4px solid var(--md-sys-color-primary);
          border-radius:0 0 0 0.5rem;
        " />
        <div style="
          position:absolute; bottom:-3px; right:-3px;
          width:30px; height:30px;
          border-bottom:4px solid var(--md-sys-color-primary);
          border-right:4px solid var(--md-sys-color-primary);
          border-radius:0 0 0.5rem 0;
        " />
      </div>

      {/* Footer */}
      <div style="
        padding:1.5rem; text-align:center;
        background:linear-gradient(to top, rgba(0,0,0,0.6), transparent);
        color:white;
      ">
        <p style="font:var(--md-sys-typescale-body-medium);">
          Aponte a câmera para o QR Code do contato
        </p>
      </div>

      {/* Resultado */}
      {scanResult.value && (
        <div style="
          position:absolute; bottom:5rem; left:1rem; right:1rem;
          background:var(--md-sys-color-surface);
          border-radius:1rem; padding:1rem;
          color:var(--md-sys-color-on-surface);
        ">
          <div style="font:var(--md-sys-typescale-title-medium); margin-bottom:0.5rem;">
            ✅ Detectado!
          </div>
          <div style="font:var(--md-sys-typescale-body-small); word-break:break-all;">
            {scanResult.value.slice(0, 100)}
            {scanResult.value.length > 100 ? "..." : ""}
          </div>
        </div>
      )}
    </div>
  );
}

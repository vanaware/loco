// src/components/ShareSection.tsx
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { processarQualquerConvite } from '../utils/share-utils.ts';
import { adicionarContato } from '../stores/contatosStore.ts';
import { serializarPublicKeyVapid } from '../utils/db-helpers.ts';
import { showToast, sharePayload } from '../signals/state.ts';
import { navigate } from '../utils/router.ts';
import type { Contato } from '../constants/db.ts';

export function ShareSection() {
  const preview = useSignal<Partial<Contato> | null>(null);
  const error = useSignal<string | null>(null);
  const isScanning = useSignal<boolean>(false);
  const manualInput = useSignal<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Se a URL já trouxe um payload (ex: clicou num link gerado), processa direto
    if (sharePayload.value) {
      handleProcessar(sharePayload.value);
    } else {
      iniciarCamera();
    }
    // Desliga a câmera automaticamente quando o componente for desmontado (troca de rota)
    return () => pararCamera();
  }, [sharePayload.value]);

  const handleProcessar = async (input: string) => {
    try {
      error.value = null;
      const resultado = await processarQualquerConvite(input);
      preview.value = resultado;
    } catch (e: any) {
      error.value = e.message || "Falha ao processar convite.";
    }
  };

  const iniciarCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      error.value = "Seu navegador não suporta a API nativa de leitura de QR Code. Tente colar o código manual abaixo.";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        isScanning.value = true;
        scanLoop();
      }
    } catch {
      error.value = "Não foi possível acessar a câmera. Verifique as permissões do navegador.";
    }
  };

  const pararCamera = () => {
    isScanning.value = false;
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const scanLoop = async () => {
    if (!isScanning.value || !videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      if (isScanning.value) requestAnimationFrame(scanLoop);
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const barcodes = await detector.detect(videoRef.current);
      if (barcodes.length > 0) {
        pararCamera();
        handleProcessar(barcodes[0].rawValue);
        return; 
      }
    } catch (e) {
      console.warn("Erro no BarcodeDetector:", e);
    }
    if (isScanning.value) requestAnimationFrame(scanLoop);
  };

  const handleManualSubmit = () => {
    if (!manualInput.value.trim()) return;
    pararCamera();
    handleProcessar(manualInput.value.trim());
  };

  const confirmar = async () => {
    if (!preview.value) return;
    try {
      const p = preview.value;
      const contatoId = await serializarPublicKeyVapid(p.vapidPublicKey!);

      const novoContato: Contato = {
        id: contatoId,
        vapidPublicKey: p.vapidPublicKey!,
        email: p.email || '',
        name: p.name || '', 
        e2ePublicKey: p.e2ePublicKey!,
        subscription: p.subscription!,
        vapidPrivateKeyEnvelope: p.vapidPrivateKeyEnvelope!,
        trusted: true, 
        me: 'none', 
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await adicionarContato(novoContato);
      
      // Aciona o SW para disparar o Handshake de apresentação para o novo contato
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: 'CRIAR_HANDSHAKE_OUT',
          payload: {
            rotasModulo: 'contato',
            params: { function: 'enviarSubscription', contato: contatoId, responder: false }
          }
        });
      }

      showToast("✅ Contato adicionado! Um pacote de sincronização foi enviado.", "success");
      navigate(`#detail=${contatoId}`); // Leva o usuário direto para o cartão do novo contato
    } catch (e: any) {
      showToast("❌ Erro ao adicionar contato: " + e.message, "error");
    }
  };

  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
        {error.value ? (
          <div class="container" style="border-left-color: var(--md-sys-color-error); text-align: center; max-width: 480px; width: 100%;">
            <md-icon style="font-size: 48px; color: var(--md-sys-color-error); margin-bottom: 16px;">error</md-icon>
            <h2 style="justify-content: center; font-size: 1.25rem;">Ops! Algo deu errado</h2>
            <p style="color: #666; margin-bottom: 24px; font-size: 0.9rem;">{error.value}</p>
            <md-filled-button onClick={() => { error.value = null; iniciarCamera(); }} style="width: 100%;">
              Tentar Novamente
            </md-filled-button>
          </div>
        ) : preview.value ? (
          <div class="container" style="border-left-color: var(--md-sys-color-primary); max-width: 480px; width: 100%;">
            <div style="text-align: center; margin-bottom: 24px;">
              <md-icon style="font-size: 48px; color: var(--md-sys-color-primary); margin-bottom: 8px;">person_add</md-icon>
              <h2 style="justify-content: center; font-size: 1.25rem;">Confirmar Contato</h2>
              <p style="color: #666; font-size: 0.9rem;">Você está prestes a estabelecer uma conexão criptografada com este perfil.</p>
            </div>
            
            <div style="background: var(--md-sys-color-surface-variant); padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
              <md-icon style="font-size: 32px; color: #555; margin-bottom: 8px;">account_circle</md-icon>
              <h3 style="margin: 0; font-size: 1.2rem;">{preview.value.name?.trim() || "Anônimo"}</h3>
              <p style="margin: 0; color: #666; font-size: 0.85rem;">{preview.value.email || "Sem e-mail"}</p>
            </div>

            <div style="display: flex; gap: 8px; flex-direction: column;">
              <md-filled-button onClick={confirmar} style="width: 100%;">✅ Confirmar e Adicionar</md-filled-button>
              <md-outlined-button onClick={() => navigate('')} style="width: 100%;">Cancelar</md-outlined-button>
            </div>
          </div>
        ) : (
          <div class="container" style="border-left-color: var(--md-sys-color-secondary); text-align: center; max-width: 480px; width: 100%;">
            <h2 style="justify-content: center; font-size: 1.25rem;">Ler QR Code</h2>
            <p style="font-size: 0.9rem; color: #666; margin-bottom: 16px;">Aponte a câmera para o convite do Loco de um amigo para se conectar.</p>
            
            <div style="position: relative; width: 100%; max-height: 400px; aspect-ratio: 1; background: #000; border-radius: 12px; overflow: hidden; margin: 0 auto;">
               <video ref={videoRef} playsInline style="width: 100%; height: 100%; object-fit: cover;"></video>
               <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); border: 2px dashed rgba(255,255,255,0.7); width: 70%; height: 70%; border-radius: 16px; box-shadow: 0 0 0 4000px rgba(0,0,0,0.5);"></div>
            </div>

            <div style="width: 100%; margin-top: 24px; text-align: left;">
              <label style="font-size: 0.85rem; font-weight: 500; color: var(--md-sys-color-on-surface-variant); display: block; margin-bottom: 8px;">
                Ou cole o link/código de convite:
              </label>
              <div style="display: flex; gap: 8px; align-items: flex-start;">
                <md-outlined-text-field
                  value={manualInput.value}
                  onInput={(e: Event) => manualInput.value = (e.target as HTMLInputElement).value}
                  placeholder="Cole aqui..."
                  style="flex-grow: 1; margin-bottom: 0;"
                ></md-outlined-text-field>
                <md-filled-button onClick={handleManualSubmit} style="height: 56px; margin-bottom: 0;">
                  Adicionar
                </md-filled-button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
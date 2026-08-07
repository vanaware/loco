// src/components/ContactDetailSection.tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { contatosComHash } from '../stores/contatosStore.ts';
import { profile } from '../stores/profileStore.ts';
import { contatoSelecionado, contatoCompartilharHash, currentMobileView, showToast } from '../signals/state.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';

export function ContactDetailSection() {
  const qrCodeDataUrl = useSignal<string | null>(null);
  const hash = contatoCompartilharHash.value;

  const item = contatosComHash.value.find(c => c.hash === hash);
  const contato = item?.contato;

  useEffect(() => {
    if (!contato) {
      qrCodeDataUrl.value = null;
      return;
    }
    try {
      const payloadBinario = gerarPayloadQrCodeCompacto(contato);
      const qr = qrcode(0, 'L');
      qr.addData(payloadBinario);
      qr.make();
      qrCodeDataUrl.value = qr.createDataURL(5, 0);
    } catch (e) {
      console.error("Erro ao gerar QR Code do contato:", e);
      qrCodeDataUrl.value = null;
    }
  }, [contato]);

  if (!contato || !hash) return null;

  const handleCopiarLink = async () => {
    const p = profile.value;
    if (!p) return showToast("Configure seu perfil primeiro para indicar contatos.", "error");

    try {
      const shareUrl = await gerarLinkConviteWeb(contato, p.vapidPrivateKeyJwk, p.vapidPublicKey);
      await navigator.clipboard.writeText(shareUrl);
      showToast(`✅ Link de indicação de ${contato.nome} copiado!`, "success");
    } catch (err: any) {
      showToast(`❌ Falha ao gerar link: ${err.message}`, "error");
    }
  };

  const handleIniciarChat = () => {
    contatoSelecionado.value = hash;
    contatoCompartilharHash.value = null;
    currentMobileView.value = 'chat';
  };

  const handleFechar = () => {
    contatoCompartilharHash.value = null;
    if (!contatoSelecionado.value) {
      currentMobileView.value = 'list';
    }
  };

  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 480px; width: 100%; margin-bottom: 0; text-align: center;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span style="font-size: 0.9rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <md-icon>badge</md-icon> Cartão de Contato
          </span>
          <md-icon-button onClick={handleFechar}>
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>

        <md-icon style="font-size: 64px; color: var(--md-sys-color-primary); margin-bottom: 8px;">account_circle</md-icon>
        <h2 style="justify-content: center; margin-bottom: 4px;">{contato.nome}</h2>
        <p style="color: #666; font-size: 0.9rem; margin-bottom: 20px;">{contato.email}</p>

        {qrCodeDataUrl.value && (
          <div style="background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #eee; margin-bottom: 20px; display: inline-block;">
            <img src={qrCodeDataUrl.value} alt="QR Code do Contato" style="max-width: 220px; width: 100%; height: auto; display: block; margin: 0 auto;" />
            <span style="font-size: 0.75rem; color: #888; display: block; margin-top: 8px;">
              Aponte a câmera (pelo App Loco) para se conectar com {contato.nome.split(' ')[0]}
            </span>
          </div>
        )}

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <md-filled-button onClick={handleCopiarLink} style="width: 100%;">
            <md-icon slot="icon">share</md-icon>
            Copiar Link de Convite / Indicação
          </md-filled-button>

          <md-outlined-button onClick={handleIniciarChat} style="width: 100%;">
            <md-icon slot="icon">chat</md-icon>
            Iniciar Conversa
          </md-outlined-button>
        </div>

      </div>

    </div>
  );
}
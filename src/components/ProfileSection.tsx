// src/components/ProfileSection.tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { profile, carregarProfile, atualizarProfile } from '../stores/profileStore.ts';
import { profileName, profileEmail, addDebugLog, showToast } from '../signals/state.ts';
import { gerarProfileCompleto, getServerPublicKey } from '../utils/profile-utils.ts';
import { cifrarChaveVapid } from '../utils/push-utils.ts';
import { salvarProfile } from '../utils/db-helpers.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';
import { navigate } from '../utils/router.ts';

export function ProfileSection() {
  const qrCodeDataUrl = useSignal<string | null>(null);
  const isEditing = useSignal<boolean>(false);

  useEffect(() => {
    carregarProfile();
  }, []);

  const p = profile.value;
  const temChaveVapid = !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk);

  useEffect(() => {
    if (!temChaveVapid) {
      isEditing.value = true;
    } else {
      isEditing.value = false;
    }
  }, [temChaveVapid]);

  useEffect(() => {
    const renderQrCode = async () => {
      if (!p) return;
      try {
        // 🔥 Agora suporta Assíncrono perfeitamente
        const payloadBinario = await gerarPayloadQrCodeCompacto(p);
        const qr = qrcode(0, 'L');
        qr.addData(payloadBinario);
        qr.make();
        qrCodeDataUrl.value = qr.createDataURL(5, 0); 
      } catch (e) {
        console.error("Falha ao gerar QR Code:", e);
        qrCodeDataUrl.value = null;
      }
    };

    if (temChaveVapid) {
      renderQrCode();
    } else {
      qrCodeDataUrl.value = null;
    }
  }, [p, temChaveVapid]);

  const handleGerarOuCorrigir = async () => {
    const eraNovo = !temChaveVapid;
    try {
      const pNovo = await gerarProfileCompleto(profileName.value, profileEmail.value);
      await atualizarProfile(pNovo);
      
      isEditing.value = false;

      if (eraNovo) {
        showToast(`✅ Perfil inicializado com sucesso!`, "success");
        navigate(''); 
      } else {
        showToast(`✅ Perfil atualizado!`, "success");
      }
    } catch (err: any) {
      addDebugLog(`❌ Erro no processo: ${err.message}`);
      showToast(`❌ Falha: ${err.message}`, "error");
    }
  };

  const handleCancelarEdicao = () => {
    if (p) {
      profileName.value = p.name || '';
      profileEmail.value = p.email || '';
    }
    isEditing.value = false;
  };

  const handleCompartilhar = async () => {
    try {
      if (!p) return showToast("Salve o perfil primeiro.", "error");
      const serverPublicKeyJwk = await getServerPublicKey();

      const novoEnvelope = await cifrarChaveVapid(p.vapidPrivateKeyJwk, serverPublicKeyJwk);
      p.vapidPrivateKeyEnvelope = novoEnvelope;
      p.updatedAt = Date.now();
      await salvarProfile(p);
      await atualizarProfile(p);

      const shareUrl = await gerarLinkConviteWeb(p, p.vapidPrivateKeyJwk, p.vapidPublicKey);
      await navigator.clipboard.writeText(shareUrl);
      
      showToast("✅ Link de convite copiado! Agora envie para seu contato.", "success");
    } catch (err: any) {
      addDebugLog(`❌ Erro: ${err.message}`);
      showToast(`❌ ${err.message}`, "error");
    }
  };

  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 0 0 24px 0; overflow-y: auto;">
      
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 480px; width: 100%; margin-bottom: 24px; text-align: center;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span style="font-size: 0.9rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <md-icon>account_circle</md-icon> Identidade Local
          </span>
          <div style="display: flex; gap: 4px;">
            {temChaveVapid && !isEditing.value && (
              <md-icon-button onClick={() => isEditing.value = true} title="Editar meu perfil">
                <md-icon>edit</md-icon>
              </md-icon-button>
            )}
          </div>
        </div>

        <md-icon style="font-size: 64px; color: var(--md-sys-color-primary); margin-bottom: 24px;">account_circle</md-icon>

        {isEditing.value ? (
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px; text-align: left;">
            
            {!temChaveVapid && (
               <p style="font-size: 0.85rem; color: var(--md-sys-color-on-surface-variant); margin-bottom: 8px; text-align: center;">
                 Este nome será visível para os contatos que você convidar.
               </p>
            )}

            <md-outlined-text-field
              label="Seu Nome"
              placeholder="Ex: João da Silva"
              value={profileName.value}
              onInput={(e: Event) => profileName.value = (e.target as HTMLInputElement).value}
            ></md-outlined-text-field>
            
            <md-outlined-text-field
              label="Seu E-mail (Opcional)"
              placeholder="Ex: joao@email.com"
              value={profileEmail.value}
              onInput={(e: Event) => profileEmail.value = (e.target as HTMLInputElement).value}
            ></md-outlined-text-field>

            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <md-filled-button 
                onClick={handleGerarOuCorrigir} 
                style="flex: 1;"
                disabled={!profileName.value.trim() ? true : undefined}
              >
                {!temChaveVapid ? "🚀 Iniciar Perfil" : "💾 Salvar"}
              </md-filled-button>
              
              {temChaveVapid && (
                <md-outlined-button onClick={handleCancelarEdicao} style="flex: 1;">
                  Cancelar
                </md-outlined-button>
              )}
            </div>
          </div>
        ) : (
          <>
            <h2 style="justify-content: center; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              {p?.name?.trim() || "Anônimo"}
            </h2>
            <p style="color: var(--md-sys-color-on-surface-variant); font-size: 0.9rem; margin-bottom: 24px;">{p?.email || 'Sem e-mail'}</p>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <md-outlined-button onClick={handleCompartilhar} style="width: 100%;">
                <md-icon slot="icon">share</md-icon>
                Compartilhar Link de Convite
              </md-outlined-button>
            </div>
          </>
        )}
      </div>

      {qrCodeDataUrl.value && temChaveVapid && !isEditing.value && (
        <div class="container" style="background: #ffffff; color: #111111; max-width: 480px; width: 100%; border-left-color: var(--md-sys-color-primary); text-align: center;">
          <h3 style="font-size: 1rem; color: #111111; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <md-icon style="font-size: 1.2rem; color: #111111;">qr_code_2</md-icon>
            Seu QR Code
          </h3>
          <p style="font-size: 0.8rem; color: #555555; margin-bottom: 16px;">
            Mostre isso para um amigo escanear pelo App Loco.
          </p>
          <img src={qrCodeDataUrl.value} alt="QR Code" style="max-width: 220px; width: 100%; height: auto; border-radius: 8px; border: 1px solid #eeeeee; margin: 0 auto;" />
        </div>
      )}

    </div>
  );
}
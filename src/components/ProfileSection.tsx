// src/components/ProfileSection.tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { profile, carregarProfile, atualizarProfile } from '../stores/profileStore.ts';
import { profileName, profileEmail, addDebugLog, showToast } from '../signals/state.ts';
import { gerarProfileCompleto } from '../utils/profile-utils.ts';
import { cifrarChaveVapid } from '../utils/push-utils.ts';
import { salvarProfile } from '../utils/db-helpers.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';

export function ProfileSection() {
  const qrCodeDataUrl = useSignal<string | null>(null);

  useEffect(() => {
    carregarProfile();
  }, []);

  const p = profile.value;
  // A existência destas duas chaves assegura que o perfil está gerado
  const temChaveVapid = !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk);

  useEffect(() => {
    const renderQrCode = () => {
      if (!p) return;
      try {
        const payloadBinario = gerarPayloadQrCodeCompacto(p);
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
      
      if (eraNovo) {
        showToast(`✅ Perfil inicializado com sucesso!`, "success");
        window.location.href = '/';
      } else {
        showToast(`✅ Perfil atualizado!`, "success");
      }
    } catch (err: any) {
      addDebugLog(`❌ Erro no processo: ${err.message}`);
      showToast(`❌ Falha: ${err.message}`, "error");
    }
  };

  const handleCompartilhar = async () => {
    try {
      if (!p) return showToast("Salve o perfil primeiro.", "error");

      const resServerKey = await fetch("/api/server-public-key");
      if (!resServerKey.ok) throw new Error("Erro ao buscar chave do servidor.");
      const serverPublicKeyJwk = await resServerKey.json();
      
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

  const labelBotaoPrincipal = !temChaveVapid ? "🚀 Iniciar Perfil" : "💾 Atualizar Perfil";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div class="container" style="background: var(--md-sys-color-surface); margin-bottom: 0;">
        <h2 style="font-size: 1.1rem; margin-bottom: 12px;">👤 Seus Dados Pessoais</h2>
        <p style="font-size: 0.85rem; color: #666; margin-bottom: 16px;">
          Este nome será visível para os contatos que você convidar.
        </p>
        
        <md-outlined-text-field
          label="Seu Nome"
          placeholder="Ex: João da Silva"
          value={profileName.value}
          onInput={(e: Event) => profileName.value = (e.target as HTMLInputElement).value}
          style="margin-bottom: 12px;"
        ></md-outlined-text-field>
        
        <md-outlined-text-field
          label="Seu E-mail"
          placeholder="Ex: joao@email.com"
          value={profileEmail.value}
          onInput={(e: Event) => profileEmail.value = (e.target as HTMLInputElement).value}
          style="margin-bottom: 16px;"
        ></md-outlined-text-field>

        <div style="display: flex; gap: 8px; flex-direction: column;">
          <md-filled-button 
            onClick={handleGerarOuCorrigir} 
            style="width: 100%;"
            disabled={!profileName.value.trim() || !profileEmail.value.trim() ? true : undefined}
          >
            {labelBotaoPrincipal}
          </md-filled-button>
          
          <md-outlined-button onClick={handleCompartilhar} style="width: 100%;" disabled={!temChaveVapid ? true : undefined}>
            🔗 Compartilhar Perfil
          </md-outlined-button>
        </div>
      </div>

      {qrCodeDataUrl.value && temChaveVapid && (
        <div class="container" style="background: #fff; margin-bottom: 0; border-left-color: var(--md-sys-color-primary); text-align: center;">
          <h3 style="font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <md-icon style="font-size: 1.2rem;">qr_code_2</md-icon>
            Seu QR Code de Convite
          </h3>
          <p style="font-size: 0.8rem; color: #666; margin-bottom: 16px;">
            Mostre isso para um amigo escanear pelo App Loco.
          </p>
          <img src={qrCodeDataUrl.value} alt="QR Code" style="max-width: 220px; width: 100%; height: auto; border-radius: 8px; border: 1px solid #eee; margin: 0 auto;" />
        </div>
      )}

    </div>
  );
}
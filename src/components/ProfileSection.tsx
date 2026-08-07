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
  const diagnostic = useSignal({
    identificacao: false,
    criptografia: false,
    blindagemServidor: false,
    permissoes: false,
    inscricaoRegistrada: false,
    inscricaoValida: false,
    isOnline: navigator.onLine,
    loading: true,
  });

  const qrCodeDataUrl = useSignal<string | null>(null);

  useEffect(() => {
    const updateOnlineStatus = () => {
      diagnostic.value = { ...diagnostic.value, isOnline: navigator.onLine };
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const runDiagnostics = async () => {
    const p = profile.value;
    
    let envelopeOK = false;
    if (p?.vapidPrivateKeyEnvelope) {
      try {
        const envelopeJson = atob(p.vapidPrivateKeyEnvelope);
        const envelopeDecoded = JSON.parse(envelopeJson);
        if (envelopeDecoded.iv && envelopeDecoded.dadosCifrados && envelopeDecoded.chaveAesCifrada) {
          envelopeOK = true;
        }
      } catch (e) {
        console.warn("Envelope VAPID corrompido ou malformado.", e);
        envelopeOK = false;
      }
    }

    const diag = {
      identificacao: !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk),
      criptografia: !!(p?.e2ePublicKey && p?.e2ePrivateKeyJwk),
      blindagemServidor: envelopeOK,
      permissoes: false,
      inscricaoRegistrada: !!p?.subscription,
      inscricaoValida: false,
      isOnline: navigator.onLine,
    };

    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      diag.permissoes = true;
    }

    if (diag.permissoes && p?.subscription) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.pushManager) {
          const sub = await reg.pushManager.getSubscription();
          if (sub && sub.endpoint === p.subscription.endpoint) {
            diag.inscricaoValida = true;
          }
        }
      } catch (e) {
        console.error("Erro ao checar inscrição:", e);
      }
    }

    diagnostic.value = { ...diag, loading: false };
  };

  useEffect(() => {
    runDiagnostics();
  }, [profile.value]);

  const diag = diagnostic.value;
  const hasErrors = !diag.loading && (
    !diag.identificacao || 
    !diag.criptografia || 
    !diag.blindagemServidor || 
    !diag.permissoes || 
    !diag.inscricaoRegistrada || 
    !diag.inscricaoValida
  );

  useEffect(() => {
    const renderQrCode = () => {
      const p = profile.value;
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

    if (!hasErrors && profile.value) {
      renderQrCode();
    } else {
      qrCodeDataUrl.value = null;
    }
  }, [diagnostic.value, profile.value, hasErrors]);

  const handleGerarOuCorrigir = async () => {
    try {
      const p = await gerarProfileCompleto(profileName.value, profileEmail.value);
      await atualizarProfile(p);
      await runDiagnostics();
      
      if (hasErrors) {
        showToast(`✅ Problemas corrigidos com sucesso!`, "success");
      } else {
        showToast(`✅ Perfil atualizado!`, "success");
      }
    } catch (err: any) {
      addDebugLog(`❌ Erro no processo: ${err.message}`);
      showToast(`❌ Falha: ${err.message}`, "error");
      await runDiagnostics();
    }
  };

  const handleCompartilhar = async () => {
    try {
      let p = profile.value;
      if (!p) return showToast("Salve o perfil primeiro.", "error");

      const resServerKey = await fetch("/api/server-public-key");
      if (!resServerKey.ok) throw new Error("Erro ao buscar chave do servidor.");
      const serverPublicKeyJwk = await resServerKey.json();
      
      const novoEnvelope = await cifrarChaveVapid(p.vapidPrivateKeyJwk, serverPublicKeyJwk);
      p.vapidPrivateKeyEnvelope = novoEnvelope;
      p.updatedAt = Date.now();
      await salvarProfile(p);
      await atualizarProfile(p);

      const shareUrl = await gerarLinkConviteWeb(p, serverPublicKeyJwk);
      await navigator.clipboard.writeText(shareUrl);
      
      showToast("✅ Link de convite copiado! Agora envie para seu contato.", "success");
    } catch (err: any) {
      addDebugLog(`❌ Erro: ${err.message}`);
      showToast(`❌ ${err.message}`, "error");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div class="container" style="background: #f0f8f4; margin-bottom: 0;">
        <h2 style="font-size: 1.1rem; margin-bottom: 12px;">👤 Meus Dados</h2>
        
        <md-outlined-text-field
          label="Seu Nome"
          value={profileName.value}
          onInput={(e: any) => profileName.value = e.target.value}
          style="margin-bottom: 12px;"
        ></md-outlined-text-field>
        
        <md-outlined-text-field
          label="Seu E-mail"
          value={profileEmail.value}
          onInput={(e: any) => profileEmail.value = e.target.value}
          style="margin-bottom: 16px;"
        ></md-outlined-text-field>

        <div style="display: flex; gap: 8px; flex-direction: column;">
          {hasErrors ? (
            <md-filled-button onClick={handleGerarOuCorrigir} style="width: 100%; --md-sys-color-primary: #ba1a1a;">
              🔧 Corrigir Problemas
            </md-filled-button>
          ) : (
            <md-filled-button onClick={handleGerarOuCorrigir} style="width: 100%;">
              💾 Salvar Perfil
            </md-filled-button>
          )}
          
          <md-outlined-button onClick={handleCompartilhar} style="width: 100%;" disabled={hasErrors ? true : undefined}>
            🔗 Copiar Link de Convite
          </md-outlined-button>
        </div>
      </div>

      {qrCodeDataUrl.value && !hasErrors && (
        <div class="container" style="background: #fff; margin-bottom: 0; border-left-color: var(--md-sys-color-primary); text-align: center;">
          <h3 style="font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <md-icon style="font-size: 1.2rem;">qr_code_2</md-icon>
            Seu QR Code de Convite
          </h3>
          <p style="font-size: 0.8rem; color: #666; margin-bottom: 16px;">
            Aponte a câmera (pelo app Loco) para este código para se conectar.
          </p>
          <img src={qrCodeDataUrl.value} alt="QR Code" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee;" />
        </div>
      )}

      <div class="container" style="background: #fff; margin-bottom: 0; border-left-color: #555;">
        <h3 style="font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <md-icon style="font-size: 1.2rem;">health_and_safety</md-icon>
          Diagnóstico do Sistema
        </h3>
        
        {diag.loading ? (
          <p style="font-size: 0.85rem; color: #666; margin: 0;">Analisando...</p>
        ) : (
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: #444; line-height: 1.8;">
            <li>{diag.isOnline ? '✅' : '❌'} Conexão com a Internet</li>
            <li>{diag.identificacao ? '✅' : '❌'} Identidade (Chaves VAPID)</li>
            <li>{diag.criptografia ? '✅' : '❌'} Criptografia Ponto a Ponta (E2E)</li>
            <li>{diag.blindagemServidor ? '✅' : '❌'} Blindagem do Servidor (Envelope)</li>
            <li>{diag.permissoes ? '✅' : '❌'} Permissões do Navegador</li>
            <li>{diag.inscricaoRegistrada ? '✅' : '❌'} Inscrição Push registrada</li>
            <li>{diag.inscricaoValida ? '✅' : '❌'} Inscrição Push válida/ativa</li>
          </ul>
        )}
      </div>

    </div>
  );
}
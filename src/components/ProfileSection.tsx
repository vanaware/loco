// src/components/ProfileSection.tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { profile, carregarProfile, atualizarProfile } from '../stores/profileStore.ts';
import { profileName, profileEmail, addDebugLog, showToast } from '../signals/state.ts';
import { gerarProfileCompleto, solicitarArmazenamentoPersistente } from '../utils/profile-utils.ts';
import { cifrarChaveVapid } from '../utils/push-utils.ts';
import { salvarProfile } from '../utils/db-helpers.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';

export function ProfileSection() {
  const diagnostic = useSignal({
    // 🛑 Obrigatórios
    identificacao: false,
    criptografia: false,
    blindagemServidor: false,
    permissoesNotificacao: false,
    inscricaoRegistrada: false,
    inscricaoValida: false,
    swAtivoEControlando: false,

    // ⚡ Desejáveis & Status
    isOnline: navigator.onLine,
    isPwaInstalado: false,
    permissaoCamera: 'prompt',
    permissaoMicrofone: 'prompt',
    suporteBarcodeDetector: false,
    suporteOpfs: false,
    suporteWebRTC: false,
    suporteBackgroundSync: false,
    armazenamentoPersistido: false,
    cotaEspaco: { usoMB: 0, livreMB: 0 },

    loading: true,
  });

  const qrCodeDataUrl = useSignal<string | null>(null);

  useEffect(() => {
    carregarProfile();

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
    
    // 1. Checagem de Envelope VAPID
    let envelopeOK = false;
    if (p?.vapidPrivateKeyEnvelope) {
      try {
        const envelopeJson = atob(p.vapidPrivateKeyEnvelope);
        const envelopeDecoded = JSON.parse(envelopeJson);
        if (envelopeDecoded.iv && envelopeDecoded.dadosCifrados && envelopeDecoded.chaveAesCifrada) {
          envelopeOK = true;
        }
      } catch {
        envelopeOK = false;
      }
    }

    // 2. Consulta de Permissões de Mídia
    let cameraState = 'prompt';
    let micState = 'prompt';
    if ('navigator' in window && 'permissions' in navigator && navigator.permissions.query) {
      try {
        const resCam = await navigator.permissions.query({ name: 'camera' as any });
        cameraState = resCam.state;
      } catch { cameraState = 'prompt'; }
      
      try {
        const resMic = await navigator.permissions.query({ name: 'microphone' as any });
        micState = resMic.state;
      } catch { micState = 'prompt'; }
    }

    // 3. Estimativa de Armazenamento
    let storagePersisted = false;
    let quotaInfo = { usoMB: 0, livreMB: 0 };
    if ('storage' in navigator) {
      if (navigator.storage.persisted) {
        try { storagePersisted = await navigator.storage.persisted(); } catch { storagePersisted = false; }
      }
      if (navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          const usage = estimate.usage || 0;
          const quota = estimate.quota || 0;
          quotaInfo = {
            usoMB: +(usage / (1024 * 1024)).toFixed(1),
            livreMB: +((quota - usage) / (1024 * 1024)).toFixed(0)
          };
        } catch { /* Fallback */ }
      }
    }

    // 4. Estado do Service Worker e Sync
    let swControlando = false;
    let hasBackgroundSync = false;
    if ('serviceWorker' in navigator) {
      swControlando = navigator.serviceWorker.controller !== null;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          hasBackgroundSync = 'sync' in reg;
        }
      } catch { hasBackgroundSync = false; }
    }

    const diag = {
      // 🛑 Obrigatórios
      identificacao: !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk),
      criptografia: !!(p?.e2ePublicKey && p?.e2ePrivateKeyJwk),
      blindagemServidor: envelopeOK,
      permissoesNotificacao: 'Notification' in window && Notification.permission === 'granted',
      inscricaoRegistrada: !!p?.subscription,
      inscricaoValida: false,
      swAtivoEControlando: swControlando,

      // ⚡ Desejáveis & Status
      isOnline: navigator.onLine,
      isPwaInstalado: window.matchMedia('(display-mode: standalone)').matches,
      permissaoCamera: cameraState,
      permissaoMicrofone: micState,
      suporteBarcodeDetector: 'BarcodeDetector' in window,
      suporteOpfs: 'storage' in navigator && 'getDirectory' in navigator.storage,
      suporteWebRTC: 'RTCPeerConnection' in window,
      suporteBackgroundSync: hasBackgroundSync,
      armazenamentoPersistido: storagePersisted,
      cotaEspaco: quotaInfo,

      loading: false,
    };

    if (diag.permissoesNotificacao && p?.subscription) {
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

    diagnostic.value = diag;
  };

  useEffect(() => {
    runDiagnostics();
  }, [profile.value]);

  const diag = diagnostic.value;

  // Verifica se existem chaves VAPID criadas no perfil
  const temChaveVapid = !!(profile.value?.vapidPublicKey && profile.value?.vapidPrivateKeyJwk);

  // Erros graves apenas em requisitos OBRIGATÓRIOS
  const hasErrors = !diag.loading && (
    !diag.identificacao || 
    !diag.criptografia || 
    !diag.blindagemServidor || 
    !diag.permissoesNotificacao || 
    !diag.inscricaoRegistrada || 
    !diag.inscricaoValida ||
    !diag.swAtivoEControlando
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
    const eraNovo = !temChaveVapid;
    try {
      const p = await gerarProfileCompleto(profileName.value, profileEmail.value);
      await atualizarProfile(p);
      await runDiagnostics();
      
      if (eraNovo) {
        showToast(`✅ Perfil inicializado com sucesso!`, "success");
        window.location.href = '/';
        return;
      }

      if (hasErrors) {
        showToast(`✅ Perfil restaurado com sucesso!`, "success");
      } else {
        showToast(`✅ Perfil atualizado!`, "success");
      }
    } catch (err: any) {
      addDebugLog(`❌ Erro no processo: ${err.message}`);
      showToast(`❌ Falha: ${err.message}`, "error");
      await runDiagnostics();
    }
  };

  const handleSolicitarPersistenciaManual = async () => {
    const ok = await solicitarArmazenamentoPersistente();
    if (ok) {
      showToast("✅ Armazenamento Persistente protegido com sucesso!", "success");
    } else {
      showToast("ℹ️ O navegador manteve o armazenamento padrão. Tente adicionar o app à Tela Inicial.", "info");
    }
    await runDiagnostics();
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

      const shareUrl = await gerarLinkConviteWeb(p, p.vapidPrivateKeyJwk, p.vapidPublicKey);
      await navigator.clipboard.writeText(shareUrl);
      
      showToast("✅ Link de convite copiado! Agora envie para seu contato.", "success");
    } catch (err: any) {
      addDebugLog(`❌ Erro: ${err.message}`);
      showToast(`❌ ${err.message}`, "error");
    }
  };

  // 🔥 Rótulo dinâmico do botão principal
  const labelBotaoPrincipal = !temChaveVapid
    ? "🚀 Iniciar Perfil"
    : hasErrors
    ? "🔧 Restaurar Perfil"
    : "💾 Atualizar Perfil";

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      <div class="container" style="background: var(--md-sys-color-surface); margin-bottom: 0;">
        <h2 style="font-size: 1.1rem; margin-bottom: 12px;">👤 Seus Dados Pessoais</h2>
        <p style="font-size: 0.85rem; color: #666; margin-bottom: 16px;">
          Este nome será visível para os contatos que você convidar.
        </p>
        
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
          <md-filled-button 
            onClick={handleGerarOuCorrigir} 
            style={`width: 100%; ${hasErrors && temChaveVapid ? '--md-sys-color-primary: #ba1a1a;' : ''}`}
          >
            {labelBotaoPrincipal}
          </md-filled-button>
          
          <md-outlined-button onClick={handleCompartilhar} style="width: 100%;" disabled={hasErrors || !temChaveVapid ? true : undefined}>
            🔗 Compartilhar Perfil
          </md-outlined-button>
        </div>
      </div>

      {qrCodeDataUrl.value && !hasErrors && (
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

      {/* DIAGNÓSTICO DO SISTEMA (2 GRUPOS) */}
      <div class="container" style="background: #fff; margin-bottom: 0; border-left-color: #555;">
        <h3 style="font-size: 0.95rem; margin-top: 0; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
          <md-icon style="font-size: 1.2rem;">health_and_safety</md-icon>
          Diagnóstico do Sistema
        </h3>
        
        {diag.loading ? (
          <p style="font-size: 0.85rem; color: #666; margin: 0;">Analisando requisitos...</p>
        ) : (
          <div style="display: flex; flex-direction: column; gap: 16px;">
            
            {/* GRUPO 1: OBRIGATÓRIOS */}
            <div>
              <h4 style="font-size: 0.8rem; margin: 0 0 8px 0; color: var(--md-sys-color-primary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                🛑 Requisitos Obrigatórios
              </h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: #444; line-height: 1.8;">
                <li>{diag.identificacao ? '✅' : '❌'} Identidade (Chaves VAPID)</li>
                <li>{diag.criptografia ? '✅' : '❌'} Criptografia Ponto a Ponta (E2E)</li>
                <li>{diag.blindagemServidor ? '✅' : '❌'} Blindagem do Servidor (Envelope)</li>
                <li>{diag.permissoesNotificacao ? '✅' : '❌'} Permissão de Notificações</li>
                <li>{diag.inscricaoRegistrada ? '✅' : '❌'} Inscrição Push registrada</li>
                <li>{diag.inscricaoValida ? '✅' : '❌'} Inscrição Push válida/ativa</li>
                <li>{diag.swAtivoEControlando ? '✅' : '❌'} Service Worker em controle ativo</li>
              </ul>
            </div>

            <md-divider></md-divider>

            {/* GRUPO 2: DESEJÁVEIS & STATUS */}
            <div>
              <h4 style="font-size: 0.8rem; margin: 0 0 8px 0; color: var(--md-sys-color-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                ⚡ Recursos Desejáveis & Status
              </h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: #444; line-height: 1.8;">
                <li>{diag.isOnline ? '✅ Conexão com a Internet' : '⚠️ Dispositivo Offline (Mensagens enfileiradas)'}</li>
                <li>
                  {diag.isPwaInstalado ? '✅ App Instalado (PWA Standalone)' : 'ℹ️ Executando na Aba do Navegador'}
                </li>
                <li>
                  {diag.suporteOpfs ? '✅ Disco Virtual OPFS Suportado (Anexos/Mídia)' : '⚠️ Sem suporte a OPFS'}
                </li>
                <li>
                  {diag.suporteWebRTC ? '✅ P2P WebRTC Disponível' : '⚠️ Sem Suporte a WebRTC P2P'}
                </li>
                <li>
                  {diag.suporteBackgroundSync ? '✅ Background Sync Ativo (Envio offline)' : 'ℹ️ Sem Background Sync nativo'}
                </li>
                <li>
                  {diag.permissaoCamera === 'granted' ? '✅ Permissão de Câmera Concedida' :
                   diag.permissaoCamera === 'denied' ? '⚠️ Permissão de Câmera Negada' :
                   'ℹ️ Permissão de Câmera (Pedida no leitor QR)'}
                </li>
                <li>
                  {diag.suporteBarcodeDetector ? '✅ Leitor Nativo de QR Code' : '⚠️ Leitor QR Nativo Indisponível'}
                </li>
                <li style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                  <span>
                    {diag.armazenamentoPersistido ? '✅ Armazenamento Persistente Protegido' : 'ℹ️ Armazenamento Padrão'}
                  </span>
                  {!diag.armazenamentoPersistido && (
                    <md-outlined-button onClick={handleSolicitarPersistenciaManual} style="height: 32px; font-size: 0.75rem; margin-bottom: 0;">
                      Proteger Dados
                    </md-outlined-button>
                  )}
                </li>
                {diag.cotaEspaco.livreMB > 0 && (
                  <li style="color: #666; font-size: 0.8rem; margin-top: 4px;">
                    📊 Uso: <strong>{diag.cotaEspaco.usoMB} MB</strong> de ~{(diag.cotaEspaco.livreMB / 1024).toFixed(1)} GB livres
                  </li>
                )}
              </ul>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
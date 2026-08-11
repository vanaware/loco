import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { profile } from '../stores/profileStore.ts';
import { showToast } from '../signals/state.ts';
import { solicitarArmazenamentoPersistente } from '../utils/profile-utils.ts';
import { DebugPanel } from './DebugPanel.tsx';
import { APP_VERSION } from '../constants/version.ts'; 
import { navigate } from '../utils/router.ts';

export function AdvancedSection() {
  const diagnostic = useSignal({
    identificacao: false, criptografia: false, blindagemServidor: false,
    permissoesNotificacao: false, inscricaoRegistrada: false, inscricaoValida: false,
    swAtivoEControlando: false, isOnline: navigator.onLine, isPwaInstalado: false,
    permissaoCamera: 'prompt', permissaoMicrofone: 'prompt', suporteBarcodeDetector: false,
    suporteOpfs: false, suporteWebRTC: false, suporteBackgroundSync: false,
    armazenamentoPersistido: false, cotaEspaco: { usoMB: 0, livreMB: 0 },
    loading: true,
  });

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
      } catch { envelopeOK = false; }
    }

    let cameraState = 'prompt', micState = 'prompt';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('navigator' in window && 'permissions' in navigator && (navigator as any).permissions.query) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { cameraState = (await (navigator as any).permissions.query({ name: 'camera' as any })).state; } catch {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { micState = (await (navigator as any).permissions.query({ name: 'microphone' as any })).state; } catch {}
    }

    let storagePersisted = false;
    let quotaInfo = { usoMB: 0, livreMB: 0 };
    if ('storage' in navigator) {
      if (navigator.storage.persisted) {
        try { storagePersisted = await navigator.storage.persisted(); } catch {}
      }
      if (navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          quotaInfo = {
            usoMB: +((estimate.usage || 0) / (1024 * 1024)).toFixed(1),
            livreMB: +(((estimate.quota || 0) - (estimate.usage || 0)) / (1024 * 1024)).toFixed(0)
          };
        } catch {}
      }
    }

    let swControlando = false, hasBackgroundSync = false;
    if ('serviceWorker' in navigator) {
      swControlando = navigator.serviceWorker.controller !== null;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) hasBackgroundSync = 'sync' in reg;
      } catch {}
    }

    const diag = {
      identificacao: !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk),
      criptografia: !!(p?.e2ePublicKey && p?.e2ePrivateKeyJwk),
      blindagemServidor: envelopeOK,
      permissoesNotificacao: 'Notification' in window && Notification.permission === 'granted',
      inscricaoRegistrada: !!p?.subscription,
      inscricaoValida: false,
      swAtivoEControlando: swControlando,
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
          if (sub && sub.endpoint === p.subscription.endpoint) diag.inscricaoValida = true;
        }
      } catch {}
    }

    diagnostic.value = diag;
  };

  useEffect(() => {
    runDiagnostics();
    const updateOnlineStatus = () => { diagnostic.value = { ...diagnostic.value, isOnline: navigator.onLine }; };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [profile.value]);

  const diag = diagnostic.value;

  const handleSolicitarPersistenciaManual = async () => {
    const ok = await solicitarArmazenamentoPersistente();
    if (ok) showToast("✅ Armazenamento Persistente protegido com sucesso!", "success");
    else showToast("ℹ️ O navegador manteve o armazenamento padrão. Tente adicionar o app à Tela Inicial.", "info");
    await runDiagnostics();
  };

  const handleFechar = () => {
    navigate(''); 
  };

  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 600px; width: 100%;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 1rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <md-icon>health_and_safety</md-icon> Diagnóstico do Sistema
            </span>
            <span style="font-size: 0.75rem; color: #888; margin-left: 30px;">
              Build Version: v{APP_VERSION}
            </span>
          </div>
          <md-icon-button onClick={handleFechar} title="Fechar Avançado">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
        
        {diag.loading ? (
          <p style="font-size: 0.85rem; color: #666; margin: 0;">Analisando requisitos...</p>
        ) : (
          <div style="display: flex; flex-direction: column; gap: 16px;">
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
            <div>
              <h4 style="font-size: 0.8rem; margin: 0 0 8px 0; color: var(--md-sys-color-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                ⚡ Recursos Desejáveis & Status
              </h4>
              <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: #444; line-height: 1.8;">
                <li>{diag.isOnline ? '✅ Conexão com a Internet' : '⚠️ Dispositivo Offline (Mensagens enfileiradas)'}</li>
                <li>{diag.isPwaInstalado ? '✅ App Instalado (PWA Standalone)' : 'ℹ️ Executando na Aba do Navegador'}</li>
                <li>{diag.suporteOpfs ? '✅ Disco Virtual OPFS Suportado' : '⚠️ Sem suporte a OPFS'}</li>
                <li>{diag.suporteWebRTC ? '✅ P2P WebRTC Disponível' : '⚠️ Sem Suporte a WebRTC P2P'}</li>
                <li>{diag.suporteBackgroundSync ? '✅ Background Sync Ativo' : 'ℹ️ Sem Background Sync nativo'}</li>
                <li>
                  {diag.permissaoCamera === 'granted' ? '✅ Permissão de Câmera Concedida' :
                   diag.permissaoCamera === 'denied' ? '⚠️ Permissão de Câmera Negada' :
                   'ℹ️ Permissão de Câmera (Pendente)'}
                </li>
                <li>{diag.suporteBarcodeDetector ? '✅ Leitor Nativo de QR Code' : '⚠️ Leitor QR Nativo Indisponível'}</li>
                <li style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                  <span>{diag.armazenamentoPersistido ? '✅ Armazenamento Persistente Protegido' : 'ℹ️ Armazenamento Padrão'}</span>
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

      <div style="max-width: 600px; width: 100%;">
        <DebugPanel />
      </div>
    </div>
  );
}
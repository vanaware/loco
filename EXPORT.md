> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/9/2026, 12:57:16 AM

---

## Arquivo: `src/components/DebugPanel.tsx`

```tsx
// src/components/DebugPanel.tsx
import { debugLogs, clearDebugLogs } from '../signals/state.ts';

export function DebugPanel() {
  const logs = debugLogs.value;

  return (
    <div class="container" style="background: #f5f5f5; border: 2px dashed #999; margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2 style="margin: 0;">🔍 Debug Logs</h2>
        <md-outlined-button onClick={clearDebugLogs}>🗑️ Limpar Logs</md-outlined-button>
      </div>
      <div id="debugPanel" style="background: #000; color: #0f0; font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; border-radius: 4px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
        {logs.length === 0 ? (
          <div>Aguardando logs...</div>
        ) : (
          logs.map((log, index) => <div key={index}>{log}</div>)
        )}
      </div>
    </div>
  );
}
```

---

## Arquivo: `src/components/ProfileSection.tsx`

```tsx
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
```

---

## Arquivo: `src/components/ChatSection.tsx`

```tsx
// src/components/ChatSection.tsx
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { contatoSelecionado, showToast } from '../signals/state.ts';
import { listarMensagensEnviadas, listarMensagensRecebidas } from '../utils/db-helpers.ts';

// Tipagem unificada para a tela de chat
interface ChatMessage {
  id: string;
  conteudo: string;
  isMine: boolean;
  timestamp: number;
  status?: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'entregue' | 'nao_lida' | 'lida' | 'notificada';
}

export function ChatSection() {
  const mensagens = useSignal<ChatMessage[]>([]);
  const inputText = useSignal<string>('');
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const carregarMensagens = async () => {
    const hashAtivo = contatoSelecionado.value;
    if (!hashAtivo) return;

    try {
      // 1. Busca mensagens enviadas para este contato
      const todasEnviadas = await listarMensagensEnviadas();
      const enviadas = todasEnviadas
        .filter(m => m.contatoHash === hashAtivo)
        .map(m => ({
          id: m.id,
          conteudo: m.conteudo,
          isMine: true,
          timestamp: m.createdAt,
          status: m.status
        }));

      // 2. Busca mensagens recebidas deste contato
      const todasRecebidas = await listarMensagensRecebidas();
      const recebidas = todasRecebidas
        .filter(m => m.contatoPublicKeyVapid === hashAtivo)
        .map(m => ({
          id: m.id,
          conteudo: m.conteudo,
          isMine: false,
          timestamp: m.recebidoEm,
          status: m.status
        }));

      // 3. Junta tudo e ordena por data
      const historico = [...enviadas, ...recebidas].sort((a, b) => a.timestamp - b.timestamp);
      mensagens.value = historico;

      // Rola para o fim
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 100);

    } catch (err) {
      console.error("Erro ao carregar mensagens do chat:", err);
    }
  };

  // Efeito de inicialização e reação à mudança de contato
  useEffect(() => {
    carregarMensagens();

    // Listener para reagir a mensagens chegando em tempo real ou confirmações (✓✓)
    const handleMessage = (e: MessageEvent) => {
      if (
        e.data?.type === 'PUSH_RECEIVED' || 
        e.data?.type === 'MENSAGEM_ENTREGUE' ||
        e.data?.type === 'SYNC_COMPLETE'
      ) {
        carregarMensagens();
      }
    };
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [contatoSelecionado.value]);

  const handleEnviar = async () => {
    const texto = inputText.value.trim();
    const hashAtivo = contatoSelecionado.value;
    
    if (!texto || !hashAtivo) return;
    inputText.value = ''; // Limpa o campo rapidamente

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error("Service Worker inativo");

      // Delega a criação da mensagem e do Handshake para o SW
      reg.active.postMessage({
        type: 'CRIAR_HANDSHAKE_OUT',
        payload: {
          rotasModulo: 'mensagem',
          params: {
            function: 'enviarMensagem',
            contato: hashAtivo,
            conteudo: texto
          }
        }
      });
      
      // O SW fará a inserção no banco e processará a fila, 
      // então disparamos uma recarga visual rápida
      setTimeout(() => carregarMensagens(), 300);

    } catch (err: any) {
      showToast(`❌ Erro ao enviar: ${err.message}`, "error");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  // Helper para desenhar os "tiques" de status das mensagens enviadas
  const renderStatus = (status: ChatMessage['status']) => {
    switch (status) {
      case 'pendente':
      case 'enviando':
        return <md-icon style="font-size: 14px; opacity: 0.6;">schedule</md-icon>;
      case 'enviada':
        return <md-icon style="font-size: 14px; opacity: 0.8;">check</md-icon>;
      case 'entregue':
      case 'lida':
        // Dois tiques para entregue (você pode customizar com ícone done_all ou colorir de azul)
        return <md-icon style="font-size: 14px; color: var(--md-sys-color-primary);">done_all</md-icon>;
      case 'falha':
        return <md-icon style="font-size: 14px; color: var(--md-sys-color-error);">error</md-icon>;
      default:
        return null;
    }
  };

  return (
    // CORREÇÃO 1: Adicionado `overflow: hidden;` para o wrapper não expandir infinitamente
    <div style="display: flex; flex-direction: column; height: 100%; flex-grow: 1; overflow: hidden;">
      
      {/* Área de rolagem das mensagens */}
      <div 
        ref={chatScrollRef}
        style="flex-grow: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: var(--md-sys-color-surface-container-lowest);"
      >
        {mensagens.value.length === 0 ? (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888; font-size: 0.9rem;">
            Nenhuma mensagem. Diga um "Olá" (criptografado)! 🔒
          </div>
        ) : (
          mensagens.value.map(msg => (
            <div 
              key={msg.id} 
              style={`display: flex; flex-direction: column; max-width: 80%; align-self: ${msg.isMine ? 'flex-end' : 'flex-start'};`}
            >
              <div style={`
                padding: 10px 14px;
                border-radius: 16px;
                background: ${msg.isMine ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-variant)'};
                color: ${msg.isMine ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
                border-bottom-right-radius: ${msg.isMine ? '4px' : '16px'};
                border-bottom-left-radius: ${!msg.isMine ? '4px' : '16px'};
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                white-space: pre-wrap;
                word-wrap: break-word;
              `}>
                {msg.conteudo}
              </div>
              
              <div style={`display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 0.7rem; color: #888; align-self: ${msg.isMine ? 'flex-end' : 'flex-start'};`}>
                <span>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {msg.isMine && renderStatus(msg.status)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input e Barra inferior */}
      {/* CORREÇÃO 2: Adicionado `flex-shrink: 0;` para evitar que a barra seja esmagada pela rolagem */}
      <div style="flex-shrink: 0; padding: 12px 16px; background: var(--md-sys-color-surface); border-top: 1px solid var(--md-sys-color-outline-variant); display: flex; gap: 8px; align-items: flex-end;">
        <md-outlined-text-field
          style="flex-grow: 1; margin-bottom: 0;"
          placeholder="Escreva uma mensagem..."
          value={inputText.value}
          onInput={(e: any) => inputText.value = e.target.value}
          onKeyDown={handleKeyDown}
        ></md-outlined-text-field>
        
        <md-filled-icon-button 
          onClick={handleEnviar}
          disabled={!inputText.value.trim()}
          style="height: 56px; width: 56px; border-radius: 16px;"
        >
          <md-icon>send</md-icon>
        </md-filled-icon-button>
      </div>

    </div>
  );
}
```

---

## Arquivo: `src/components/ContatosSection.tsx`

```tsx
// src/components/ContatosSection.tsx
import { useEffect } from 'preact/hooks';
import { contatosComHash, removerContatoPorPublicKey, homologarContatoPorPublicKey } from '../stores/contatosStore.ts';
import { showToast, contatoSelecionado, contatoCompartilharHash, currentMobileView } from '../signals/state.ts';

export function ContatosSection() {
  useEffect(() => {}, []);

  const abrirChat = (hash: string) => {
    contatoCompartilharHash.value = null;
    contatoSelecionado.value = hash;
    currentMobileView.value = 'chat';
  };

  const abrirDetalhesContato = (e: Event, hash: string) => {
    e.stopPropagation();
    contatoCompartilharHash.value = hash;
    currentMobileView.value = 'chat';
  };

  return (
    <div class="container container-contatos" style="border-left-color: #6c4f00; margin-bottom: 24px;">
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="font-size: 1.1rem; margin: 0;">📇 Meus Contatos</h2>
        <md-icon-button onClick={() => window.location.href = '/share.html'} title="Adicionar / Escanear Contato">
          <md-icon>person_add</md-icon>
        </md-icon-button>
      </div>
      
      <div style="max-height: calc(100vh - 220px); overflow-y: auto; background: var(--md-sys-color-surface-variant); border-radius: 8px;">
        {contatosComHash.value.length === 0 ? (
          <p style="padding: 16px; color: #666; text-align: center; margin: 0;">Nenhum contato adicionado.</p>
        ) : (
          <md-list>
            {contatosComHash.value.map(({ contato, hash }) => {
              const nomeExibicao = contato.name?.trim() || "Anônimo";
              return (
                <md-list-item 
                  key={hash} 
                  onClick={() => abrirChat(hash)}
                  style="cursor: pointer;"
                >
                  <md-icon slot="start">person</md-icon>
                  
                  <div slot="headline" style="display: flex; align-items: center; gap: 6px;">
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; display: block;">
                      <strong>{nomeExibicao}</strong>
                    </span>
                    {contato.trusted && (
                      <md-icon title="Contato Confiável" style="color: var(--md-sys-color-primary); font-size: 1.2rem;">verified</md-icon>
                    )}
                  </div>
                  
                  <span slot="supporting-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">
                    {contato.email || 'Sem e-mail'}
                  </span>
                  
                  <div slot="end" style="display: flex; gap: 0px; align-items: center; flex-shrink: 0;">
                    <md-icon-button onClick={(e) => abrirDetalhesContato(e, hash)}>
                      <md-icon>qr_code_2</md-icon>
                    </md-icon-button>

                    {!contato.trusted && (
                      <md-icon-button onClick={async (e) => {
                        e.stopPropagation();
                        await homologarContatoPorPublicKey(contato.vapidPublicKey);
                        showToast("Contato marcado como confiável!", "success");
                      }}>
                        <md-icon>verified</md-icon>
                      </md-icon-button>
                    )}

                    <md-icon-button onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Remover ${nomeExibicao} dos contatos?`)) {
                        await removerContatoPorPublicKey(contato.vapidPublicKey);
                      }
                    }}>
                      <md-icon>delete</md-icon>
                    </md-icon-button>
                  </div>
                </md-list-item>
              );
            })}
          </md-list>
        )}
      </div>
    </div>
  );
}
```

---

## Arquivo: `src/components/ContactDetailSection.tsx`

```tsx
// src/components/ContactDetailSection.tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { contatosComHash, adicionarContato } from '../stores/contatosStore.ts';
import { profile } from '../stores/profileStore.ts';
import { contatoSelecionado, contatoCompartilharHash, currentMobileView, showToast } from '../signals/state.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';

export function ContactDetailSection() {
  const qrCodeDataUrl = useSignal<string | null>(null);
  const isEditing = useSignal<boolean>(false);
  const editNome = useSignal<string>('');
  const editEmail = useSignal<string>('');

  const hash = contatoCompartilharHash.value;
  const item = contatosComHash.value.find(c => c.hash === hash);
  const contato = item?.contato;

  useEffect(() => {
    if (!contato) {
      qrCodeDataUrl.value = null;
      isEditing.value = false;
      return;
    }

    editNome.value = contato.name || '';
    editEmail.value = contato.email || '';

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

  const nomeExibicao = contato.name?.trim() || "Anônimo";

  const handleCopiarLink = async () => {
    const p = profile.value;
    if (!p) return showToast("Configure seu perfil primeiro para indicar contatos.", "error");

    try {
      const shareUrl = await gerarLinkConviteWeb(contato, p.vapidPrivateKeyJwk, p.vapidPublicKey);
      await navigator.clipboard.writeText(shareUrl);
      showToast(`✅ Link de indicação de ${nomeExibicao} copiado!`, "success");
    } catch (err: any) {
      showToast(`❌ Falha ao gerar link: ${err.message}`, "error");
    }
  };

  // 🔥 NOVO: Envia agressivamente os dados locais (Push) para o celular do contato salvar
  const handleEnviarMeusDados = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error("Service Worker inativo.");
      
      reg.active.postMessage({
        type: 'CRIAR_HANDSHAKE_OUT',
        payload: {
          rotasModulo: 'contato',
          params: {
            function: 'enviarSubscription',
            contato: hash,
            responder: false // false significa que queremos que ele acuse recebimento mandando os dados dele
          }
        }
      });
      
      showToast("🚀 Meus dados foram enviados para o contato!", "success");
    } catch (err: any) {
      showToast(`❌ Erro ao enviar dados: ${err.message}`, "error");
    }
  };

  // Mantido: Faz o Pull para diagnosticar a consistência sem sobrescrever nada
  const handleSolicitarAtualizacao = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error("Service Worker inativo.");
      
      reg.active.postMessage({
        type: 'CRIAR_HANDSHAKE_OUT',
        payload: {
          rotasModulo: 'contato',
          params: {
            function: 'confirmarSubscription',
            contato: hash,
            campos: ['trusted', 'subscription', 'vapidPublicKey', 'vapidPrivateKeyEnvelope', 'e2ePublicKey']
          }
        }
      });
      
      showToast("🔄 Solicitação de diagnóstico enviada!", "info");
    } catch (err: any) {
      showToast(`❌ Erro ao solicitar verificação: ${err.message}`, "error");
    }
  };

  const handleSalvarEdicao = async () => {
    try {
      const contatoAtualizado = {
        ...contato,
        name: editNome.value.trim(),
        email: editEmail.value.trim(),
        updatedAt: Date.now(),
      };

      await adicionarContato(contatoAtualizado);
      isEditing.value = false;
      showToast("✅ Dados do contato atualizados!", "success");
    } catch (err: any) {
      showToast(`❌ Erro ao salvar contato: ${err.message}`, "error");
    }
  };

  const handleCancelarEdicao = () => {
    editNome.value = contato.name || '';
    editEmail.value = contato.email || '';
    isEditing.value = false;
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
          <div style="display: flex; gap: 4px;">
            {!isEditing.value && (
              <md-icon-button onClick={() => isEditing.value = true} title="Editar contato">
                <md-icon>edit</md-icon>
              </md-icon-button>
            )}
            <md-icon-button onClick={handleFechar} title="Fechar">
              <md-icon>close</md-icon>
            </md-icon-button>
          </div>
        </div>

        <md-icon style="font-size: 64px; color: var(--md-sys-color-primary); margin-bottom: 8px;">account_circle</md-icon>

        {isEditing.value ? (
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; text-align: left;">
            <md-outlined-text-field
              label="Nome do Contato"
              value={editNome.value}
              onInput={(e: any) => editNome.value = e.target.value}
            ></md-outlined-text-field>

            <md-outlined-text-field
              label="E-mail do Contato"
              value={editEmail.value}
              onInput={(e: any) => editEmail.value = e.target.value}
            ></md-outlined-text-field>

            <div style="display: flex; gap: 8px; margin-top: 4px;">
              <md-filled-button onClick={handleSalvarEdicao} style="flex: 1;">
                💾 Salvar
              </md-filled-button>
              <md-outlined-button onClick={handleCancelarEdicao} style="flex: 1;">
                Cancelar
              </md-outlined-button>
            </div>
          </div>
        ) : (
          <>
            <h2 style="justify-content: center; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              {nomeExibicao}
            </h2>

            {contato.trusted && (
              <div style="display: flex; justify-content: center; align-items: center; gap: 6px; color: var(--md-sys-color-primary); font-weight: 600; font-size: 0.9rem; margin-bottom: 6px;">
                <md-icon style="font-size: 1.2rem;">verified</md-icon> Contato Confiável
              </div>
            )}

            <p style="color: #666; font-size: 0.9rem; margin-bottom: 20px;">{contato.email || 'Sem e-mail'}</p>
          </>
        )}

        {!isEditing.value && (
          <>
            {/* PAINEL DE STATUS DE CONFIANÇA MÚTUA */}
            <div style="background: var(--md-sys-color-surface-variant); padding: 16px; border-radius: 12px; margin-bottom: 20px; text-align: left; display: flex; flex-direction: column; gap: 16px;">
              
              {/* Como EU vejo ele (trusted) */}
              <div>
                <div style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.5px; color: var(--md-sys-color-on-surface-variant);">
                  COMO VOCÊ VÊ ESTE CONTATO:
                </div>
                <div style="font-size: 0.9rem; display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                  {contato.trusted ? (
                    <><md-icon style="color: var(--md-sys-color-primary); font-size: 1.2rem;">verified</md-icon> Identidade verificada (Confiável)</>
                  ) : (
                    <><md-icon style="color: #888; font-size: 1.2rem;">help</md-icon> Contato desconhecido (Não verificado)</>
                  )}
                </div>
              </div>

              {/* Como ELE me vê (me) */}
              <div>
                <div style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.5px; color: var(--md-sys-color-on-surface-variant);">
                  COMO ESTE CONTATO VÊ VOCÊ:
                </div>
                <div style="font-size: 0.9rem; display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                  {contato.me === 'trusted' && <><md-icon style="color: #0b8043; font-size: 1.2rem;">verified_user</md-icon> Ele(a) marcou você como Confiável</>}
                  {contato.me === 'saved' && <><md-icon style="color: var(--md-sys-color-primary); font-size: 1.2rem;">how_to_reg</md-icon> Ele(a) possui seu contato salvo</>}
                  {contato.me === 'wrong' && <><md-icon style="color: var(--md-sys-color-error); font-size: 1.2rem;">warning</md-icon> Seus dados no celular dele(a) estão desatualizados</>}
                  {(!contato.me || contato.me === 'none') && <><md-icon style="color: #888; font-size: 1.2rem;">person_off</md-icon> Ele(a) ainda não possui seu contato salvo</>}
                </div>
              </div>

            </div>

            {qrCodeDataUrl.value && (
              <div style="background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #eee; margin-bottom: 20px; display: inline-block;">
                <img src={qrCodeDataUrl.value} alt="QR Code do Contato" style="max-width: 220px; width: 100%; height: auto; display: block; margin: 0 auto;" />
                <span style="font-size: 0.75rem; color: #888; display: block; margin-top: 8px;">
                  Aponte a câmera (pelo App Loco) para se conectar com {nomeExibicao.split(' ')[0]}
                </span>
              </div>
            )}

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <md-filled-button onClick={handleCopiarLink} style="width: 100%;">
                <md-icon slot="icon">share</md-icon>
                Copiar Link de Indicação
              </md-filled-button>

              {/* 🔥 NOVO BOTÃO: Enviar/Forçar meus dados para ele */}
              <md-outlined-button onClick={handleEnviarMeusDados} style="width: 100%;">
                <md-icon slot="icon">send_to_mobile</md-icon>
                Enviar meus dados ao contato
              </md-outlined-button>

              {/* Botão Antigo de Diagnóstico */}
              <md-outlined-button onClick={handleSolicitarAtualizacao} style="width: 100%;">
                <md-icon slot="icon">sync</md-icon>
                Verificar Status de Confiança
              </md-outlined-button>

              <md-outlined-button onClick={handleIniciarChat} style="width: 100%;">
                <md-icon slot="icon">chat</md-icon>
                Iniciar Conversa
              </md-outlined-button>
            </div>
          </>
        )}

      </div>

    </div>
  );
}
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  MENSAGENS_ENVIADAS: "BrowserA_MensagensEnviadas_DB",
  CONTATOS: "BrowserB_Contatos_DB",
  MENSAGENS_RECEBIDAS_B: "BrowserB_MensagensRecebidas_DB",
  HANDSHAKES: "Handshake_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  MENSAGENS_ENVIADAS: "mensagens_enviadas",
  CONTATO: "contato_",
  MENSAGENS_RECEBIDAS: "mensagens_recebidas",
} as const;

export const MAX_TENTATIVAS = 3;
export const MAX_PAYLOAD_SIZE = 4096;

// =======================================================
// PERFIL LOCAL
// =======================================================
export interface ProfileConfig {
  name: string;
  email: string;
  vapidPublicKey: JsonWebKey;
  vapidPrivateKeyJwk: JsonWebKey;
  vapidPrivateKeyEnvelope: string;
  e2ePublicKey: JsonWebKey;
  e2ePrivateKeyJwk: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  createdAt: number;
  updatedAt: number;
}

// =======================================================
// MENSAGENS
// =======================================================
export interface MensagemEnviada {
  id: string;
  contatoHash: string;
  conteudo: string;
  status: 'pendente' | 'enviando' | 'enviada' | 'falha' | 'entregue';
  tentativas: number;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

export interface MensagemRecebida {
  id: string;
  contatoPublicKeyVapid: string;
  conteudo: string;
  status: 'nao_lida' | 'lida' | 'notificada';
  recebidoEm: number;
  lidaEm?: number;
  notificadaEm?: number;
}

// =======================================================
// CONTATOS (Agenda Criptográfica)
// =======================================================
export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved';

export interface Contato {
  id: string; // Hash SHA-256 da vapidPublicKey
  email: string;
  name: string;
  vapidPublicKey: JsonWebKey;
  e2ePublicKey: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKeyEnvelope: string;
  trusted: boolean;
  me: MeStatus;
  createdAt: number;
  updatedAt: number;
}

// =======================================================
// HANDSHAKE (Máquina de Estados de Sincronização)
// =======================================================
export interface HandshakeRotas { 
  profile?: any; 
  mensagem?: any; 
  contato?: any; 
  [key: string]: any; // Permite extensibilidade para o roadmap
}

export type StatusIn = 'recebido' | 'processando' | 'processado' | 'falha';
export type StatusOut = 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';

export interface FluxoIn {
  status: StatusIn;
  rotas: HandshakeRotas;
  tentativas: number; 
  erro?: string;
}

export interface FluxoOut {
  status: StatusOut;
  rotas: HandshakeRotas;
  tentativas: number; 
  erro?: string;
}

export interface Handshake { 
  id: string; 
  aud: string; // id do contato (hash da chave publica vapid do destinatário)
  in?: FluxoIn; 
  out?: FluxoOut; 
  createdAt: number; 
  updatedAt: number; 
}

// =======================================================
// PAYLOADS DE REDE E CRIPTOGRAFIA
// =======================================================
export interface EnvelopeCifrado {
  i: string;
  d: string;
  k: string;
}
```

---

## Arquivo: `src/signals/state.ts`

```ts
// src/signals/state.ts
import { signal } from '@preact/signals';

// Define qual visualização está ativa no layout mobile ('list' | 'chat' | 'profile')
export const currentMobileView = signal<'list' | 'chat' | 'profile'>('list');

export const contatoSelecionado = signal<string>('');
export const contatoCompartilharHash = signal<string | null>(null); // 🔥 Contato em exibição no cartão de compartilhamento
export const mensagemEnvio = signal<string>('');

export const profileInput = signal<string>('');
export const profileName = signal<string>('');
export const profileEmail = signal<string>('');
export const debugLogs = signal<string[]>([]);

export function addDebugLog(msg: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `[${timestamp}] ${msg}`;
  debugLogs.value = [...debugLogs.value, logEntry];
  console.log(msg);
}

export function clearDebugLogs(): void {
  debugLogs.value = [];
}

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  alert(`${type.toUpperCase()}: ${msg}`);
}
```

---

## Arquivo: `src/stores/index.ts`

```ts
// src/stores/index.ts
export * from './contatosStore.ts';
export * from './mensagensStore.ts';
export * from './profileStore.ts';
```

---

## Arquivo: `src/stores/mensagensStore.ts`

```ts
// src/stores/mensagensStore.ts
import { signal } from '@preact/signals';
import {
  listarMensagensRecebidas,
  listarMensagensEnviadas,
  salvarMensagemRecebida,
  salvarMensagemEnviada,
  atualizarStatusMensagemRecebida,
  atualizarStatusMensagemEnviada,
  removerMensagemRecebida,
  removerMensagemEnviada,
} from '../utils/db-helpers.ts';
import type { MensagemRecebida, MensagemEnviada } from '../constants/db.ts';

export const mensagensRecebidas = signal<MensagemRecebida[]>([]);
export const mensagensEnviadas = signal<MensagemEnviada[]>([]);

export async function carregarMensagensRecebidas() {
  const lista = await listarMensagensRecebidas();
  lista.sort((a, b) => b.recebidoEm - a.recebidoEm);
  mensagensRecebidas.value = lista;
}

export async function carregarMensagensEnviadas() {
  const lista = await listarMensagensEnviadas();
  lista.sort((a, b) => b.createdAt - a.createdAt);
  mensagensEnviadas.value = lista;
}

export async function adicionarMensagemRecebida(mensagem: MensagemRecebida) {
  await salvarMensagemRecebida(mensagem);
  await carregarMensagensRecebidas();
}

export async function adicionarMensagemEnviada(mensagem: MensagemEnviada) {
  await salvarMensagemEnviada(mensagem);
  await carregarMensagensEnviadas();
}

export async function marcarMensagemRecebidaComoLida(id: string) {
  await atualizarStatusMensagemRecebida(id, 'lida');
  await carregarMensagensRecebidas();
}

export async function removerMensagemRecebidaPorId(id: string) {
  await removerMensagemRecebida(id);
  await carregarMensagensRecebidas();
}

export async function removerMensagemEnviadaPorId(id: string) {
  await removerMensagemEnviada(id);
  await carregarMensagensEnviadas();
}

export async function initMensagensStore() {
  await carregarMensagensRecebidas();
  await carregarMensagensEnviadas();
}
```

---

## Arquivo: `src/stores/profileStore.ts`

```ts
// src/stores/profileStore.ts
import { signal } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { profileName, profileEmail } from '../signals/state.ts';

export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  const p = await buscarProfile();
  profile.value = p || null;
  
  // 🔥 Preenche a UI automaticamente com os dados salvos no banco de dados
  if (p) {
    profileName.value = p.name;
    profileEmail.value = p.email;
  }
}

export async function atualizarProfile(p: ProfileConfig) {
  await salvarProfile(p);
  profile.value = p;
  
  // 🔥 Atualiza a UI quando salvamos um novo perfil
  profileName.value = p.name;
  profileEmail.value = p.email;
}

export async function initProfileStore() {
  await carregarProfile();
}
```

---

## Arquivo: `src/stores/contatosStore.ts`

```ts
// src/stores/contatosStore.ts
import { signal } from '@preact/signals';
import { 
  listarContatos, 
  salvarContato, 
  removerContato, 
  buscarContatoPorChave,
  serializarPublicKeyVapid,
} from '../utils/db-helpers.ts';
import type { Contato } from '../constants/db.ts';

export const contatos = signal<Contato[]>([]);
export const contatosComHash = signal<Array<{ contato: Contato; hash: string }>>([]);

export async function carregarContatos() {
  const lista = await listarContatos();
  contatos.value = lista;
  const comHash = await Promise.all(lista.map(async (c) => {
    // Usamos vapidPublicKey no lugar de publicKeyVapid
    const hash = await serializarPublicKeyVapid(c.vapidPublicKey);
    return { contato: c, hash };
  }));
  contatosComHash.value = comHash;
}

export async function adicionarContato(contato: Contato) {
  await salvarContato(contato);
  await carregarContatos();
}

export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey) {
  await removerContato(vapidPublicKey);
  await carregarContatos();
}

export async function homologarContatoPorPublicKey(vapidPublicKey: JsonWebKey) {
  const hash = await serializarPublicKeyVapid(vapidPublicKey);
  const contato = await buscarContatoPorChave(hash);
  if (contato) {
    contato.trusted = true; // Substitui o antigo 'homologado'
    contato.updatedAt = Date.now();
    await salvarContato(contato);
    await carregarContatos();
  }
}

export async function buscarContatoPorHash(hash: string): Promise<Contato | undefined> {
  const item = contatosComHash.value.find(item => item.hash === hash);
  if (item) return item.contato;
  return await buscarContatoPorChave(hash);
}

export async function initContatosStore() {
  await carregarContatos();
}

// Ouve os avisos do novo Service Worker Router para recarregar a tela
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'CONTATO_ATUALIZADO') {
      carregarContatos();
    }
  });
}
```

---

## Arquivo: `src/sw/cache.ts`

```ts
// src/sw/cache.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

// O script de build vai injetar a lista dentro deste array substituindo o texto
const ASSETS_TO_CACHE = [__GENERATED_ASSETS__];

// EVENTO DE INSTALAÇÃO
self.addEventListener("install", (event) => {
  console.log("[SW-CACHE] 🛠️ Instalando novo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW-CACHE] 📦 Armazenando assets essenciais no cache local...");
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.error(`[SW-CACHE] ❌ Falha ao cachear recurso: ${url}`, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// EVENTO DE ATIVAÇÃO
self.addEventListener("activate", (event) => {
  console.log("[SW-CACHE] ✨ Ativando Service Worker e limpando caches antigos...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log(`[SW-CACHE] 🗑️ Removendo cache obsoleto: ${cache}`);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// EVENTO FETCH
self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes("/api/")) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        console.log(`[SW-CACHE] 🔌 Usuário Offline. Servindo do cache: ${event.request.url}`);
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return new Response("Você está offline e este recurso não foi mapeado no cache.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        });
      })
  );
});

```

---

## Arquivo: `src/sw/click.ts`

```ts
// src/sw/click.js

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('notificationclick', function(event) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  const urlParaAbrir = new URL('/', self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Tenta focar uma janela existente
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              // Se falhar, continua para abrir uma nova
              break;
            }
          }
        }
        // Se não encontrou ou não conseguiu focar, abre uma nova
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              // Se falhar, tenta abrir com target _blank? Não há suporte direto, mas podemos ignorar.
              // Retornamos uma promessa resolvida para não travar o SW.
              return Promise.resolve();
            });
        }
      })
  );
});
```

---

## Arquivo: `src/sw/push.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import type { PayloadHandshake } from "../constants/db.ts";

console.log("[SW-PUSH-ROUTER] 🔀 Router de push carregado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  console.log("[SW-PUSH-ROUTER] 📩 Push recebido, tamanho:", rawText.length);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: rawText })
    );
    return;
  }

  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        if (!valid) {
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada.`,
            icon: '/icon.png',
          });
          return;
        }

        // Tudo agora é Handshake!
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload as PayloadHandshake, header, rawText);
          return;
        }

        // Se uma mensagem do modelo MUITO ANTIGO ("msg") chegar, ignoramos ou logamos
        console.warn(`[SW-PUSH-ROUTER] ⚠️ JWT legado recebido e ignorado: ${payload.sub}`);
      } catch (err: any) {
        console.error("[SW-PUSH-ROUTER] ❌ Erro no router:", err);
        await self.registration.showNotification("⚠️ Erro ao processar push", {
          body: err.message || "Falha no processamento.",
          icon: '/icon.png',
        });
      }
    })()
  );
});

console.log("[SW-PUSH-ROUTER] ✅ Router configurado.");
```

---

## Arquivo: `src/sw/sw-handshakes.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, MAX_TENTATIVAS, Handshake } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  buscarHandshake,
  listarHandshakes,
  buscarContatoPorChave,
  buscarProfile,
  buscarChaveDecript,
  salvarProfile,
  serializarPublicKeyVapid,
  normalizarChaveContato
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { extrairDadosCompactos } from "../utils/share-utils.ts";

// Importa os roteadores especializados
import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-ROUTER] 🤝 Handshake recebido. Decifrando envelope...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript(); 
    if (!privateDecryptKey) throw new Error("Chave privada RSA não disponível para decifrar handshake.");

    const envelope = JSON.parse(payload.ct);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const textoDecifradoBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);
    
    const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
    const rotasObj = JSON.parse(new TextDecoder().decode(decompressed));

    const senderPublicKeyVapid = header.kid;
    const senderHash = senderPublicKeyVapid ? await serializarPublicKeyVapid(senderPublicKeyVapid) : '';

    let handshake = await buscarHandshake(payload.jti);
    let erroIn = undefined;

    if (!handshake) {
      handshake = { id: payload.jti, aud: senderHash, createdAt: Date.now(), updatedAt: Date.now() };
    } else if (handshake.in) {
      erroIn = "FluxoIn do Handshake Sobrescrito";
    }

    handshake.in = { status: 'recebido', tentativas: 0, rotas: rotasObj, erro: erroIn };
    handshake.updatedAt = Date.now();
    
    await salvarHandshake(handshake);
    console.log(`[SW-ROUTER] ✅ Handshake ${handshake.id} enfileirado para processamento In.`);
    await processarFilaHandshake();

  } catch (err) {
    console.error("[SW-ROUTER] ❌ Erro ao decifrar handshake recebido:", err);
    throw err;
  }
}

export async function processarFilaHandshake() {
  console.log("[SW-ROUTER] 🔄 Processando fila geral de handshakes...");

  try {
    const todos = await listarHandshakes();

    // PROCESSAR ENTRADA
    const pendentesIn = todos.filter(h => h.in && (h.in.status === 'recebido' || (h.in.status === 'processando' && (Date.now() - h.updatedAt) > 60000)) && h.in.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesIn) {
      h.in!.status = 'processando';
      h.in!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshake(h);

      try {
        if (h.in!.rotas.profile) await ProcessarProfile({ in: h.id });
        if (h.in!.rotas.contato) await ProcessarContato({ in: h.id });
        if (h.in!.rotas.mensagem) await ProcessarMensagem({ in: h.id });

        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'processado';
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      } catch (err: any) {
        console.error(`[SW-ROUTER] ❌ Falha na rota IN do handshake ${h.id}:`, err);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'falha';
          hFresh.in.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      }
    }

    // PROCESSAR SAIDA
    if (!navigator.onLine) {
      console.log("[SW-ROUTER] 🌐 Offline. Ignorando fila de saída (Out).");
      return;
    }

    const todosAposIn = await listarHandshakes();
    const pendentesOut = todosAposIn.filter(h => h.out && (h.out.status === 'pendente' || (h.out.status === 'enviando' && (Date.now() - h.updatedAt) > 60000)) && h.out.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesOut) {
      h.out!.status = 'enviando';
      h.out!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshake(h);

      try {
        const contatoIdHash = await normalizarChaveContato(h.aud);
        let contato = await buscarContatoPorChave(contatoIdHash);
        
        if (!contato) throw new Error(`Contato alvo (hash: ${contatoIdHash}) não encontrado.`);
        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil local não encontrado.");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        // 🔥 O PULO DO GATO (Piggybacking) REFINADO COM A NOVA FUNÇÃO
        const isSyncHandshake = !!(h.out!.rotas?.contato?.sync);
        const isPullHandshake = Array.isArray(h.out!.rotas?.contato?.campos);
        
        if (!isSyncHandshake && !isPullHandshake && (contato.me === 'none' || contato.me === 'wrong')) {
          console.log(`[SW-ROUTER] 💉 Contato desatualizado. Pegando carona no handshake ${h.id}!`);
          h.out!.rotas.contato = h.out!.rotas.contato || {};
          h.out!.rotas.contato.sync = extrairDadosCompactos(profile, true, contato.trusted === true);
        }

        const envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
        const payloadJwt = { sub: "hand", aud: contato.id, jti: h.id, ct: JSON.stringify(envelope) };
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
        
        if (jwt.length > 4096) throw new Error(`Payload excede limite (tamanho atual: ${jwt.length})`);

        await enviarParaProxy(
          contato.subscription, jwt,
          { subject: `mailto:${contato.email || profile.email}`, publicKey: contato.vapidPublicKey, privateKey: contato.vapidPrivateKeyEnvelope }
        );

        h.out!.status = 'enviado';
        h.updatedAt = Date.now();
        await salvarHandshake(h);
        console.log(`[SW-ROUTER] 📤 Sucesso! Handshake ${h.id} enviado para o contato ${contato.id}.`);

      } catch (err: any) {
        console.error(`[SW-ROUTER] ❌ Erro ao enviar handshake OUT ${h.id}:`, err);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.out) {
          hFresh.out.status = hFresh.out.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          hFresh.out.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshake(hFresh);
        }
      }
    }

  } catch (err) {
    console.error("[SW-ROUTER] ❌ Erro geral ao processar fila:", err);
  }
}

self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_HANDSHAKE') await processarFilaHandshake();
  if (data.type === 'CRIAR_HANDSHAKE_OUT' && data.payload) {
    const { rotasModulo, params } = data.payload;
    if (rotasModulo === 'profile') await ProcessarProfile({ out: params });
    if (rotasModulo === 'contato') await ProcessarContato({ out: params });
    if (rotasModulo === 'mensagem') await ProcessarMensagem({ out: params });
  }
});
self.addEventListener('sync', async function (event: any) {
  if (event.tag === 'sync-envio-handshakes') event.waitUntil(processarFilaHandshake());
});
self.addEventListener('online', async function () {
  await processarFilaHandshake();
});
```

---

## Arquivo: `src/utils/jwt-helpers.ts`

```ts
// src/utils/jwt-helpers.ts

// ============================================================
// UTILITÁRIOS BASE64URL
// ============================================================

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// FUNÇÃO GENÉRICA: CRIAR JWT
// ============================================================

/**
 * Cria um JWT assinado com ES256 (ECDSA P-256 + SHA-256).
 * @param payload - Objeto com os dados do payload (será convertido para JSON).
 * @param privateKeyJwk - Chave privada VAPID em formato JWK.
 * @param headerExtra - Campos extras para o header (ex: { kid: ... }).
 * @returns JWT completo (string) no formato header.payload.signature.
 */
export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  const header = { alg: "ES256", ...headerExtra };
  const encoder = new TextEncoder();

  const headerB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = arrayBufferToBase64Url(encoder.encode(JSON.stringify(payload)));
  const toSign = `${headerB64}.${payloadB64}`;

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    encoder.encode(toSign)
  );
  const sigB64 = arrayBufferToBase64Url(signature);

  return `${toSign}.${sigB64}`;
}

// ============================================================
// FUNÇÃO GENÉRICA: VERIFICAR JWT
// ============================================================

/**
 * Verifica um JWT assinado com ES256.
 * Se publicKeyJwk for fornecido, usa-o; senão, extrai a chave do campo 'kid' do header.
 * Retorna { header, payload, signature, valid }.
 */
export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));
  const header = JSON.parse(headerJson);
  const payload = JSON.parse(payloadJson);

  let publicKeyJwkFinal = publicKeyJwk;
  if (!publicKeyJwkFinal) {
    if (!header.kid) {
      throw new Error("Header JWT não contém 'kid' e nenhuma chave pública foi fornecida.");
    }
    publicKeyJwkFinal = header.kid;
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicKeyJwkFinal,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const toSign = `${headerB64}.${payloadB64}`;
  const signatureBytes = base64UrlToArrayBuffer(signatureB64);

  const encoder = new TextEncoder();
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureBytes,
    encoder.encode(toSign)
  );

  return { header, payload, signature: signatureB64, valid };
}

// ============================================================
// FUNÇÃO GENÉRICA: DECODIFICAR JWT (sem verificar assinatura)
// ============================================================

/**
 * Decodifica um JWT sem verificar a assinatura (apenas para leitura).
 * Retorna { header, payload, signature }.
 */
export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT inválido: deve ter 3 partes separadas por '.'");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const decoder = new TextDecoder();

  const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
  const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));

  return {
    header: JSON.parse(headerJson),
    payload: JSON.parse(payloadJson),
    signature: signatureB64
  };
}
```

---

## Arquivo: `src/utils/push-utils.ts`

```ts

import { gzipSync } from "fflate";

// ============================================================
// UTILITÁRIOS DE CRIPTOGRAFIA
// ============================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Cifra um payloadObj (objeto JavaScript) usando AES-GCM e RSA-OAEP.
 * Retorna envelope: { i: ivBase64, d: dadosCifradosBase64, k: chaveAesCifradaBase64 }
 */
export async function cifrarPayloadObj(payloadObj: any, publicKeyRSA: JsonWebKey): Promise<{
  i: string;
  d: string;
  k: string;
}> {
  const encoder = new TextEncoder();
  const jsonString = JSON.stringify(payloadObj);
  const bytes = encoder.encode(jsonString);
  const compressed = gzipSync(bytes);
  console.log(`[PUSH-UTILS] 📦 Comprimido: ${compressed.length} bytes (original: ${bytes.length})`);

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    compressed
  );

  const cryptoKeyDestino = await crypto.subtle.importKey(
    "jwk",
    publicKeyRSA,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyEncrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    cryptoKeyDestino,
    aesKeyRaw
  );

  return {
    i: arrayBufferToBase64(iv.buffer),
    d: arrayBufferToBase64(encryptedBuffer),
    k: arrayBufferToBase64(aesKeyEncrypted)
  };
}

/**
 * Envia um payload JWT para o servidor proxy.
 * subscription: objeto com endpoint e keys.
 * payloadText: string JWT.
 * vapid: { subject, publicKey, privateKey } (privateKey pode ser envelope cifrado).
 * Retorna true se sucesso, lança erro em caso de falha.
 */
export async function enviarParaProxy(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadText: string,
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: string }
): Promise<void> {
  const response = await fetch("/api/proxy-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payloadText,
      vapid: {
        subject: vapid.subject,
        publicKey: vapid.publicKey,
        privateKey: vapid.privateKey // envelope ou JWK
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
}

/**
 * Cifra a chave privada VAPID (JWK) com a chave pública do servidor.
 * Retorna envelope base64.
 */
export async function cifrarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  const serverKey = await crypto.subtle.importKey(
    "jwk",
    serverPublicKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["encrypt"]
  );
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const vapidBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const vapidCifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    vapidBytes
  );
  const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey);
  const aesKeyCifrado = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    serverKey,
    aesKeyRaw
  );
  const toHex = (buf: ArrayBuffer) =>
    Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const envelope = {
    iv: toHex(iv.buffer),
    dadosCifrados: toHex(vapidCifrado),
    chaveAesCifrada: toHex(aesKeyCifrado)
  };
  return btoa(JSON.stringify(envelope));
}
```

---

## Arquivo: `src/utils/sw-utils.ts`

```ts
// src/utils/sw-utils.ts
import { addDebugLog } from '../signals/state.ts';

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  const cacheBuster = Date.now();
  addDebugLog("⏳ Registrando/Atualizando Service Worker...");

  try {
    const registration = await navigator.serviceWorker.register(
      `./service-worker.js?cacheBuster=${cacheBuster}`,
      { scope: "/" }
    );
    if (!registration) {
      throw new Error("Service Worker registration retornou null/undefined");
    }
    addDebugLog("✅ Service Worker registrado, aguardando ready...");
    const readyReg = await navigator.serviceWorker.ready;
    addDebugLog("✅ Service Worker ativo e pronto.");
    return readyReg;
  } catch (err: any) {
    addDebugLog("❌ Erro ao registrar Service Worker: " + (err?.message || String(err)));
    throw new Error(`Falha ao registrar Service Worker: ${err?.message || String(err)}`);
  }
}
```

---

## Arquivo: `src/utils/crypto-utils.ts`

```ts
// src/utils/crypto-utils.ts
export async function generateE2EEKeys() {
  const encryptionKeyPair = await window.crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );
  const publicEncryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.publicKey);
  const privateDecryptJwk = await window.crypto.subtle.exportKey("jwk", encryptionKeyPair.privateKey);
  return {
    privateDecrypt: encryptionKeyPair.privateKey,
    publicEncrypt: publicEncryptJwk,
    privateDecryptJwk: privateDecryptJwk
  };
}

export async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

export function rawBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

---

## Arquivo: `src/utils/profile-utils.ts`

```ts
// src/utils/profile-utils.ts
import { salvarProfile, buscarProfile, salvarIdentidadeA, removerSubscriptionB } from './db-helpers.ts';
import { cifrarChaveVapid } from './push-utils.ts';
import { registrarServiceWorker } from './sw-utils.ts';
import { generateE2EEKeys, generateVAPIDKeys, rawBufferToBase64Url } from './crypto-utils.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { addDebugLog } from '../signals/state.ts';

/**
 * Tenta solicitar a persistência de armazenamento ao navegador para evitar evicção automática.
 * 
 * @returns {Promise<boolean>} True se concedido o armazenamento persistente.
 */
export async function solicitarArmazenamentoPersistente(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      const concedido = await navigator.storage.persist();
      if (concedido) {
        addDebugLog("✅ Armazenamento Persistente concedido pelo navegador.");
      } else {
        addDebugLog("ℹ️ Navegador manteve o Armazenamento Padrão.");
      }
      return concedido;
    } catch (err: any) {
      addDebugLog("⚠️ Erro ao solicitar armazenamento persistente: " + err.message);
      return false;
    }
  }
  return false;
}

/**
 * Orquestra a criação ou atualização completa do perfil do usuário.
 * 
 * @param {string} nome - Nome do usuário.
 * @param {string} email - E-mail/identificador do usuário.
 * @returns {Promise<ProfileConfig>} Perfil criado e salvo no IndexedDB.
 */
export async function gerarProfileCompleto(nome: string, email: string): Promise<ProfileConfig> {
  addDebugLog("📦 Gerando/Atualizando perfil unificado...");

  if (!nome || !email) {
    throw new Error("Preencha Nome e E-mail primeiro.");
  }

  try {
    addDebugLog("Step 1: Verificando permissão de notificação...");
    try {
      if (Notification.permission === "denied") {
        addDebugLog("⚠️ Permissão de notificação foi negada pelo usuário. Continuando sem notificações...");
      } else if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          addDebugLog("⚠️ Permissão de notificação não concedida. Continuando sem notificações...");
        }
      }
    } catch (notifErr: any) {
      addDebugLog("⚠️ Erro ao verificar notificações: " + notifErr?.message);
    }

    addDebugLog("Step 2: Registrando Service Worker...");
    const registration = await registrarServiceWorker();

    addDebugLog("Step 3: Buscando chave pública do servidor...");
    const resServerKey = await fetch("/api/server-public-key");
    if (!resServerKey.ok) {
      throw new Error(`Erro ao buscar chave do servidor: ${resServerKey.status}`);
    }
    const serverPublicKeyJwk = await resServerKey.json();
    addDebugLog("Step 3.5: Chave do servidor recebida");

    let vapidKeyPair: CryptoKeyPair;
    let publicKeyJwk: JsonWebKey;
    let privateKeyJwk: JsonWebKey;

    let existingProfile = await buscarProfile();
    if (existingProfile && existingProfile.vapidPublicKey && existingProfile.vapidPrivateKeyJwk) {
      addDebugLog("📂 Chaves VAPID encontradas no perfil.");
      publicKeyJwk = existingProfile.vapidPublicKey;
      privateKeyJwk = existingProfile.vapidPrivateKeyJwk;
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey(
            "jwk", publicKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"]
          ),
          privateKey: await window.crypto.subtle.importKey(
            "jwk", privateKeyJwk,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign"]
          )
        } as CryptoKeyPair;
      } catch {
        addDebugLog("⚠️ Erro ao importar chaves VAPID existentes. Gerando novas...");
        existingProfile = undefined;
      }
    }
    if (!existingProfile || !vapidKeyPair!) {
      addDebugLog("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    }

    addDebugLog("Step 4: Obtendo subscription...");
    if (!registration) {
      throw new Error("Service Worker registration é null/undefined");
    }
    if (!registration.pushManager) {
      throw new Error("Web Push API (pushManager) não disponível.");
    }
    
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const profileSub = existingProfile?.subscription;
      if (profileSub && profileSub.endpoint === existingSubscription.endpoint) {
        subscriptionValida = true;
      } else {
        await existingSubscription.unsubscribe();
        await removerSubscriptionB();
        existingSubscription = null;
      }
    }
    if (!existingSubscription || !subscriptionValida) {
      addDebugLog("📝 Criando nova subscription...");
      const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair!.publicKey);
      existingSubscription = await registration.pushManager.subscribe({
        applicationServerKey: new Uint8Array(rawPublicKey),
        userVisibleOnly: true
      });
    }

    const p256dhBuffer = existingSubscription.getKey('p256dh');
    const authBuffer = existingSubscription.getKey('auth');
    if (!p256dhBuffer || !authBuffer) {
      throw new Error("Falha ao obter chaves da subscription (p256dh/auth).");
    }
    const subscription = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      }
    };

    let e2ePublicKey: JsonWebKey;
    let e2ePrivateKeyJwk: JsonWebKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      addDebugLog("📂 Chaves E2E encontradas no perfil.");
      e2ePublicKey = existingProfile.e2ePublicKey;
      e2ePrivateKeyJwk = existingProfile.e2ePrivateKeyJwk;
      try {
        await window.crypto.subtle.importKey(
          "jwk",
          e2ePrivateKeyJwk,
          { name: "RSA-OAEP", hash: "SHA-256" },
          true,
          ["decrypt"]
        );
      } catch {
        addDebugLog("⚠️ Erro ao importar chave E2E existente. Gerando novas...");
        const newKeys = await generateE2EEKeys();
        e2ePublicKey = newKeys.publicEncrypt;
        e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
      }
    } else {
      addDebugLog("🔑 Gerando novas chaves E2E...");
      const newKeys = await generateE2EEKeys();
      e2ePublicKey = newKeys.publicEncrypt;
      e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
    }

    const privateKeyEncrypted = await cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const profile: ProfileConfig = {
      name: nome,
      email: email,
      vapidPublicKey: publicKeyJwk,
      vapidPrivateKeyJwk: privateKeyJwk,
      vapidPrivateKeyEnvelope: privateKeyEncrypted,
      e2ePublicKey: e2ePublicKey,
      e2ePrivateKeyJwk: e2ePrivateKeyJwk,
      subscription: subscription,
      createdAt: existingProfile?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    await salvarProfile(profile);

    const identidadeTemporaria = {
      name: nome,
      email: email,
      privateKey: vapidKeyPair!.privateKey
    };
    await salvarIdentidadeA(identidadeTemporaria);

    // Solicita a proteção de armazenamento persistente
    await solicitarArmazenamentoPersistente();

    addDebugLog("✅ Perfil salvo com sucesso.");
    return profile;
  } catch (err) {
    addDebugLog("❌ Erro ao gerar perfil: " + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
}
```

---

## Arquivo: `src/utils/id-utils.ts`

```ts
// src/utils/id-utils.ts

/**
 * Gera um identificador único curto seguro.
 * Utiliza Web Crypto API se disponível, senão cai no fallback matemático.
 * @returns {string} ID gerado
 */
export function gerarId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 12);
  }
  return gerarIdFallback();
}

/**
 * Fallback para geração de ID caso crypto.getRandomValues não esteja disponível.
 * Combina o timestamp em base36 com um random.
 * @returns {string} ID temporário
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

/**
 * Valida se a string tem formato aceitável de ID.
 * @param {string} id
 * @returns {boolean}
 */
export function validarId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 24;
}
```

---

## Arquivo: `src/utils/db-helpers.ts`

```ts
// src/utils/db-helpers.ts
import { get, set, createStore, del, entries } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../constants/db.ts";
import type {
  ProfileConfig,
  MensagemEnviada,
  MensagemRecebida,
  Contato,
  Handshake,
} from "../constants/db.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string) {
  return createStore(nome, STORE_NAMES.KEYVAL);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeMensagensEnviadasA = criarStore(DB_NAMES.MENSAGENS_ENVIADAS);
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeMensagensRecebidasB = criarStore(DB_NAMES.MENSAGENS_RECEBIDAS_B);
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES);

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: IDBStore, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: IDBStore, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: IDBStore, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: IDBStore): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

// ============================================================
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================

export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, profile);
}

export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  return buscarChave<ProfileConfig>(storeConfig, KEY_NAMES.PROFILE);
}

export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}

// ============================================================
// 🔥 Função para buscar e importar a chave privada RSA (decodificação)
// ============================================================
export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile) {
      console.warn("[DB-HELPERS] ⚠️ Perfil não encontrado.");
      return null;
    }
    if (!profile.e2ePrivateKeyJwk) {
      console.warn("[DB-HELPERS] ⚠️ Chave privada RSA não encontrada no perfil.");
      return null;
    }

    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    console.log("[DB-HELPERS] 🔑 Chave de decodificação RSA encontrada e importada.");
    return privateDecrypt;
  } catch (err) {
    console.error("[DB-HELPERS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// ============================================================
// Funções de Conveniência (operam sobre o ProfileConfig)
// ============================================================

export async function buscarIdentidadeA(): Promise<{ name: string; email: string; privateKey: CryptoKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  try {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      profile.vapidPrivateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    return {
      name: profile.name,
      email: profile.email,
      privateKey,
    };
  } catch {
    return undefined;
  }
}

export async function salvarIdentidadeA(identidade: { name: string; email: string; privateKey: CryptoKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.name = identidade.name;
  profile.email = identidade.email;
  profile.vapidPrivateKeyJwk = await crypto.subtle.exportKey("jwk", identidade.privateKey);
  await salvarProfile(profile);
}

export async function buscarChavesE2EB(): Promise<{ privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile || !profile.e2ePublicKey || !profile.e2ePrivateKeyJwk) return undefined;
  try {
    const privateDecrypt = await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
    return {
      privateDecrypt,
      publicEncrypt: profile.e2ePublicKey,
    };
  } catch {
    return undefined;
  }
}

export async function salvarChavesE2EB(chaves: { privateDecrypt: CryptoKey; publicEncrypt: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.e2ePublicKey = chaves.publicEncrypt;
  profile.e2ePrivateKeyJwk = await crypto.subtle.exportKey("jwk", chaves.privateDecrypt);
  await salvarProfile(profile);
}

export async function buscarChavesVapidB(): Promise<{ publicKey: JsonWebKey; privateKey: JsonWebKey } | undefined> {
  const profile = await buscarProfile();
  if (!profile) return undefined;
  return {
    publicKey: profile.vapidPublicKey,
    privateKey: profile.vapidPrivateKeyJwk,
  };
}

export async function salvarChavesVapidB(chaves: { publicKey: JsonWebKey; privateKey: JsonWebKey }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.vapidPublicKey = chaves.publicKey;
  profile.vapidPrivateKeyJwk = chaves.privateKey;
  await salvarProfile(profile);
}

export async function buscarSubscriptionB(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | undefined> {
  const profile = await buscarProfile();
  return profile?.subscription;
}

export async function salvarSubscriptionB(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  const profile = await buscarProfile() || {} as ProfileConfig;
  profile.subscription = subscription;
  await salvarProfile(profile);
}

export async function removerSubscriptionB(): Promise<void> {
  const profile = await buscarProfile();
  if (profile) {
    delete profile.subscription;
    await salvarProfile(profile);
  }
}

// ============================================================
// Mensagens Enviadas
// ============================================================

export async function salvarMensagemEnviada(mensagem: MensagemEnviada): Promise<void> {
  await salvarChave(storeMensagensEnviadasA, mensagem.id, mensagem);
}

export async function buscarMensagemEnviada(id: string): Promise<MensagemEnviada | undefined> {
  return buscarChave<MensagemEnviada>(storeMensagensEnviadasA, id);
}

export async function listarMensagensEnviadas(): Promise<MensagemEnviada[]> {
  const entries = await listarChaves<MensagemEnviada>(storeMensagensEnviadasA);
  return entries.map(([_, msg]) => msg);
}

export async function listarMensagensEnviadasPorStatus(status: MensagemEnviada['status']): Promise<MensagemEnviada[]> {
  const todas = await listarMensagensEnviadas();
  return todas.filter(m => m.status === status);
}

export async function atualizarStatusMensagemEnviada(id: string, status: MensagemEnviada['status'], erro?: string): Promise<void> {
  const mensagem = await buscarMensagemEnviada(id);
  if (mensagem) {
    mensagem.status = status;
    mensagem.updatedAt = Date.now();
    if (erro) mensagem.erro = erro;
    await salvarMensagemEnviada(mensagem);
  }
}

export async function removerMensagemEnviada(id: string): Promise<void> {
  await removerChave(storeMensagensEnviadasA, id);
}

// ============================================================
// Mensagens Recebidas
// ============================================================

export async function salvarMensagemRecebida(mensagem: MensagemRecebida): Promise<void> {
  await salvarChave(storeMensagensRecebidasB, mensagem.id, mensagem);
}

export async function buscarMensagemRecebida(id: string): Promise<MensagemRecebida | undefined> {
  return buscarChave<MensagemRecebida>(storeMensagensRecebidasB, id);
}

export async function listarMensagensRecebidas(): Promise<MensagemRecebida[]> {
  const entries = await listarChaves<MensagemRecebida>(storeMensagensRecebidasB);
  return entries.map(([_, msg]) => msg);
}

export async function atualizarStatusMensagemRecebida(id: string, status: MensagemRecebida['status']): Promise<void> {
  const mensagem = await buscarMensagemRecebida(id);
  if (mensagem) {
    mensagem.status = status;
    if (status === 'lida') mensagem.lidaEm = Date.now();
    if (status === 'notificada') mensagem.notificadaEm = Date.now();
    await salvarMensagemRecebida(mensagem);
  }
}

export async function removerMensagemRecebida(id: string): Promise<void> {
  await removerChave(storeMensagensRecebidasB, id);
}

// ============================================================
// Contatos (Com Migração Automática Legada)
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && 'kty' in input) {
    return await serializarPublicKeyVapid(input);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}

/**
 * MIGRATOR: Converte contatos salvos no IndexedDB antigo para o formato novo.
 */
async function migrarContatoLegado(c: any): Promise<Contato> {
  let modificado = false;

  if (c.publicKeyVapid) { c.vapidPublicKey = c.publicKeyVapid; delete c.publicKeyVapid; modificado = true; }
  if (c.nome !== undefined) { c.name = c.nome; delete c.nome; modificado = true; }
  if (c.publicKeyRSA) { c.e2ePublicKey = c.publicKeyRSA; delete c.publicKeyRSA; modificado = true; }
  if (c.vapidPrivateKey) { c.vapidPrivateKeyEnvelope = c.vapidPrivateKey; delete c.vapidPrivateKey; modificado = true; }
  if (c.homologado !== undefined) { c.trusted = c.homologado; delete c.homologado; modificado = true; }
  
  if (!c.me) { c.me = c.trusted ? 'saved' : 'none'; modificado = true; }
  
  if (!c.id && c.vapidPublicKey) {
    c.id = await serializarPublicKeyVapid(c.vapidPublicKey);
    modificado = true;
  }

  // Se o objeto era antigo, a gente salva ele atualizado silenciosamente
  if (modificado && c.id) {
    await salvarChave(storeContatos, c.id, c);
  }

  return c as Contato;
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.vapidPublicKey);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  const c = await buscarChave<any>(storeContatos, key);
  return c ? await migrarContatoLegado(c) : undefined;
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  const c = await buscarChave<any>(storeContatos, key);
  return c ? await migrarContatoLegado(c) : undefined;
}

export async function listarContatos(): Promise<Contato[]> {
  const entries = await listarChaves<any>(storeContatos);
  const contatos: Contato[] = [];
  for (const [_, c] of entries) {
    contatos.push(await migrarContatoLegado(c));
  }
  return contatos;
}

export async function homologarContato(vapidPublicKey: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  const contato = await buscarChave<any>(storeContatos, key);
  if (contato) {
    const cFormatado = await migrarContatoLegado(contato);
    cFormatado.trusted = true;
    cFormatado.updatedAt = Date.now();
    await salvarChave(storeContatos, key, cFormatado);
  }
}

export async function removerContato(vapidPublicKey: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  await removerChave(storeContatos, key);
}

// ============================================================
// Handshakes
// ============================================================

export async function salvarHandshake(handshake: Handshake): Promise<void> {
  handshake.updatedAt = Date.now();
  if (!handshake.createdAt) {
    handshake.createdAt = Date.now();
  }
  await salvarChave(storeHandshakes, handshake.id, handshake);
}

export async function buscarHandshake(id: string): Promise<Handshake | undefined> {
  return buscarChave<Handshake>(storeHandshakes, id);
}

export async function listarHandshakes(): Promise<Handshake[]> {
  const entries = await listarChaves<Handshake>(storeHandshakes);
  return entries.map(([_, h]) => h);
}

export async function atualizarStatusHandshake(id: string, statusInOrOut: string, flow: 'in' | 'out', erro?: string): Promise<void> {
  const handshake = await buscarHandshake(id);
  if (handshake && handshake[flow]) {
    handshake[flow]!.status = statusInOrOut as any;
    handshake.updatedAt = Date.now();
    if (erro) handshake[flow]!.erro = erro;
    await salvarHandshake(handshake);
  }
}

export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}
```

---

## Arquivo: `src/utils/share-utils.ts`

```ts
// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import type { ProfileConfig, Contato } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

// A interface unificada de compressão (usada no QR Code, Link e Handshake)
export interface CompactContact {
  req?: boolean; // Pede resposta?
  tr?: boolean;  // Confia?
  em: string;    // email
  nm: string;    // name
  vx: string;    // vapid X
  vy: string;    // vapid Y
  en: string;    // e2e N (RSA modulus)
  se: string;    // sub endpoint
  sp: string;    // sub p256dh
  sa: string;    // sub auth
  ve: string;    // vapid envelope
}

/**
 * Pega um Profile ou Contato e espreme no menor formato possível.
 */
export function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): CompactContact {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");

  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
    vx: target.vapidPublicKey.x!,
    vy: target.vapidPublicKey.y!,
    en: target.e2ePublicKey.n!,
    se: ep,
    sp: target.subscription.keys.p256dh,
    sa: target.subscription.keys.auth,
    ve: target.vapidPrivateKeyEnvelope
  };
}

/**
 * Pega o pacote espremido da rede/qr code e reconstrói as chaves JWK completas.
 */
export function expandirDadosCompactos(c: CompactContact): Partial<Contato> {
  let ep = c.se;
  if (ep.startsWith("1:")) ep = FCM_PREFIX + ep.substring(2);

  return {
    email: c.em,
    name: c.nm,
    vapidPublicKey: { kty: "EC", crv: "P-256", x: c.vx, y: c.vy, ext: true },
    e2ePublicKey: { kty: "RSA", e: "AQAB", n: c.en, alg: "RSA-OAEP-256", ext: true },
    subscription: { endpoint: ep, keys: { p256dh: c.sp, auth: c.sa } },
    vapidPrivateKeyEnvelope: c.ve,
    trusted: c.tr,
    me: 'saved' // Status base de recepção
  };
}

export function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): string {
  const compact = extrairDadosCompactos(target);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const compressed = gzipSync(jsonBytes);
  return arrayBufferToBase64Url(compressed.buffer);
}

export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey
): Promise<string> {
  const compact = extrairDadosCompactos(target);
  const payload = {
    sub: "contact",
    ...compact,
    iat: Math.floor(Date.now() / 1000)
  };

  const jwt = await criarJWT(payload, myVapidPrivateKeyJwk, { kid: myVapidPublicKeyJwk });
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = arrayBufferToBase64Url(compressed.buffer);

  return `${window.location.origin}/share.html?cjwt=${cjwt}`;
}

export async function processarQualquerConvite(input: string): Promise<Partial<Contato>> {
  let cqr = null, cjwt = null, jwt = null;

  try {
    const url = new URL(input);
    cqr = url.searchParams.get('cqr');
    cjwt = url.searchParams.get('cjwt');
    jwt = url.searchParams.get('jwt');
  } catch {
    if (!input.includes('.')) cqr = input;
    else jwt = input;
  }

  let compactData: CompactContact | null = null;

  // Tenta ler binário do QR Code (cqr ou string pura sem pontos)
  if (cqr) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cqr));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const parsed = JSON.parse(jsonText);
      
      // Compatibilidade retroativa com o Array de 11 posições antigo
      if (Array.isArray(parsed)) {
        let [email, name, vapidX, vapidY, rsaN, endpoint, p256dh, auth, b64Iv, b64Dados, b64Chave] = parsed;
        const b64ToHex = (b64: string) => Array.from(new Uint8Array(base64UrlToArrayBuffer(b64))).map(b => b.toString(16).padStart(2, '0')).join('');
        const envelope = { iv: b64ToHex(b64Iv), dadosCifrados: b64ToHex(b64Dados), chaveAesCifrada: b64ToHex(b64Chave) };
        compactData = { em: email, nm: name, vx: vapidX, vy: vapidY, en: rsaN, se: endpoint, sp: p256dh, sa: auth, ve: btoa(JSON.stringify(envelope)) };
      } else if (parsed.vx && parsed.vy) {
        compactData = parsed as CompactContact;
      }
    } catch (e) { /* fallback silêncioso */ }
  }

  const targetCjwt = cjwt || cqr;
  if (!compactData && targetCjwt) {
    const compressed = new Uint8Array(base64UrlToArrayBuffer(targetCjwt));
    const decompressed = gunzipSync(compressed);
    const jsonText = new TextDecoder().decode(decompressed);
    const { payload, valid } = await verificarJWT(jsonText);
    if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
    compactData = payload as CompactContact;
  }

  if (!compactData && jwt) {
    const { payload, valid } = await verificarJWT(jwt);
    if (!valid) throw new Error("Assinatura do convite inválida.");
    compactData = payload as CompactContact;
  }

  if (!compactData) throw new Error("Formato de convite ou QR Code inválido.");

  return expandirDadosCompactos(compactData);
}
```

---

## Arquivo: `src/styles.d.ts`

```ts
// src/styles.d.ts
declare module "*.css" {
  const content: string;
  export default content;
}
```

---

## Arquivo: `src/types/material-web.d.ts`

```ts
import { JSX as _JSX } from "preact";

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      // Buttons
      "md-filled-button": unknown;
      "md-outlined-button": unknown;
      "md-text-button": unknown;
      "md-filled-tonal-button": unknown;
      "md-icon-button": unknown;
      "md-fab": unknown;
      "md-extended-fab": unknown;

      // Cards
      "md-elevated-card": unknown;
      "md-filled-card": unknown;
      "md-outlined-card": unknown;

      // Text Fields
      "md-filled-text-field": unknown;
      "md-outlined-text-field": unknown;

      // Selection Controls
      "md-checkbox": unknown;
      "md-radio": unknown;
      "md-switch": unknown;

      // Lists
      "md-list": unknown;
      "md-list-item": unknown;
      "md-divider": unknown;

      // Menus
      "md-menu": unknown;
      "md-menu-item": unknown;

      // Dialogs
      "md-dialog": unknown;

      // Chips
      "md-assist-chip": unknown;
      "md-filter-chip": unknown;
      "md-input-chip": unknown;
      "md-suggestion-chip": unknown;

      // Progress
      "md-circular-progress": unknown;
      "md-linear-progress": unknown;

      // Icons
      "md-icon": unknown;

      // Tabs
      "md-tabs": unknown;
      "md-primary-tab": unknown;
      "md-secondary-tab": unknown;

      // Select
      "md-filled-select": unknown;
      "md-outlined-select": unknown;
      "md-select-option": unknown;
    }
  }
}

```

---

## Arquivo: `src/logout.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Sair - Loco</title>
  <link rel="icon" href="./favicon.ico" sizes="any" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
  <style>
    body { margin: 0; background-color: #fbfcf9; color: #191c1a; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="app-logout"></div>
  <script src="./logout.tsx" type="module"></script>
</body>
</html>
```

---

## Arquivo: `src/logout.tsx`

```tsx
// src/logout.tsx
import { render } from 'preact';
import { useSignal } from '@preact/signals';

import "@material/web/all.js";
import './styles.css';

function LogoutApp() {
  const status = useSignal('Aguardando confirmação...');
  const executando = useSignal(false);

  const handleLogout = async () => {
    executando.value = true;
    try {
      status.value = "1/5 Limpando Web Storage...";
      window.localStorage.clear();
      window.sessionStorage.clear();

      status.value = "2/5 Apagando Cookies...";
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const parts = cookies[i].split("=");
        const name = parts[0].trim();
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
      }

      status.value = "3/5 Apagando bancos IndexedDB...";
      if (window.indexedDB?.databases) {
        const dbs = await window.indexedDB.databases();
        for (const db of dbs) if (db.name) window.indexedDB.deleteDatabase(db.name);
      }

      status.value = "4/5 Cancelando Push e Service Workers...";
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          if (registration.pushManager) {
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) await subscription.unsubscribe();
          }
          await registration.unregister();
        }
      }

      status.value = "5/5 Limpando disco virtual (OPFS) e Cache...";
      if (window.caches) {
        const cacheNames = await window.caches.keys();
        for (const name of cacheNames) await window.caches.delete(name);
      }
      if (navigator.storage?.getDirectory) {
        const root = await navigator.storage.getDirectory();
        for await (const name of root.keys()) await root.removeEntry(name, { recursive: true });
      }

      status.value = "Concluindo no servidor...";
      const resposta = await fetch('./api/logout', { method: 'POST' });

      if (resposta.ok) {
        status.value = "✅ Logout e Destruição de Chaves Concluídos!";
        setTimeout(() => {
          window.location.href = '/'; 
        }, 1500);
      } else {
        throw new Error("Falha no servidor ao deslogar.");
      }
    } catch (erro: any) {
      status.value = `❌ Erro: ${erro.message}`;
      executando.value = false;
    }
  };

  return (
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 24px;">
      <div class="container" style="border-left-color: var(--md-sys-color-error); text-align: center; max-width: 400px; width: 100%;">
        <md-icon style="font-size: 48px; color: var(--md-sys-color-error); margin-bottom: 16px;">logout</md-icon>
        <h2 style="justify-content: center;">Sair do Sistema</h2>
        
        <p style="color: #666; margin-bottom: 16px; font-size: 0.95rem;">
          Tem certeza que deseja sair? Como não usamos senhas, <strong>todas as suas chaves criptográficas, contatos e histórico de mensagens</strong> serão apagados irreversivelmente deste dispositivo por segurança.
        </p>

        {executando.value ? (
          <div style="background: var(--md-sys-color-surface-variant); padding: 12px; border-radius: 8px; margin-bottom: 24px; font-size: 0.85rem; font-family: monospace;">
            <md-circular-progress indeterminate style="width: 24px; height: 24px; margin-bottom: 8px;"></md-circular-progress>
            <br />
            {status.value}
          </div>
        ) : (
          <div style="display: flex; gap: 8px; flex-direction: column; margin-top: 24px;">
            <md-filled-button onClick={handleLogout} style="width: 100%; --md-sys-color-primary: #ba1a1a; --md-sys-color-on-primary: white;">
              ⚠️ Sim, Apagar Meus Dados e Sair
            </md-filled-button>
            <md-outlined-button onClick={() => window.location.href = '/'} style="width: 100%;">
              Cancelar e Voltar
            </md-outlined-button>
          </div>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('app-logout');
if (root) {
  render(<LogoutApp />, root);
}
```

---

## Arquivo: `src/profile.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Perfil - Loco</title>
  <link rel="icon" href="./favicon.ico" sizes="any" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100vh;
      overflow-y: auto !important; /* 🔥 Libera a rolagem vertical */
      background-color: #f0f2f5;
      color: #191c1a;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="app-profile"></div>
  <script src="./profile.tsx" type="module"></script>
</body>
</html>
```

---

## Arquivo: `src/share.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Adicionar Contato - Loco</title>
  <link rel="icon" href="./favicon.ico" sizes="any" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100vh;
      overflow-y: auto !important;
      background-color: #fbfcf9;
      color: #191c1a;
      font-family: system-ui, -apple-system, sans-serif;
    }
  </style>
</head>
<body>
  <div id="app-share"></div>
  <script src="./share.tsx" type="module"></script>
</body>
</html>
```

---

## Arquivo: `src/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>loco</title>
  
  <link rel="manifest" href="./manifest.json">
  <link rel="icon" href="./favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="./favicon-16x16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png" />
  <meta name="application-name" content="loco" />
  
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
</head>
<body>
  <div id="app"></div>
  <script src="./app.tsx" type="module"></script>
</body>
</html>
```

---

## Arquivo: `src/styles.css`

```css
/* src/styles.css */

/* ==========================================================================
   1. VARIÁVEIS DE TEMA (Material Design 3)
   ========================================================================== */
:root {
  --md-sys-color-primary: #006c4f;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #8cf0cf;
  --md-sys-color-on-primary-container: #002114;
  --md-sys-color-secondary: #4a6357;
  --md-sys-color-on-secondary: #ffffff;
  --md-sys-color-secondary-container: #cce8d8;
  --md-sys-color-on-secondary-container: #082015;
  --md-sys-color-tertiary: #3b6375;
  --md-sys-color-on-tertiary: #ffffff;
  --md-sys-color-tertiary-container: #bde8fc;
  --md-sys-color-on-tertiary-container: #001f2a;
  --md-sys-color-error: #ba1a1a;
  --md-sys-color-on-error: #ffffff;
  --md-sys-color-error-container: #ffdad6;
  --md-sys-color-on-error-container: #410002;
  --md-sys-color-background: #fbfcf9;
  --md-sys-color-on-background: #191c1a;
  --md-sys-color-surface: #fbfcf9;
  --md-sys-color-on-surface: #191c1a;
  --md-sys-color-surface-variant: #dbe4dd;
  --md-sys-color-on-surface-variant: #404842;
  --md-sys-color-outline: #707873;
  --md-sys-color-shadow: #000000;
  --md-sys-color-inverse-surface: #2e312e;
  --md-sys-color-inverse-on-surface: #eff1ed;
  --md-sys-color-inverse-primary: #6dd3b4;
  --md-sys-color-surface-tint: #006c4f;
}

/* ==========================================================================
   2. RESET E TIPOGRAFIA BASE (Rolagem e Viewport Ajustados)
   ========================================================================== */
* {
  box-sizing: border-box;
}

html, body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100vw;
  background-color: var(--md-sys-color-background);
  color: var(--md-sys-color-on-background);
  line-height: 1.6;
}

/* Habilita rolagem vertical natural quando a página ultrapassa a viewport */
@media (max-width: 768px) {
  body {
    overflow-y: auto;
  }
}

h1, h2, h3, h4, h5, h6 {
  margin-top: 0;
  font-weight: 500;
  letter-spacing: -0.01em;
}

h1 {
  font-size: 2.25rem;
  margin-bottom: 0.25rem;
  color: var(--md-sys-color-primary);
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

p {
  margin-top: 0;
}

/* 🔥 CORREÇÃO DE CORTE DE ÍCONES (MATERIAL SYMBOLS & WEB COMPONENTS) 🔥 */
md-icon, .material-symbols-outlined {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
  overflow: visible !important;
  vertical-align: middle;
}

md-icon-button {
  flex-shrink: 0 !important; /* Impede o botão de encolher em containers flex */
}

/* ==========================================================================
   3. ESTRUTURA DE LAYOUT APP (Estilo WhatsApp sem cortes na base)
   ========================================================================== */
#app-root {
  display: flex;
  height: 100vh;
  height: 100dvh;
  width: 100%;
  position: relative;
  overflow: hidden;
}

/* --- Painel Lateral (Sidebar) --- */
.app-sidebar {
  width: 30%;
  min-width: 320px;
  max-width: 450px;
  border-right: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  display: flex;
  flex-direction: column;
  background: var(--md-sys-color-surface);
  height: 100%;
  z-index: 10;
}

.sidebar-header {
  padding: 16px;
  background: var(--md-sys-color-surface-variant);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  flex-shrink: 0;
}

.sidebar-content {
  flex-grow: 1;
  overflow-y: auto;
  padding: 16px;
  background-color: var(--md-sys-color-background);
  box-sizing: border-box;
}

/* --- Painel Principal (Área de Chat) --- */
.app-main {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--md-sys-color-surface-container-lowest, #f0f2f5);
  overflow: hidden;
}

.chat-header {
  padding: 16px;
  background: var(--md-sys-color-surface-variant);
  border-bottom: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  display: flex;
  align-items: center;
  gap: 16px;
  height: 73px;
  flex-shrink: 0;
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-input-area {
  padding: 16px;
  background: var(--md-sys-color-surface);
  border-top: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  flex-shrink: 0;
}

.back-button {
  display: none;
}

@media (max-width: 768px) {
  #app-root {
    height: 100dvh;
  }

  .app-sidebar, .app-main {
    width: 100%;
    max-width: 100%;
    height: 100dvh;
    position: absolute;
    top: 0;
    left: 0;
    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  .view-mode-list .app-main {
    transform: translateX(100%);
  }
  .view-mode-list .app-sidebar {
    transform: translateX(0);
  }

  .view-mode-chat .app-sidebar {
    transform: translateX(-30%);
    opacity: 0;
    pointer-events: none;
  }
  .view-mode-chat .app-main {
    transform: translateX(0);
  }

  .back-button {
    display: inline-flex;
  }
}

/* ==========================================================================
   4. ESTILOS DE COMPONENTES INTERNOS (Cards, inputs, blocos)
   ========================================================================== */

.container {
  background: var(--md-sys-color-surface);
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  margin-bottom: 20px;
  border-left: 4px solid var(--md-sys-color-primary);
  transition: box-shadow 0.2s ease;
}

.container:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.05);
}

.container-emissor { border-left-color: #002b3d; }
.container-receptor { border-left-color: #ff6b00; }
.container-contatos { border-left-color: #6c4f00; }

.row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.col {
  flex: 1;
  min-width: 200px;
}

md-filled-button,
md-outlined-button,
md-text-button {
  margin-bottom: 8px;
}

md-outlined-text-field,
md-filled-text-field,
md-outlined-select {
  width: 100%;
  margin-bottom: 8px;
}

md-list {
  background: transparent;
}

md-list-item {
  border-radius: 8px;
  margin-bottom: 4px;
  background: var(--md-sys-color-surface);
  overflow: visible !important; /* 🔥 Evita cortar o efeito ripple dos botões */
}

label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.875rem;
}

.profile-field {
  background: var(--md-sys-color-surface-variant);
  padding: 12px;
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--md-sys-color-outline);
  color: var(--md-sys-color-on-surface);
}

/* ==========================================================================
   5. BALÕES DE CHAT E STATUS
   ========================================================================== */
.chat-bubble-wrapper {
  display: flex;
  width: 100%;
  margin-bottom: 8px;
}

.chat-bubble-wrapper.in { justify-content: flex-start; }
.chat-bubble-wrapper.out { justify-content: flex-end; }

.chat-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  position: relative;
  box-shadow: 0 1px 1px rgba(0,0,0,0.1);
  word-wrap: break-word;
  user-select: none;
}

.chat-bubble.in {
  background-color: var(--md-sys-color-surface);
  border-top-left-radius: 2px;
}

.chat-bubble.out {
  background-color: #d9fdd3;
  color: #111;
  border-top-right-radius: 2px;
}

.chat-bubble-text {
  font-size: 0.95rem;
  line-height: 1.4;
  margin-bottom: 2px;
}

.chat-bubble-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  color: rgba(0,0,0,0.45);
  margin-top: 4px;
  margin-bottom: -4px;
}

.chat-bubble.out .chat-bubble-meta {
  color: rgba(0,0,0,0.55);
}

.status-icon {
  font-size: 0.7rem;
  letter-spacing: -2px;
}

.chat-messages {
  background-image: url('data:image/svg+xml,%3Csvg width="20" height="20" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M0 0h20v20H0z" fill="%23f0f2f5"/%3E%3Ccircle cx="2" cy="2" r="1" fill="%23d0d4d8"/%3E%3C/svg%3E');
}

/* ==========================================================================
   6. PAINEL DE DEBUG E ANIMAÇÕES
   ========================================================================== */
#debugPanel {
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem;
  padding: 12px;
  border-radius: 8px;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #333;
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.mt-10 { margin-top: 10px; }
.mb-10 { margin-bottom: 10px; }
.mt-20 { margin-top: 20px; }
.mb-20 { margin-bottom: 20px; }
.flex { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.flex-end { display: flex; gap: 8px; align-items: center; }
.gap-8 { gap: 8px; }
.gap-16 { gap: 16px; }
.w-full { width: 100%; }
.text-center { text-align: center; }
.text-muted { color: var(--md-sys-color-on-surface-variant); }
```

---

## Arquivo: `src/profile.tsx`

```tsx
// src/profile.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { profile, carregarProfile } from './stores/profileStore.ts';
import { ProfileSection } from './components/ProfileSection.tsx';

import "@material/web/all.js";
import './styles.css';

function ProfileApp() {
  useEffect(() => {
    carregarProfile();
  }, []);

  const isExistingUser = profile.value !== null;

  return (
    <div style="display: flex; flex-direction: column; align-items: center; min-height: 100vh; height: 100%; overflow-y: auto; padding-bottom: 40px; box-sizing: border-box;">
      
      <header class="sidebar-header" style="width: 100%; max-width: 600px; background: transparent; border: none; padding-top: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          {isExistingUser && (
            <md-icon-button onClick={() => window.location.href = '/'}>
              <md-icon>arrow_back</md-icon>
            </md-icon-button>
          )}
          <h1 style="margin: 0; font-size: 1.5rem; color: var(--md-sys-color-primary);">
            {isExistingUser ? "Meu Perfil" : "Configurar Conta"}
          </h1>
        </div>
      </header>

      <div style="width: 100%; max-width: 600px; padding: 16px; box-sizing: border-box;">
        <ProfileSection />
      </div>

    </div>
  );
}

const root = document.getElementById('app-profile');
if (root) {
  render(<ProfileApp />, root);
}
```

---

## Arquivo: `src/handshakes/hand-profile.ts`

```ts
// src/handshakes/hand-profile.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarProfile,
  buscarContatoPorChave,
  salvarContato,
  serializarPublicKeyVapid
} from "../utils/db-helpers.ts";

// Importamos a função principal do roteador para forçar a fila a andar quando criamos uma saída
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  // ==========================================
  // 📥 FLUXO DE ENTRADA (IN)
  // ==========================================
  if (handshakeId) {
    console.log(`[HAND-PROFILE] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.profile) {
      console.warn(`[HAND-PROFILE] ⚠️ Handshake ${handshakeId} não contém rotas de profile.`);
      return;
    }

    const profileReq = handshake.in.rotas.profile;

    // 1. Recebemos uma SOLICITAÇÃO (campos array) -> Devemos gerar a Resposta (FluxoOut)
    if (Array.isArray(profileReq.campos)) {
      console.log(`[HAND-PROFILE] 📩 Solicitação de dados recebida. Campos:`, profileReq.campos);
      
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil local não encontrado para responder à requisição.");

      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      
      // Monta os dados a serem enviados de volta
      const rotasProfileData: any = { id: meuHash };
      const camposSet = new Set(profileReq.campos);

      if (camposSet.has('name')) rotasProfileData.name = profile.name;
      if (camposSet.has('email')) rotasProfileData.email = profile.email;
      if (camposSet.has('vapidPublicKey')) rotasProfileData.vapidPublicKey = profile.vapidPublicKey;
      if (camposSet.has('vapidPrivateKeyEnvelope')) rotasProfileData.vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
      if (camposSet.has('e2ePublicKey')) rotasProfileData.e2ePublicKey = profile.e2ePublicKey;
      if (camposSet.has('subscription')) rotasProfileData.subscription = profile.subscription;

      // O próprio handshake recebido ganha um out (resposta)
      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: {
          profile: {
            data: rotasProfileData
          }
        }
      };
      
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);

      // Aciona o processador para enviar a resposta imediatamente
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos uma RESPOSTA (data object) -> Devemos salvar no IndexedDB
    else if (profileReq.data && profileReq.data.id) {
      console.log(`[HAND-PROFILE] 📩 Resposta de dados recebida do contato ${profileReq.data.id}`);
      
      const contatoId = profileReq.data.id;
      const contato = await buscarContatoPorChave(contatoId);
      
      if (contato) {
        const d = profileReq.data;
        
        // Atualiza apenas os campos que o contato enviou de volta
        if (d.name !== undefined) contato.name = d.name;
        if (d.email !== undefined) contato.email = d.email;
        if (d.vapidPublicKey !== undefined) contato.vapidPublicKey = d.vapidPublicKey;
        if (d.vapidPrivateKeyEnvelope !== undefined) contato.vapidPrivateKeyEnvelope = d.vapidPrivateKeyEnvelope;
        if (d.e2ePublicKey !== undefined) contato.e2ePublicKey = d.e2ePublicKey;
        if (d.subscription !== undefined) contato.subscription = d.subscription;

        contato.updatedAt = Date.now();
        await salvarContato(contato);
        console.log(`[HAND-PROFILE] ✅ Contato ${contatoId} atualizado com sucesso no DB.`);

        // Notifica a Interface (UI) para se recarregar
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
        });
      } else {
        console.warn(`[HAND-PROFILE] ⚠️ Resposta recebida, mas contato ${contatoId} não existe no banco.`);
      }
    }
  }
  
  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT - Acionado por nós)
  // ==========================================
  if (outParams) {
    console.log(`[HAND-PROFILE] 📤 Preparando saída manual de profile:`, outParams);
    
    // Função: solicitarPerfil
    if (outParams.function === 'solicitarPerfil') {
      const contatoId = outParams.contato;
      const campos = outParams.campos;

      if (!contatoId || !campos) {
        throw new Error("Parâmetros inválidos para solicitarPerfil. Exigido 'contato' e 'campos'.");
      }

      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            profile: {
              campos: campos
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      console.log(`[HAND-PROFILE] ✅ Handshake de solicitação de perfil criado.`);
      
      // Aciona a fila para processar o envio
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `src/handshakes/hand-mensagem.ts`

```ts
// src/handshakes/hand-mensagem.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, MensagemRecebida, MensagemEnviada } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarMensagemEnviada,
  salvarMensagemEnviada,
  buscarMensagemRecebida,
  salvarMensagemRecebida,
  buscarContatoPorChave
} from "../utils/db-helpers.ts";

import { processarFilaHandshake } from "../sw/sw-handshakes.ts";

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  // ==========================================
  // 📥 FLUXO DE ENTRADA (IN)
  // ==========================================
  if (handshakeId) {
    console.log(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) {
      console.warn(`[HAND-MENSAGEM] ⚠️ Handshake ${handshakeId} não contém rotas de mensagem.`);
      return;
    }

    const msgReq = handshake.in.rotas.mensagem;

    // 1. Recebemos uma SOLICITAÇÃO sobre uma mensagem que recebemos (campos array + recebida)
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      console.log(`[HAND-MENSAGEM] 📩 Solicitação de status da mensagem ${msgReq.recebida}.`);
      
      const msgLocal = await buscarMensagemRecebida(msgReq.recebida);
      const rotasMsgData: any = { recebida: msgReq.recebida };

      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('status')) rotasMsgData.status = msgLocal.status;
        if (camposSet.has('conteudo')) rotasMsgData.conteudo = msgLocal.conteudo;
        if (camposSet.has('recebidoEm')) rotasMsgData.recebidoEm = msgLocal.recebidoEm;
        if (camposSet.has('lidaEm')) rotasMsgData.lidaEm = msgLocal.lidaEm;
        if (camposSet.has('notificadaEm')) rotasMsgData.notificadaEm = msgLocal.notificadaEm;
      }

      handshake.out = {
        status: 'pendente',
        tentativas: 0,
        rotas: {
          mensagem: { data: rotasMsgData }
        }
      };
      
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos uma RESPOSTA de status de uma mensagem que nós enviamos (data object com recebida)
    // Isso atualiza o nosso balão de mensagem para Entregue / Lida (Os "dois tiques" ✓✓)
    else if (msgReq.data && msgReq.data.recebida && msgReq.data.status) {
      console.log(`[HAND-MENSAGEM] 📩 Confirmação recebida para a mensagem enviada ${msgReq.data.recebida}: ${msgReq.data.status}`);
      
      const msgEnviada = await buscarMensagemEnviada(msgReq.data.recebida);
      
      if (msgEnviada) {
        msgEnviada.status = 'entregue'; // Para expansão futura, mapear msgReq.data.status direto
        msgEnviada.updatedAt = Date.now();
        await salvarMensagemEnviada(msgEnviada);

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'MENSAGEM_ENTREGUE', payload: { mensagemId: msgEnviada.id, entregueEm: Date.now() } });
        });
      }
    }

    // 3. Recebemos uma NOVA MENSAGEM de um contato (🔥 CORRIGIDO: lendo direto da raiz de msgReq)
    else if (msgReq.enviada && msgReq.conteudo) {
      console.log(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do contato ${handshake.aud}: ${msgReq.enviada}`);
      
      // Cria a mensagem na Caixa de Entrada
      const novaMsgRecebida: MensagemRecebida = {
        id: msgReq.enviada,
        contatoPublicKeyVapid: handshake.aud,
        conteudo: msgReq.conteudo,
        status: 'nao_lida',
        recebidoEm: Date.now()
      };
      await salvarMensagemRecebida(novaMsgRecebida);

      // Cria um NOVO handshake para enviar o Recibo de Entrega (Auto-Ack)
      const ackHandshake: Handshake = {
        id: gerarId(),
        aud: handshake.aud,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            mensagem: {
              data: {
                recebida: novaMsgRecebida.id,
                status: 'nao_lida'
              }
            }
          }
        }
      };
      await salvarHandshake(ackHandshake);

      // Busca dados do contato para notificação visual
      const contato = await buscarContatoPorChave(handshake.aud);
      const nomeExibicao = contato?.name?.trim() || "Anônimo";
      const statusEmoji = contato?.trusted ? '✅' : '🔄';

      // Mostra a notificação do Sistema Operacional
      await self.registration.showNotification(`📥 Nova mensagem`, {
        body: `${novaMsgRecebida.conteudo}\n\n${statusEmoji} De: ${nomeExibicao}`,
        icon: '/icon.png',
        data: {
          mensagemId: novaMsgRecebida.id,
          acao: 'ver_mensagem'
        },
        tag: novaMsgRecebida.id,
        vibrate: [200, 100, 200]
      });

      // Avisa a Interface para renderizar o balão de chat (se o app estiver aberto)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => {
        client.postMessage({
          type: "PUSH_RECEIVED",
          payload: {
            id: novaMsgRecebida.id,
            body: novaMsgRecebida.conteudo,
            remetente: nomeExibicao,
            status: 'nao_lida'
          }
        });
      });

      // Aciona a fila para mandar o recibo de volta imediatamente
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT - Acionado por nós)
  // ==========================================
  if (outParams) {
    console.log(`[HAND-MENSAGEM] 📤 Preparando saída manual de mensagem:`, outParams);
    
    // Função: confirmarEntrega (Pedir o status de uma mensagem específica)
    if (outParams.function === 'confirmarEntrega') {
      const contatoId = outParams.contato;
      const mensagemId = outParams.mensagem;
      const campos = outParams.campos;

      if (!contatoId || !mensagemId || !campos) {
        throw new Error("Parâmetros inválidos. Exigido 'contato', 'mensagem' e 'campos'.");
      }

      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            mensagem: {
              recebida: mensagemId,
              campos: campos
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // Função: enviarMensagem (O usuário digitou e apertou enviar)
    else if (outParams.function === 'enviarMensagem') {
      const contatoId = outParams.contato;
      const conteudo = outParams.conteudo;

      if (!contatoId || !conteudo) {
        throw new Error("Parâmetros inválidos. Exigido 'contato' e 'conteudo'.");
      }

      const msgId = gerarId();

      // 1. Salva a mensagem no histórico do usuário
      const msgEnviada: MensagemEnviada = {
        id: msgId,
        contatoHash: contatoId,
        conteudo: conteudo,
        status: 'pendente',
        tentativas: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await salvarMensagemEnviada(msgEnviada);

      // 2. Cria o Handshake de transporte contendo a mensagem
      const novoHandshake: Handshake = {
        id: gerarId(),
        aud: contatoId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente',
          tentativas: 0,
          rotas: {
            mensagem: {
              enviada: msgId,
              conteudo: conteudo
            }
          }
        }
      };

      await salvarHandshake(novoHandshake);
      console.log(`[HAND-MENSAGEM] ✅ Handshake de envio de mensagem criado (ID Msg: ${msgId}).`);
      
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `src/handshakes/hand-contato.ts`

```ts
// src/handshakes/hand-contato.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Contato } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarProfile,
  buscarContatoPorChave,
  salvarContato,
  serializarPublicKeyVapid
} from "../utils/db-helpers.ts";
import { extrairDadosCompactos, expandirDadosCompactos } from "../utils/share-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: any }) {
  
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    const contatoReq = handshake.in.rotas.contato;

    // 1. Recebemos um Pull (O contato quer saber se confiamos nele e se temos os dados certos)
    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      console.log(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: any = { id: handshake.aud };

      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = extrairDadosCompactos(contato); // Puxa os dados espremidos
        
        if (camposSet.has('vapidPublicKey')) { rotasContatoData.vx = cp.vx; rotasContatoData.vy = cp.vy; }
        if (camposSet.has('e2ePublicKey')) rotasContatoData.en = cp.en;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; }
        if (camposSet.has('vapidPrivateKeyEnvelope')) rotasContatoData.ve = cp.ve;
        if (camposSet.has('email')) rotasContatoData.em = cp.em;
        if (camposSet.has('name')) rotasContatoData.nm = cp.nm;
        if (camposSet.has('trusted')) rotasContatoData.tr = contato.trusted;
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { contato: { data: rotasContatoData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // 2. Recebemos a Resposta do Pull (Avaliando a consistência)
    else if (contatoReq.data) {
      console.log(`[HAND-CONTATO] 📩 Resposta de status recebida. Avaliando consistência...`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();

      if (contato && profile) {
        const d = contatoReq.data;
        const mp = extrairDadosCompactos(profile); // Puxa o nosso perfil espremido para bater de frente
        let novoMeStatus = contato.me;

        if (!d.se) {
          novoMeStatus = 'none'; 
        } else {
          if (d.tr === true) novoMeStatus = 'trusted';
          else novoMeStatus = 'saved';

          if (d.se !== mp.se || d.sp !== mp.sp || d.sa !== mp.sa || 
              d.vx !== mp.vx || d.vy !== mp.vy || d.en !== mp.en || d.ve !== mp.ve) {
            novoMeStatus = 'wrong';
          }
        }

        if (contato.me !== novoMeStatus) {
          contato.me = novoMeStatus;
          contato.updatedAt = Date.now();
          await salvarContato(contato);
          console.log(`[HAND-CONTATO] ✅ Status do contato atualizado para: ${novoMeStatus}`);
          
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
        }
      }
    }

    // 3. Recebemos um Push (enviarSubscription/sync)
    else if (contatoReq.sync) {
      console.log(`[HAND-CONTATO] 📩 Pacote PUSH com perfil atualizado recebido.`);
      
      const expanded = expandirDadosCompactos(contatoReq.sync);
      const contatoAntigo = await buscarContatoPorChave(handshake.aud);
      
      // Avaliação blindada do status enviado pelo remetente
      const eleConfiaEmMim = contatoReq.sync.tr === true; 
      const novoMeStatus = eleConfiaEmMim ? 'trusted' : 'saved';

      const novoContato: Contato = {
        id: handshake.aud,
        vapidPublicKey: expanded.vapidPublicKey!,
        e2ePublicKey: expanded.e2ePublicKey!,
        email: expanded.email || '',
        name: expanded.name || '',
        subscription: expanded.subscription!,
        vapidPrivateKeyEnvelope: expanded.vapidPrivateKeyEnvelope!,
        trusted: contatoAntigo ? contatoAntigo.trusted : false, 
        me: novoMeStatus, 
        createdAt: contatoAntigo ? contatoAntigo.createdAt : Date.now(),
        updatedAt: Date.now()
      };

      await salvarContato(novoContato);
      console.log(`[HAND-CONTATO] ✅ Contato salvo. Status: ${novoMeStatus}`);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));

      if (contatoReq.sync.req) {
        console.log(`[HAND-CONTATO] 🔄 Devolvendo meus dados...`);
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  // ==========================================
  // 📤 FLUXO DE SAÍDA (OUT)
  // ==========================================
  if (outParams) {
    // PULL - Diagnóstico
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      const meuHash = await serializarPublicKeyVapid(profile!.vapidPublicKey);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // PUSH - Forçar Sincronização
    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");

      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;

      // Utiliza a função importada para reduzir DRY
      const compactSyncData = extrairDadosCompactos(profile, !outParams.responder, euConfio);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData } } }
      };

      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
}
```

---

## Arquivo: `src/service-worker.ts`

```ts
// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-handshakes.ts";
import { processarFilaHandshake } from "./sw/sw-handshakes.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

// Ativação: processar filas pendentes
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda 1 segundo antes de iniciar
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
    })()
  );
});
```

---

## Arquivo: `src/app.tsx`

```tsx
// src/app.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { ContatosSection } from './components/ContatosSection.tsx';
import { ChatSection } from './components/ChatSection.tsx'; 
import { ContactDetailSection } from './components/ContactDetailSection.tsx';
import { DebugPanel } from './components/DebugPanel.tsx';
import { addDebugLog, currentMobileView, contatoSelecionado, contatoCompartilharHash } from './signals/state.ts';
import { profile, initProfileStore, initContatosStore, initMensagensStore, contatosComHash } from './stores/index.ts';

import "@material/web/all.js";
import './styles.css';

function App() {
  const isDebugOpen = useSignal<boolean>(false);

  useEffect(() => {
    const init = async () => {
      await initProfileStore();
      
      if (!profile.value || !profile.value.e2ePrivateKeyJwk || !profile.value.vapidPrivateKeyJwk) {
        window.location.href = '/profile.html';
        return;
      }

      await initContatosStore();
      await initMensagensStore();
      addDebugLog("✅ Stores inicializados");
    };
    init();
  }, []);

  if (!profile.value) {
    return (
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    );
  }

  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;
  const contatoDetalhesAtivo = contatosComHash.value.find(c => c.hash === contatoCompartilharHash.value)?.contato;

  const nomeContatoAtivo = contatoAtivo ? (contatoAtivo.name?.trim() || "Anônimo") : "";
  const nomeDetalhesAtivo = contatoDetalhesAtivo ? (contatoDetalhesAtivo.name?.trim() || "Anônimo") : "";

  const fecharChatOuDetalhes = () => {
    currentMobileView.value = 'list';
    contatoSelecionado.value = '';
    contatoCompartilharHash.value = null;
  };

  const handleAbrirDetalhesDoContato = () => {
    if (contatoSelecionado.value) {
      contatoCompartilharHash.value = contatoSelecionado.value;
    }
  };

  return (
    <div id="app-root" class={`view-mode-${currentMobileView.value}`}>
      
      <aside class="app-sidebar">
        <header class="sidebar-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="position: relative;">
              <md-icon-button id="btn-menu" onClick={() => {
                const menu: any = document.getElementById('main-menu');
                if(menu) menu.open = !menu.open;
              }}>
                <md-icon>menu</md-icon>
              </md-icon-button>
              
              <md-menu id="main-menu" anchor="btn-menu" positioning="popover">
                <md-menu-item onClick={() => isDebugOpen.value = true}>
                  <div slot="headline">Logs de Debug</div>
                  <md-icon slot="start">bug_report</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => window.location.href = '/logout.html'}>
                  <div slot="headline">Sair do App (Logout)</div>
                  <md-icon slot="start">logout</md-icon>
                </md-menu-item>
              </md-menu>
            </div>
            <h1 style="margin: 0; font-size: 1.25rem;">Loco</h1>
          </div>
          
          <md-icon-button onClick={() => window.location.href = '/profile.html'}>
            <md-icon>account_circle</md-icon>
          </md-icon-button>
        </header>
        
        <div class="sidebar-content" style="padding: 0;">
          <div style="padding: 16px; animation: fadeIn 0.3s ease;">
            <ContatosSection />
          </div>
        </div>
      </aside>

      <main class="app-main">
        <header class="chat-header">
          <md-icon-button class="back-button" onClick={fecharChatOuDetalhes}>
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          
          <div 
            onClick={handleAbrirDetalhesDoContato}
            style={`display: flex; align-items: center; gap: 12px; ${contatoAtivo ? 'cursor: pointer;' : ''}`}
            title={contatoAtivo ? `Ver QR Code / Cartão de ${nomeContatoAtivo}` : ''}
          >
            <md-icon style="font-size: 2rem; color: #555;">account_circle</md-icon>
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; line-height: 1.2; display: flex; align-items: center; gap: 6px;">
                {contatoCompartilharHash.value 
                  ? `Cartão de ${nomeDetalhesAtivo}`
                  : (contatoAtivo ? nomeContatoAtivo : "Selecione um contato")}
                
                {/* Ícone de Verificado no Header do Chat */}
                {((contatoCompartilharHash.value && contatoDetalhesAtivo?.trusted) || 
                  (!contatoCompartilharHash.value && contatoAtivo?.trusted)) && (
                  <md-icon title="Contato Confiável" style="color: var(--md-sys-color-primary); font-size: 1.2rem;">verified</md-icon>
                )}
              </h2>
              <span style="font-size: 0.8rem; color: #666;">
                {contatoCompartilharHash.value 
                  ? "Aponte a câmera ou copie o link para indicar este contato"
                  : (contatoAtivo ? (contatoAtivo.email || "Sem e-mail") : "Inicie uma conversa na barra lateral")}
              </span>
            </div>

            {contatoAtivo && !contatoCompartilharHash.value && (
              <md-icon style="font-size: 1.2rem; color: var(--md-sys-color-primary); opacity: 0.8; margin-left: 4px;">qr_code_2</md-icon>
            )}
          </div>
        </header>

        {contatoCompartilharHash.value ? (
          <ContactDetailSection />
        ) : contatoSelecionado.value ? (
          <ChatSection /> 
        ) : (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888;">
            <div style="text-align: center;">
              <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
              <p>Clique em um contato na barra lateral<br/>para conversar ou ver seu cartão de indicação.</p>
            </div>
          </div>
        )}
      </main>

      <md-dialog open={isDebugOpen.value || undefined} onClose={() => isDebugOpen.value = false}>
        <div slot="headline" style="display: flex; align-items: center; gap: 8px;">
          <md-icon>bug_report</md-icon>
          Painel de Inspeção & Logs
        </div>
        <div slot="content" style="padding-top: 8px;">
          <DebugPanel />
        </div>
        <div slot="actions">
          <md-text-button onClick={() => isDebugOpen.value = false}>Fechar</md-text-button>
        </div>
      </md-dialog>

    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
```

---

## Arquivo: `src/share.tsx`

```tsx
// src/share.tsx
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { processarQualquerConvite } from './utils/share-utils.ts';
import { adicionarContato, initContatosStore } from './stores/contatosStore.ts';
import { serializarPublicKeyVapid } from './utils/db-helpers.ts';
import type { Contato } from './constants/db.ts';

import "@material/web/all.js";
import './styles.css';

declare global {
  class BarcodeDetector {
    constructor(options?: { formats: string[] });
    detect(image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<any[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
}

function ShareApp() {
  const preview = useSignal<Partial<Contato> | null>(null);
  const error = useSignal<string | null>(null);
  const isScanning = useSignal<boolean>(false);
  const manualInput = useSignal<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    initContatosStore();
    if (window.location.search.length > 3) {
      handleProcessar(window.location.href);
    } else {
      iniciarCamera();
    }
    return () => pararCamera();
  }, []);

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
      error.value = "Seu navegador não suporta a API nativa de leitura de QR Code. Tente colar o link manual abaixo.";
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

      alert("✅ Contato adicionado! Um pacote de sincronização invisível foi enviado para ele.");
      window.location.href = '/'; 
    } catch (e: any) {
      alert("❌ Erro ao adicionar contato: " + e.message);
    }
  };

  const cancelar = () => {
    pararCamera();
    window.location.href = '/';
  };

  return (
    <div style="min-height: 100vh; background-color: var(--md-sys-color-background); display: flex; flex-direction: column;">
      
      <header class="sidebar-header" style="background: var(--md-sys-color-surface-variant); border-bottom: 1px solid #e0e0e0; padding: 16px; display: flex; align-items: center; gap: 16px;">
        <md-icon-button onClick={cancelar}>
          <md-icon>arrow_back</md-icon>
        </md-icon-button>
        <h1 style="margin: 0; font-size: 1.25rem;">Leitor / Adicionar Contato</h1>
      </header>

      <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px;">
        {error.value ? (
          <div class="container" style="border-left-color: var(--md-sys-color-error); text-align: center; max-width: 400px; width: 100%;">
            <md-icon style="font-size: 48px; color: var(--md-sys-color-error); margin-bottom: 16px;">error</md-icon>
            <h2 style="justify-content: center;">Ops! Algo deu errado</h2>
            <p style="color: #666; margin-bottom: 24px;">{error.value}</p>
            <md-filled-button onClick={() => { error.value = null; iniciarCamera(); }} style="width: 100%;">
              Tentar Novamente
            </md-filled-button>
          </div>
        ) : preview.value ? (
          <div class="container" style="border-left-color: var(--md-sys-color-primary); max-width: 400px; width: 100%;">
            <div style="text-align: center; margin-bottom: 24px;">
              <md-icon style="font-size: 48px; color: var(--md-sys-color-primary); margin-bottom: 8px;">person_add</md-icon>
              <h2 style="justify-content: center;">Adicionar Contato</h2>
              <p style="color: #666; font-size: 0.9rem;">Você foi convidado(a) para se conectar de ponta a ponta com este perfil.</p>
            </div>
            
            <div style="background: var(--md-sys-color-surface-variant); padding: 16px; border-radius: 12px; margin-bottom: 24px; text-align: center;">
              <md-icon style="font-size: 32px; color: #555; margin-bottom: 8px;">account_circle</md-icon>
              <h3 style="margin: 0; font-size: 1.2rem;">{preview.value.name?.trim() || "Anônimo"}</h3>
              <p style="margin: 0; color: #666; font-size: 0.85rem;">{preview.value.email || "Sem e-mail"}</p>
            </div>

            <div style="display: flex; gap: 8px; flex-direction: column;">
              <md-filled-button onClick={confirmar} style="width: 100%;">✅ Confirmar e Adicionar</md-filled-button>
            </div>
          </div>
        ) : (
          <div class="container" style="border-left-color: var(--md-sys-color-secondary); text-align: center; max-width: 400px; width: 100%;">
            <h2 style="justify-content: center;">Ler QR Code</h2>
            <p style="font-size: 0.9rem; color: #666; margin-bottom: 16px;">Aponte a câmera para o convite do Loco de um amigo.</p>
            
            <div style="position: relative; width: 100%; aspect-ratio: 1; background: #000; border-radius: 12px; overflow: hidden;">
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
                  onInput={(e: any) => manualInput.value = e.target.value}
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
    </div>
  );
}

const root = document.getElementById('app-share');
if (root) {
  render(<ShareApp />, root);
}
```

---

## Arquivo: `README.md`

````md

# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes.
* **Privacidade por Design:** O servidor não armazena logs de conversas, lista de contatos ou conteúdo de mensagens.
* **Resistência à Evicção:** Os dados do usuário residem unicamente no dispositivo local através do IndexedDB e Origin Private File System (OPFS).

```
+------------------+         +-------------------+         +------------------+
|  Nó A (Emissor)  |         |   Servidor Proxy  |         |  Nó B (Receptor) |
|  (IndexedDB/SW)  |         |   Deno + WebPush  |         |  (IndexedDB/SW)  |
+--------+---------+         +---------+---------+         +--------+---------+
         |                             |                            |
         | --- 1. Envia JWT Cifrado -> |                            |
         |    (com VAPID Envelope)     | --- 2. Repassa via FCM ->  |
         |                             |    (Gateway WebPush)       |
         |                             |                            | --- 3. Recebe Push
         |                             |                            |     e Decifra E2E
         |                             |                            |
         | <--- 4. Handshake Recibo (sub: "hand") via Proxy -------- |

```

---

## 2. Padrões e Regras de Desenvolvimento

### 2.1. Diretrizes Principais

1. **Runtime Único (Deno 2.x):** Proibido o uso de Node.js, `npm` ou pacotes com dependências C++ nativas. Todo o código do cliente e servidor roda sobre a API Web Padrão e módulos ESM compatíveis com Deno.
2. **Zero `localStorage`:** É terminantemente proibido utilizar `localStorage` por conta de limitações de performance e bloqueios síncronos da I/O thread. Utilize a camada IndexedDB (`src/utils/db-helpers.ts`) via `idb-keyval`.
3. **Gerenciamento de Estado Reativo:** A reatividade da interface usa Preact Signals (`@preact/signals`).
4. **Isolamento de Processamento:** Tarefas computacionalmente intensivas (compressão, geração de chaves, parsing de matrizes QR) não devem bloquear a thread principal da UI.

---

### 2.2. Padrão Obrigatório de JSDoc Tático

Todas as funções utilitárias em `src/utils/` e gerenciadores no Service Worker devem incluir documentação no padrão **JSDoc**. O objetivo do JSDoc no projeto não é apenas tipar parâmetros, mas explicar **o porquê de decisões táticas**, limites de payload e precondições de segurança.

#### Exemplo de Padrão JSDoc Adotado no Projeto:

```typescript
/**
 * Empacota o perfil do usuário em um formato binário de ultra-alta densidade
 * reduzindo o tamanho final para caber confortavelmente em QR Codes (nível L).
 * 
 * @description
 * Converte o módulo RSA, chaves VAPID e envelopes para bytes brutos (Uint8Array),
 * tokeniza domínios conhecidos do FCM (`1:`) e aplica compressão GZIP via fflate.
 * 
 * @param {ProfileConfig} profile - Objeto de perfil completo do usuário contendo as chaves públicas.
 * @returns {string} String codificada em Base64Url pronta para renderização em matriz QR.
 * 
 * @throws {Error} Se a chave privada do envelope VAPID estiver ausente ou corrompida.
 */
export function gerarPayloadQrCodeCompacto(profile: ProfileConfig): string {
  // ... implementação ...
}

```

---

## 3. Arquitetura de Segurança e Criptografia

O Loco utiliza um modelo de criptografia em múltiplas camadas (Híbrida: Assimétrica + Simétrica):

```
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor  |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - Dados Cifrados: AES-GCM-256 (Texto da Mensagem + GZIP)         |  |
|  |   - Chave AES Cifrada: RSA-OAEP-2048 (Chave Pública do Receptor)   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

1. **Identidade / Assinatura (VAPID):**
* Par de Chaves: **ECDSA P-256** (`vapidPublicKey` / `vapidPrivateKeyJwk`).
* Usado para assinar os tokens JWT (`alg: "ES256"`) garantindo que o remetente é autêntico.


2. **Criptografia Ponto a Ponto (E2E):**
* Par de Chaves: **RSA-OAEP-2048** (`e2ePublicKey` / `e2ePrivateKeyJwk`).
* A mensagem de texto é comprimida com GZIP (`fflate`) e cifrada via **AES-GCM-256**. A chave AES simétrica é então cifrada com a chave pública RSA do destinatário.


3. **Blindagem do Servidor Proxy (VAPID Envelope):**
* O servidor proxy possui um par RSA estático exclusivo registrado em `.env`.
* Para evitar que a chave privada VAPID do usuário transite em texto puro ao solicitar requisições Push, o cliente cifra essa chave em um envelope (`vapidPrivateKeyEnvelope`). O servidor decifra o envelope temporariamente na RAM apenas para assinar a requisição no FCM e descarta o conteúdo da memória em seguida.



---

## 4. Estrutura e Formato de Convites

Para permitir que contatos se conectem lendo telas de celulares ou links em mensagens sem dependência de um servidor central, o projeto implementa o utilitário `src/utils/share-utils.ts` com dois modos de transporte:

### A) QR Code Binário Ultra-Compacto (`cqr`)

Usado na tela de perfil para gerar a matriz visual. Para não estourar o limite de bits da Versão 40 do QR Code (23.648 bits / ~2.950 bytes), os dados do perfil passam pelas seguintes transformações:

* **Tupla Ordenada:** O objeto JSON tem suas chaves removidas e é convertido em uma array de 11 posições fixas.
* **Tokenização de Endpoints:** Substitui a URL do Google (`[https://fcm.googleapis.com/fcm/send/](https://fcm.googleapis.com/fcm/send/)`) pelo prefixo `1:`.
* **Conversão de Módulo RSA:** A string Base64Url do campo `n` da chave RSA é convertida diretamente para bytes brutos.
* **Compressão:** O payload resultante é compactado via GZIP (`fflate`).

### B) Link Web Comprimido (`cjwt`)

Usado no botão "Copiar Link de Convite" para envio em aplicativos de terceiros (WhatsApp, E-mail, Telegram).

* Gera um JWT com a claim `sub: "contact"` assinado digitalmente pelo emissor.
* Comprime o token JWT gerado via GZIP, resultando na URL curta `/share.html?cjwt=...`.

---

## 5. Armazenamento Local (IndexedDB)

Os dados são armazenados de forma isolada nos bancos de dados gerenciados por `src/utils/db-helpers.ts`:

| Nome do Banco (`DB_NAMES`) | Chave Primária | Tipo de Dado | Finalidade |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves privadas/públicas e subscription. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (hex) | `Contato` | Lista de contatos salvos e status de homologação. |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico local de mensagens recebidas. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Fila offline de mensagens enviadas e status de entrega. |
| `Handshake_DB` | ID do Handshake | `Handshake` | Fila e histórico de recibos de entrega automática. |

---

## 6. Mapeamento Completo de Arquivos

```
loco/
├── src/
│   ├── app.tsx                 # Ponto de entrada da SPA. Layout do chat e Modal de Debug (<md-dialog>)
│   ├── profile.tsx / .html     # Tela de edição de perfil, diagnósticos e QR Code de convite
│   ├── share.tsx / .html       # Leitor de QR Code via câmera (BarcodeDetector) e importador de links
│   ├── logout.tsx / .html      # Expurgo completo do IndexedDB, Caches, OPFS e Service Workers
│   ├── service-worker.ts       # Orquestrador do SW (importa cache, push, click e workers de fila)
│   ├── styles.css              # Tema Material Design 3 e estilização responsiva (100dvh)
│   │
│   ├── components/             # Componentes de interface do Preact
│   │   ├── ChatSection.tsx     # Timeline unificada de mensagens com formatação de datas (Hoje, Ontem, DD/MM)
│   │   ├── ContatosSection.tsx # Lista de contatos homologados com rolagem flexível
│   │   └── DebugPanel.tsx      # Painel de inspeção de logs em tempo real
│   │
│   ├── signals/                # Estado reativo global
│   │   └── state.ts            # Signals da UI (contato selecionado, logs, viewports mobile)
│   │
│   ├── stores/                 # Camada de sincronização entre IndexedDB e Signals
│   │   ├── profileStore.ts     # Carregamento e atualização do perfil do usuário
│   │   ├── contatosStore.ts    # Mapeamento e cálculo de hashes de contatos
│   │   ├── mensagensStore.ts   # Gestão reativa de filas de envio e recebimento
│   │   └── index.ts            # Exportador unificado de stores
│   │
│   ├── utils/                  # Utilitários puros do sistema
│   │   ├── share-utils.ts      # [NÚCLEO] Encurtador de QR Code (cqr), links cjwt e parser unificado
│   │   ├── jwt-helpers.ts      # Utilidades de criação/validação de JWT ES256 e conversões Base64Url
│   │   ├── push-utils.ts       # Criptografia híbrida (AES-GCM + RSA-OAEP) e requisições ao proxy
│   │   ├── profile-utils.ts    # Gerador de chaves VAPID/RSA e registros no PushManager
│   │   ├── db-helpers.ts       # Abstração de I/O no IndexedDB via idb-keyval
│   │   ├── id-utils.ts         # Gerador de IDs de 12 caracteres browser-safe (Web Crypto API)
│   │   └── sw-utils.ts         # Helper de registro e ativação de Service Workers
│   │
│   └── sw/                     # Módulos internos do Service Worker
│       ├── cache.ts            # Gerenciamento de cache offline (CacheStorage API)
│       ├── push.ts             # Roteador de notificações Push (sub: "msg" / sub: "hand")
│       ├── click.ts            # Captura de cliques em notificações do sistema
│       ├── sw-mensagens.ts     # Processador da fila offline de envio e decodificador de entrada
│       └── sw-handshakes.ts    # Emissor e processador de recibos de entrega automática
│
├── main.ts                     # Servidor HTTP Deno (proxy CORS e retransmissor Push para o FCM)
├── build.ts                    # Script de build (compilação via Deno.bundle e injeção de assets no SW)
├── deno.json                   # Configurações do Deno 2.x, import maps e tasks
└── README.md                   # Documentação técnica do projeto

```

---

## 7. Comandos e Execução

Todos os comandos de automação estão configurados no `deno.json`:

* **Gerar o Bundle de Produção:**
```bash
deno task build

```


*Executa a compilação TSX/JS, copia os arquivos HTMLs estáticos para `dist/` e injeta a lista de assets no Service Worker.*
* **Iniciar o Servidor em Produção:**
```bash
deno task start

```


*Disponibiliza a aplicação na porta `http://localhost:8000`.*
* **Modo de Desenvolvimento (Watch):**
```bash
deno task dev

```


*Recompila o projeto e reinicia o servidor automaticamente a cada alteração nos arquivos fonte.*
* **Limpar a Pasta de Saída:**
```bash
deno task clean

```



---

## 8. Diagnóstico de Problemas (Troubleshooting)

* **Erro `Error: channel closed` durante o `deno task build`:**
* *Causa:* Ocorre quando há um erro de sintaxe TypeScript/JSX em algum arquivo `.tsx` importado, fazendo com que o processo filho do bundler seja abortado.
* *Solução:* Verifique os erros de sintaxe nos componentes e certifique-se de que nenhum arquivo `.html` foi incluído no array `entrypoints` do `Deno.bundle()`.


* **Erro `code length overflow` no QR Code:**
* *Causa:* O payload original ultrapassou a capacidade máxima de bits da matriz do QR Code.
* *Solução:* Certifique-se de utilizar a função `gerarPayloadQrCodeCompacto()` contida em `src/utils/share-utils.ts`, que aplica a otimização de tupla binária e compressão GZIP.


* **Payload Excede Limite no Push (`HTTP 413` / `MAX_PAYLOAD_SIZE`):**
* *Causa:* O tamanho do JWT assinado ultrapassou os 4.096 bytes permitidos pela especificação do Web Push (FCM).
* *Solução:* Mantenha as mensagens de texto dentro do tamanho recomendado e utilize compressão GZIP nos envelopes internos.
````

---

## Arquivo: `public/manifest.json`

```json
{
  "start_url": "/index.html",
  "scope": "/",
  "name": "loco",
  "short_name": "loco",
  "lang": "pt-BR",
  "icons": [
    {
      "src": "/android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#3b82f6",
  "background_color": "#60a5fa",
  "display": "standalone"
}
```

---

## Arquivo: `deno.json`

```json
{
  "workspace": ["proto/_template", "proto/01-push-messaging"],
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["./src/types/material-web.d.ts"]
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@^1",
    "@std/fs": "jsr:@std/fs@^1",
    "@std/http": "jsr:@std/http@^1",
    "@std/path": "jsr:@std/path@^1",
    "@std/http/file-server": "jsr:@std/http@^1/file-server",
    "webtorrent": "https://esm.sh/webtorrent@2.5.1?bundle",
    "preact": "https://esm.sh/preact@10.29.7",
    "preact/hooks": "https://esm.sh/preact@10.29.7/hooks",
    "preact/jsx-runtime": "https://esm.sh/preact@10.29.7/jsx-runtime",
    "@preact/signals": "https://esm.sh/@preact/signals@1.2.2",
    "qrcode-generator": "https://esm.sh/qrcode-generator@1.4.4",
    "fflate": "https://esm.sh/fflate@0.8.2",
    "@material/web": "https://esm.sh/@material/web@1.5.1?bundle",
    "@material/web/all.js": "https://esm.sh/@material/web@1.5.1/all.js?bundle",
    "idb-keyval": "https://esm.sh/idb-keyval@6.2.1",
    "@negrel/webpush": "jsr:@negrel/webpush@^0.5.0"
  },
  "tasks": {
    "test": "deno test --allow-env --allow-net tests/",
    "typecheck": "deno check main.ts build.ts export.ts src/**/*.ts src/**/*.tsx",
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle build.ts",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file main.ts",
    "dev": "deno task build && deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch main.ts",
    "clean": "rm -rf dist && mkdir -p dist",
    "export": "deno run --allow-read --allow-write export.ts"
  },
  "exclude": ["dist/", "public/"]
}

```

---

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
import { ensureDir, copy, walk } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const SRC_DIR = "src";
const PUBLIC_DIR = "public";

interface BundleResult {
  success: boolean;
  errors?: unknown[];
  warnings?: unknown[];
  outputFiles?: Array<{
    path: string;
    contents: Record<string, number> | Uint8Array | string;
    hash?: string;
  }>;
  code?: string;
  output?: string;
}

interface BundleOptions {
  entrypoints: string[];
  outputDir?: string;
  outputFile?: string;
  platform?: "browser" | "deno" | "neutral";
  format?: "esm" | "iife" | "cjs";
  bundle?: boolean;
  minify?: boolean;
  sourcemap?: boolean | "linked" | "inline";
  write?: boolean;
  jsx?: "automatic" | "react" | "preserve";
  jsxImportSource?: string;
  jsxFactory?: string;
  jsxFragment?: string;
}

async function clean() {
  try {
    await Deno.remove(DIST_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(DIST_DIR);
  console.log("📁 Arquivos anteriores excluídos");
}

async function copyStatic() {
  try {
    await copy(PUBLIC_DIR, DIST_DIR, { overwrite: true });
    console.log("📁 Arquivos estáticos copiados");
  } catch {
    console.log("⚠️ Pasta public não encontrada ou erro na cópia");
  }
}

function contentsToString(contents: Record<string, number> | Uint8Array | string): string {
  if (typeof contents === 'string') return contents;
  if (contents instanceof Uint8Array) return new TextDecoder().decode(contents);
  if (contents && typeof contents === 'object') {
    const bytes: number[] = [];
    const keys = Object.keys(contents);
    const isNumericKeys = keys.every(k => !isNaN(Number(k)));
    if (isNumericKeys && keys.length > 0) {
      const sortedKeys = keys.map(Number).sort((a, b) => a - b);
      for (const key of sortedKeys) {
        const value = (contents as Record<string, number>)[key.toString()];
        if (typeof value === 'number' && value >= 0 && value <= 255) bytes.push(value);
      }
      if (bytes.length > 0) return new TextDecoder().decode(new Uint8Array(bytes));
    }
  }
  return JSON.stringify(contents);
}

async function writeOutput(result: BundleResult, fileName: string): Promise<void> {
  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new Error(`Nenhum output gerado para ${fileName}`);
  }
  const text = contentsToString(result.outputFiles[0].contents);
  await Deno.writeTextFile(join(DIST_DIR, fileName), text);
}

function extrairCodigoDoBundle(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) return '';
  return contentsToString(result.outputFiles[0].contents);
}

async function runBundle(name: string, bundleOpts: BundleOptions): Promise<BundleResult> {
  console.log(`🔨 [${name}] Iniciando bundle...`);
  // deno-lint-ignore no-explicit-any
  const result = (await (Deno as any).bundle(bundleOpts)) as BundleResult;
  if (!result.success) {
    console.error(`❌ Erros no bundle ${name}:`, result.errors);
    throw new Error(`Falha ao gerar ${name}`);
  }
  for (const warning of result.warnings || []) {
    console.warn(`⚠️ ${name}:`, warning);
  }
  return result;
}

async function gerarOuCarregarChavesServidor() {
  let publicKey = Deno.env.get('SERVER_PUBLIC_KEY');
  let privateKey = Deno.env.get('SERVER_PRIVATE_KEY');
  if (publicKey && privateKey) {
    console.log("🔑 Chaves do servidor carregadas do .env");
    return;
  }
  console.log("🔐 Gerando novas chaves RSA do servidor...");
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyStr = JSON.stringify(publicJwk);
  const privateKeyStr = JSON.stringify(privateJwk);
  Deno.env.set('SERVER_PUBLIC_KEY', publicKeyStr);
  Deno.env.set('SERVER_PRIVATE_KEY', privateKeyStr);
  await Deno.writeTextFile(
    '.env',
    `# Chaves RSA do Servidor - Geradas automaticamente pelo build\n` +
    `# NÃO COMMITAR ESTE ARQUIVO!\n` +
    `SERVER_PUBLIC_KEY=${publicKeyStr}\n` +
    `SERVER_PRIVATE_KEY=${privateKeyStr}\n`
  );
  console.log(`✅ Chaves do servidor salvas em .env`);
  console.log("   ⚠️  NÃO COMMITAR este arquivo!");
  console.log("   💡 Use 'deno task start' para rodar o servidor");
}

async function listarAssetsParaCache(): Promise<string[]> {
  const assets: string[] = []; // Não Inclui a rota raiz explicitamente
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  // Caminha recursivamente por todos os subdiretórios criados pelo bundle dentro de dist
  for await (const entry of walk(DIST_DIR, { includeDirs: false })) {
    if (!entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      // Transforma o caminho do sistema de arquivos em caminho relativo web (ex: /assets/style.css)
      const webPath = entry.path.replace(DIST_DIR, "").replace(/\\/g, "/");
      assets.push(webPath);
    }
  }
  return assets;
}

async function build() {
  console.log("\n🚀 Iniciando build do protótipo...\n");
  const start = performance.now();

  await gerarOuCarregarChavesServidor();
  await clean();
  await copyStatic();

  console.log("📦 Compilando página HTML (browser-b)...");
  await runBundle("HTML", {
    entrypoints: [
      join(SRC_DIR, "index.html"), 
      join(SRC_DIR, "logout.html"),
      join(SRC_DIR, "share.html"),
      join(SRC_DIR, "profile.html")

    ],
    outputDir: DIST_DIR,
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    write: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });
 
  console.log("📦 Compilando Service Worker em memória...");
  const swResult = await runBundle("ServiceWorker", {
    entrypoints: [join(SRC_DIR, "service-worker.ts")],
    platform: "browser",
    format: "iife",
    bundle: true,
    minify: false,
    write: false,
  });

  let swCode = extrairCodigoDoBundle(swResult);
  if (swCode.length < 100) throw new Error("Não foi possível extrair o código do Service Worker");
  console.log(`   📄 Código extraído: ${swCode.length} caracteres`);

const assets = await listarAssetsParaCache();
const versionHash = Date.now().toString();

// Injeta as propriedades de forma robusta
swCode = swCode
  .replace(/VERSION_HASH/g, versionHash)
  // Substitui a expressão inteira __GENERATED_ASSETS__ pelo array serializado em JSON
  .replace(/__GENERATED_ASSETS__/g, JSON.stringify(assets).slice(1, -1)); 
  // O .slice(1, -1) remove os colchetes [ ] do JSON.stringify para encaixar perfeitamente dentro de [__GENERATED_ASSETS__]

await Deno.writeTextFile(join(DIST_DIR, "service-worker.js"), swCode);

  console.log(`✨ Service Worker gerado com sucesso! (v_${versionHash})`);
  console.log(`   📦 ${assets.length} assets em cache`);
  console.log(`   📄 Tamanho: ${(swCode.length / 1024).toFixed(2)} KB`);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${DIST_DIR}/`);
  console.log(`   📄 Assets cacheados: ${assets.join(', ')}\n`);
}

await build();
```

---

## Arquivo: `main.ts`

```ts
/// <reference lib="deno.ns" />
import { serveDir } from "@std/http/file-server";
import * as webpush from "@negrel/webpush";
import { deleteCookie } from "@std/http/cookie";

const PORT = 8000;

// 🔥 Lê diretamente do Deno.env (carregado via --env)
function carregarChavesDoServidor() {
  const publicKeyStr = Deno.env.get('SERVER_PUBLIC_KEY');
  const privateKeyStr = Deno.env.get('SERVER_PRIVATE_KEY');
  
  if (!publicKeyStr || !privateKeyStr) {
    console.error("❌ Chaves do servidor não encontradas!");
    console.error("   Execute 'deno task build' primeiro para gerar as chaves.");
    console.error("   Ou defina as variáveis de ambiente SERVER_PUBLIC_KEY e SERVER_PRIVATE_KEY");
    Deno.exit(1);
  }
  
  try {
    const publicKeyJwk = JSON.parse(publicKeyStr);
    const privateKeyJwk = JSON.parse(privateKeyStr);
    return { publicKeyJwk, privateKeyJwk };
  } catch (err) {
    console.error("❌ Erro ao parsear as chaves do servidor:", err);
    Deno.exit(1);
  }
}

// Chaves globais de infraestrutura do Servidor
let serverPrivateKey: CryptoKey;
let serverPublicKeyJwk: JsonWebKey;

async function inicializarChavesDoServidor() {
  const chaves = carregarChavesDoServidor();
  serverPublicKeyJwk = chaves.publicKeyJwk;
  
  serverPrivateKey = await crypto.subtle.importKey(
    "jwk",
    chaves.privateKeyJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    true,
    ["decrypt"]
  );
  
  console.log("🔒 Chaves RSA de Infraestrutura do Servidor carregadas do Deno.env!");
}

// Inicializa as chaves antes de o Deno abrir a escuta HTTP
await inicializarChavesDoServidor();

// Função auxiliar para descriptografar dados Hex usando a chave RSA exclusiva do servidor
async function decryptWithServerKey(base64Envelope: string): Promise<any> {
  try {
    // 1. Desempacota o envelope Base64 enviado pelo navegador
    const envelopeText = atob(base64Envelope);
    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(envelopeText);

    // Helper para converter strings Hex textuais de volta para arrays de bytes inteiros
    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    // 2. Descriptografa a chave AES usando a chave privada RSA-OAEP exclusiva da RAM do servidor
    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      serverPrivateKey,
      chaveAesCifradaBytes
    );

    // 3. Importa a chave simétrica AES recuperada de volta para o runtime do Deno
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    // 4. Descriptografa o conteúdo longo da chave privada VAPID original usando a chave AES aberta
    const vapidOriginalBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );

    const jsonText = new TextDecoder().decode(vapidOriginalBuffer);
    return JSON.parse(jsonText);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[SERVER] ❌ Erro ao descriptografar envelope VAPID:", errorMessage);
    throw new Error(`Falha crítica na quebra do envelope de criptografia híbrida VAPID: ${errorMessage}`);
  }
}

// Transforma as strings textuais de chave pública/privada VAPID em JSON estruturado
function parseVapidKeysToJwk(publicKey: any, privateKey: any) {
  try {
    return {
      publicKey: typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey,
      privateKey: typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`As chaves enviadas não estão no formato JSON/JWK válido: ${errorMessage}`);
  }
}

// Auditoria Cega: Lê as Claims do JWT sem precisar de chaves e sem descriptografar a mensagem
function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    let base64Url = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";

    const jsonString = new TextDecoder().decode(
      new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))
    );
    
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);
  
  // 1. Captura o Origin enviado pelo navegador
  let origin = req.headers.get("origin") || "";

  // CORREÇÃO CRUCIAL: Se o Origin vier vazio (comum em fetches relativos do mesmo domínio),
  // nós reconstrói ele dinamicamente usando o protocolo (http/https) e o Host atual do servidor
  if (origin === "") {
    const host = req.headers.get("host") || `localhost:${PORT}`;
    // Verifica se o seu servidor roda em ambiente seguro (HTTPS) na nuvem ou HTTP local
    const protocolo = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    origin = `${protocolo}://${host}`;
  }

  // 2. VALIDAÇÃO DE CORS ATUALIZADA
  // Permite localhost (qualquer porta) ou qualquer subdomínio de .vanaware.com
  const isAllowedOrigin = 
    /^https?:\/\/localhost(:\d+)?$/.test(origin) || 
    /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/.test(origin);

  // 3. Define os cabeçalhos de resposta baseados na validação acima
  const corsHeaders = {
    "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "https://vanaware.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
    "Access-Control-Allow-Credentials": "true"
  };

  // Trata requisições de preflight imediatamente
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Trava de segurança de API: Se a origem final gerada NÃO for permitida, bloqueia com 403
  if (!isAllowedOrigin && url.pathname.startsWith("/api/")) {
    console.warn(`🛑 [CORS REJEITADO] Acesso bloqueado para a origem: "${origin}"`);
    return new Response(JSON.stringify({ error: "CORS: Origem não autorizada para esta API." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ROTA DE INFRAESTRUTURA: Compartilha a chave pública para cifragem da chave VAPID
  if (req.method === "GET" && url.pathname === "/api/server-public-key") {
    return new Response(JSON.stringify(serverPublicKeyJwk), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // ROTA DE LOGOUT (mantida)
  if (url.pathname === "/api/logout" && req.method === "POST") {
    const headers = new Headers();
    deleteCookie(headers, "session_token", { path: "/" });
    headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
    return new Response(JSON.stringify({ disconnected: true }), {
      status: 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
        "content-type": "application/json",
      },
    });
  }

  // ROTA DE DISPARO: Processa o envelope VAPID e encaminha o JWT criptografado
  // 🔥 CORREÇÃO: o caminho agora é "/api/proxy-push" (com barra)
  if (req.method === "POST" && url.pathname === "/api/proxy-push") {
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy recebida!`);
    
    try {
      const body = await req.json();
      const { subscription, payloadText, vapid } = body;

      console.log(`   - Endpoint destino: ${subscription.endpoint.substring(0, 45)}...`);
      console.log(`   - Tamanho do payloadText: ${payloadText?.length || 0} bytes`);

      // Executa a auditoria cega das claims do token JWT
      const jwtClaims = lerMetadadosJJWT(payloadText);
      if (jwtClaims) {
        console.log(`   - [AUDITORIA JWT] Emitido por: ${jwtClaims.nm || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        console.log(`   - [AUDITORIA JWT] Destinado a: <${jwtClaims.sub || "Sem e-mail"}>`);
        //console.log(`   - [AUDITORIA JWT] Texto E2EE Criptografado (ct): ${(jwtClaims.ct || jwtClaims.cipherText || "N/A").substring(0, 20)}...`);
      } else {
        console.log(`   - [AUDITORIA JWT] ⚠️ Não foi possível ler as claims do JWT`);
      }

      let privateKeyFinal = vapid.privateKey;

      // 🔥 DESCRIPTOGRAFIA DA CHAVE PRIVADA VAPID NA RAM
      if (typeof privateKeyFinal === "string") {
        console.log("   - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
        console.log(`   - [SEGURANÇA] Tamanho do envelope: ${privateKeyFinal.length} bytes`);
        try {
          const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal);
          privateKeyFinal = decryptedPrivateKeyObj;
          console.log("   - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
        } catch (decryptErr) {
          console.error("   - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
          return new Response(
            JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log("   - Chave VAPID não é string, usando como está.");
      }

      // 1. Processa e normatiza as chaves do request
      let jwkKeys;
      try {
        jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        console.log("   - ✅ Chaves VAPID parseadas com sucesso");
      } catch (parseErr) {
        console.error("   - ❌ Erro ao parsear chaves VAPID:", parseErr);
        return new Response(
          JSON.stringify({ success: false, error: "Chaves VAPID inválidas." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 2. Importa a assinatura do cabeçalho de rede do push
      let vapidKeys;
      try {
        vapidKeys = await webpush.importVapidKeys(jwkKeys);
        console.log("   - ✅ Chaves VAPID importadas com sucesso");
      } catch (importErr) {
        console.error("   - ❌ Erro ao importar chaves VAPID:", importErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao importar chaves VAPID." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cria o servidor de aplicação
      let appServer;
      try {
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        console.log(`   - Contact: ${contact}`);
        appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });
        console.log("   - ✅ ApplicationServer criado com sucesso");
      } catch (serverErr) {
        console.error("   - ❌ Erro ao criar ApplicationServer:", serverErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao criar servidor de push." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // 3. Encaminha o token JWT fechado diretamente sem descriptografar o conteúdo
      try {
        console.log("   - 📤 Enviando push para:", subscription.endpoint.substring(0, 60) + "...");
        console.log(`   - 📤 Tamanho do payload: ${payloadText.length} bytes`);
        
        const subscriber = appServer.subscribe(subscription);
        await subscriber.pushTextMessage(payloadText, {});
        
        console.log("   ✅ [SUCESSO] Push despachado! Chave Privada VAPID descartada com segurança da RAM.");
      } catch (pushErr) {
        console.error("   - ❌ Erro ao enviar push:", pushErr);
        
        // 🔥 Tenta ler o corpo da resposta do FCM para diagnóstico
        let responseBody = '';
        let statusCode = 500;
        
        try {
          if (pushErr instanceof webpush.PushMessageError && pushErr.response) {
            statusCode = pushErr.response.status;
            responseBody = await pushErr.response.text();
            console.error(`   - 📄 Resposta do FCM (status ${statusCode}): ${responseBody}`);
          }
        } catch (e) {
          console.error(`   - ❌ Não foi possível ler a resposta do FCM:`, e);
        }
        
        // Se for erro de subscription inválida (410) ou 404
        if (pushErr instanceof webpush.PushMessageError && (pushErr.response?.status === 410 || pushErr.response?.status === 404)) {
          return new Response(
            JSON.stringify({ success: false, error: "Inscrição expirada ou revogada.", statusCode: pushErr.response.status }),
            { status: pushErr.response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Se o status for 400, pode ser problema no payload ou na chave
        if (pushErr instanceof webpush.PushMessageError && pushErr.response?.status === 400) {
          let msg = "Requisição inválida. Verifique a subscription e o payload.";
          if (responseBody.includes("Invalid")) {
            msg = "Chave VAPID inválida ou malformada.";
          } else if (responseBody.includes("payload")) {
            msg = "Payload malformado ou muito grande.";
          }
          return new Response(
            JSON.stringify({ success: false, error: msg, statusCode: 400 }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Re-lança o erro para ser tratado pelo catch externo se não for tratado acima
        throw pushErr;
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error) {
      console.error(`\n❌ [ERRO NO SERVIDOR PUSH] [${new Date().toLocaleTimeString()}]:`);

      const isPushError = error && typeof error === 'object' && 'response' in error;
      
      if (isPushError) {
        const statusCode = (error as any).response?.status || 400;
        console.error(`   -> Servidor Remoto retornou Status HTTP: ${statusCode}`);
        console.error(`   -> Detalhe do Erro: ${error.toString()}`);

        let clienteMensagem = "Erro desconhecido no servidor de push.";
        switch (statusCode) {
          case 410: clienteMensagem = "Inscrição expirada ou revogada (Usuário desativou as notificações)."; break;
          case 404: clienteMensagem = "Endpoint não encontrado ou expirado no servidor de push."; break;
          case 401: clienteMensagem = "Chaves VAPID inválidas ou assinatura rejeitada pelo servidor."; break;
          case 413: clienteMensagem = "Payload muito grande. O limite máximo permitido é 4096 bytes (4KB)."; break;
          case 429: clienteMensagem = "Limite de requisições excedido para este dispositivo (Rate Limit)."; break;
          default: clienteMensagem = `Servidor de push rejeitou com status ${statusCode}.`;
        }

        return new Response(
          JSON.stringify({ success: false, error: clienteMensagem, statusCode }),
          { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`   -> Erro Interno/Local: ${errorMessage}`);
      if (errorStack) console.error(errorStack);

      return new Response(
        JSON.stringify({ success: false, error: errorMessage, type: "InternalError" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // 4. FALLBACK: Serve os arquivos compilados da pasta dist/
  return serveDir(req, {
    fsRoot: "./dist",
    showDirListing: false,
    quiet: true,
  });
});

console.log(`🚀 Protótipo rodando em http://localhost:${PORT}`);
```

---


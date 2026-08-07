> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do meu projeto estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Analise a estrutura de pastas, as dependências e o código fornecido para indicar as mudanças necessárias para a implementação das novas funcionalidades discutidas.
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo e não somente as partes que devem ser modificadas.

---

# Código Fonte Selecionado do Projeto

Gerado automaticamente em: 8/6/2026, 11:05:19 PM

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

## Arquivo: `src/components/ContatosSection.tsx`

```tsx
// src/components/ContatosSection.tsx
import { useEffect } from 'preact/hooks';
import { contatosComHash, removerContatoPorPublicKey, homologarContatoPorPublicKey } from '../stores/contatosStore.ts';
import { showToast, contatoSelecionado, currentMobileView } from '../signals/state.ts';

export function ContatosSection() {
  useEffect(() => {
    // Stores já inicializados no App.tsx
  }, []);

  const abrirChat = (hash: string) => {
    contatoSelecionado.value = hash;
    currentMobileView.value = 'chat';
  };

  return (
    <div class="container container-contatos" style="border-left-color: #6c4f00; margin-bottom: 24px;">
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="font-size: 1.1rem; margin: 0;">📇 Meus Contatos</h2>
        <md-icon-button onClick={() => window.location.href = '/share.html'}>
          <md-icon>person_add</md-icon>
        </md-icon-button>
      </div>
      
      {/* 🔥 Eliminamos a trava de tamanho fixo e permitimos rolagem flexível */}
      <div style="max-height: calc(100vh - 220px); overflow-y: auto; background: var(--md-sys-color-surface-variant); border-radius: 8px;">
        {contatosComHash.value.length === 0 ? (
          <p style="padding: 16px; color: #666; text-align: center; margin: 0;">Nenhum contato adicionado.</p>
        ) : (
          <md-list>
            {contatosComHash.value.map(({ contato, hash }) => (
              <md-list-item 
                key={contato.email} 
                onClick={() => abrirChat(hash)}
                style="cursor: pointer;"
              >
                <md-icon slot="start">person</md-icon>
                <span slot="headline"><strong>{contato.nome}</strong></span>
                <span slot="supporting-text">{contato.homologado ? '✅ Homologado' : '🔄 Não homologado'}</span>
                
                <div slot="end" style="display: flex; gap: 8px;">
                  {!contato.homologado && (
                    <md-icon-button onClick={async (e) => {
                      e.stopPropagation();
                      await homologarContatoPorPublicKey(contato.publicKeyVapid);
                      showToast("Contato homologado!", "success");
                    }}><md-icon>verified</md-icon></md-icon-button>
                  )}
                  <md-icon-button onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('Remover este contato?')) {
                      await removerContatoPorPublicKey(contato.publicKeyVapid);
                    }
                  }}><md-icon>delete</md-icon></md-icon-button>
                </div>
              </md-list-item>
            ))}
          </md-list>
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
import { contatoSelecionado, mensagemEnvio, showToast } from '../signals/state.ts';
import { 
  mensagensEnviadas, adicionarMensagemEnviada, removerMensagemEnviadaPorId, carregarMensagensEnviadas,
  mensagensRecebidas, marcarMensagemRecebidaComoLida, removerMensagemRecebidaPorId, carregarMensagensRecebidas
} from '../stores/index.ts';
import { gerarIdMensagem } from '../utils/id-utils.ts';

// Helper para formatar a data e hora de forma legível
function formatarDataHora(timestamp: number): string {
  const data = new Date(timestamp);
  const hoje = new Date();
  
  const mesmoDia = data.getDate() === hoje.getDate() &&
    data.getMonth() === hoje.getMonth() &&
    data.getFullYear() === hoje.getFullYear();

  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const mesmoOntem = data.getDate() === ontem.getDate() &&
    data.getMonth() === ontem.getMonth() &&
    data.getFullYear() === ontem.getFullYear();

  const horaStr = data.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (mesmoDia) return horaStr;
  if (mesmoOntem) return `Ontem ${horaStr}`;
  
  // Se for mais antigo que ontem, exibe ex: "05/08 14:30"
  const diaStr = String(data.getDate()).padStart(2, '0');
  const mesStr = String(data.getMonth() + 1).padStart(2, '0');
  return `${diaStr}/${mesStr} ${horaStr}`;
}

export function ChatSection() {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Escuta os eventos do Service Worker para atualizar as listas
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'MENSAGEM_ENTREGUE') carregarMensagensEnviadas();
      if (e.data?.type === 'PUSH_RECEIVED') carregarMensagensRecebidas();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // 1. Prepara e Filtra Mensagens Recebidas
  const inMsgs = mensagensRecebidas.value
    .filter(m => m.contatoPublicKeyVapid === contatoSelecionado.value)
    .map(m => ({ ...m, type: 'in', timestamp: m.recebidoEm }));

  // 2. Prepara e Filtra Mensagens Enviadas
  const outMsgs = mensagensEnviadas.value
    .filter(m => m.contatoHash === contatoSelecionado.value)
    .map(m => ({ ...m, type: 'out', timestamp: m.createdAt }));

  // 3. Junta tudo e ordena cronologicamente
  const timeline = [...inMsgs, ...outMsgs].sort((a, b) => a.timestamp - b.timestamp);

  // Auto-scroll para o final quando a timeline muda
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  // Marca as mensagens recebidas como lidas automaticamente se o chat estiver aberto
  useEffect(() => {
    const naoLidas = inMsgs.filter(m => m.status === 'nao_lida' || m.status === 'notificada');
    naoLidas.forEach(m => marcarMensagemRecebidaComoLida(m.id));
  }, [inMsgs.length]);

  const handleEnviar = async () => {
    const selectedHash = contatoSelecionado.value;
    const conteudo = mensagemEnvio.value.trim();
    if (!selectedHash || !conteudo) return;

    try {
      const msgId = gerarIdMensagem();
      await adicionarMensagemEnviada({
        id: msgId,
        contatoHash: selectedHash,
        conteudo,
        status: 'pendente',
        tentativas: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'PROCESSAR_FILA_ENVIO' });
      
      mensagemEnvio.value = ''; // Limpa o input
    } catch (err: any) {
      showToast(`❌ ${err.message}`, "error");
    }
  };

  const deletarMensagem = async (id: string, type: string) => {
    if (confirm('Apagar esta mensagem para você?')) {
      if (type === 'in') await removerMensagemRecebidaPorId(id);
      else await removerMensagemEnviadaPorId(id);
    }
  };

  return (
    <>
      {/* AREA DA TIMELINE (Mensagens) */}
      <div class="chat-messages" ref={scrollRef}>
        {timeline.length === 0 ? (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888;">
            <div style="text-align: center; background: rgba(0,0,0,0.05); padding: 8px 16px; border-radius: 16px; font-size: 0.85rem;">
              As mensagens são protegidas com criptografia.
            </div>
          </div>
        ) : (
          timeline.map(msg => (
            <div key={msg.id} class={`chat-bubble-wrapper ${msg.type}`}>
              <div class={`chat-bubble ${msg.type}`} onDblClick={() => deletarMensagem(msg.id, msg.type)} title="Duplo clique para apagar">
                
                <div class="chat-bubble-text">{msg.conteudo}</div>
                
                <div class="chat-bubble-meta">
                  {/* 🔥 FORMATADOR DE DATA E HORA ATUALIZADO 🔥 */}
                  <span>{formatarDataHora(msg.timestamp)}</span>
                  
                  {/* Status (Apenas para enviadas) */}
                  {msg.type === 'out' && (
                    <span class="status-icon">
                      {msg.status === 'pendente' && '⏳'}
                      {msg.status === 'enviando' && '🔄'}
                      {msg.status === 'enviada' && '✓'}
                      {msg.status === 'entregue' && '✓✓'}
                      {msg.status === 'falha' && '❌'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* AREA DE INPUT (Enviar) */}
      <div class="chat-input-area">
        <div style="display: flex; gap: 8px; align-items: flex-end;">
          <md-outlined-text-field
            value={mensagemEnvio.value}
            onInput={(e: any) => mensagemEnvio.value = e.target.value}
            placeholder="Mensagem"
            style="flex-grow: 1; margin-bottom: 0;"
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
          ></md-outlined-text-field>
          <md-filled-icon-button onClick={handleEnviar} style="margin-bottom: 0; width: 48px; height: 48px; flex-shrink: 0;">
            <md-icon>send</md-icon>
          </md-filled-icon-button>
        </div>
      </div>
    </>
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

// ============================================================
// Constantes
// ============================================================
export const MAX_TENTATIVAS = 3;
export const MAX_PAYLOAD_SIZE = 4096;

// ============================================================
// INTERFACES PRINCIPAIS (UNIFICADAS)
// ============================================================

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

// ============================================================
// INTERFACES DE DADOS
// ============================================================

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

export interface Contato {
  publicKeyVapid: JsonWebKey;
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string;
  homologado: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Handshake {
  id: string;
  mensagemId: string;
  tipo: 'confirmacao_entrega';
  direcao: 'out' | 'in';
  status: 'pendente' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;
  payload: any;
  createdAt: number;
  updatedAt: number;
  erro?: string;
}

// ============================================================
// 🔥 PAYLOADS DE JWT (CORREÇÃO)
// ============================================================

export interface PayloadMensagem {
  iss: string;
  sub: "msg";
  aud: string;
  jti: string;
  ct: string;          // envelope JSON
  nm: string;
  iat?: number;
}

export interface PayloadHandshake {
  iss: string;
  sub: "hand";
  aud: string;         // mensagemId
  jti: string;
  ct: string;          // envelope JSON
}

export interface PayloadContato {
  iss: string;
  sub: "contact";
  nm: string;
  p: JsonWebKey;
  s: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    k: string;         // envelope VAPID privada
  };
  iat: number;
}

export interface EnvelopeCifrado {
  i: string;  // iv base64
  d: string;  // dados cifrados base64
  k: string;  // chave AES cifrada base64
}

export interface ConteudoMensagem {
  c: string;  // texto
  e: {
    s?: {
      e?: string;  // endpoint (alternativo)
      endpoint?: string;
      k?: { p256dh: string; auth: string };
      keys?: { p256dh: string; auth: string };
      v?: string;  // envelope VAPID privada
    };
    p?: JsonWebKey;
  };
}

export interface ConteudoHandshake {
  htype: 'confirmacao_entrega';
  // outros campos opcionais
}
```

---

## Arquivo: `src/signals/state.ts`

```ts
// src/signals/state.ts
import { signal } from '@preact/signals';

// Define qual visualização está ativa no layout mobile
// 'list' = mostra a sidebar (contatos), 'chat' = mostra a área de mensagens, 'profile' = mostra configurações
export const currentMobileView = signal<'list' | 'chat' | 'profile'>('list');

export const contatoSelecionado = signal<string>('');
export const mensagemEnvio = signal<string>('');

// 🔥 Inicializamos vazios em vez de "Alice" para evitar o piscar na tela
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

## Arquivo: `src/stores/contatosStore.ts`

```ts
// src/stores/contatosStore.ts
import { signal } from '@preact/signals';
import { 
  listarContatos, 
  salvarContato, 
  removerContato, 
  homologarContato, 
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
    const hash = await serializarPublicKeyVapid(c.publicKeyVapid);
    return { contato: c, hash };
  }));
  contatosComHash.value = comHash;
}

export async function adicionarContato(contato: Contato) {
  await salvarContato(contato);
  await carregarContatos();
}

export async function removerContatoPorPublicKey(publicKeyVapid: JsonWebKey) {
  await removerContato(publicKeyVapid);
  await carregarContatos();
}

export async function homologarContatoPorPublicKey(publicKeyVapid: JsonWebKey) {
  await homologarContato(publicKeyVapid);
  await carregarContatos();
}

export async function buscarContatoPorHash(hash: string): Promise<Contato | undefined> {
  const item = contatosComHash.value.find(item => item.hash === hash);
  if (item) return item.contato;
  return await buscarContatoPorChave(hash);
}

export async function initContatosStore() {
  await carregarContatos();
}
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

## Arquivo: `src/sw/sw-mensagens.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, set, createStore, del, entries } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import { gerarIdMensagem } from "../utils/id-utils.ts";
import {
  buscarContatoPorChave,
  serializarPublicKeyVapid,
  listarHandshakesPorMensagemId,
  salvarHandshake,
  listarMensagensEnviadasPorStatus,
  atualizarStatusMensagemEnviada,
  salvarMensagemEnviada,
  buscarMensagemEnviada,
  salvarProfile,
  buscarProfile,
  buscarChaveDecript,
  salvarContato,
  buscarContatoPorPublicKey,
  salvarMensagemRecebida,
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { processarFilaHandshake } from "./sw-handshakes.ts";

// ============================================================
// FUNÇÃO PRINCIPAL: PROCESSAR MENSAGEM RECEBIDA (sub: "msg")
// ============================================================
export async function processarMensagemRecebida(payload: any, header: any, jwt: string) {
  console.log("[SW-MSG] 📩 Processando mensagem recebida...");

  try {
    const profile = await buscarProfile();
    if (!profile) {
      throw new Error("Perfil do receptor não encontrado.");
    }

    const aud = payload.aud || payload.sub;
    if (aud !== profile.email) {
      console.warn(`[SW-MSG] ⚠️ 'aud' não corresponde ao email do perfil. Esperado: ${profile.email}, Recebido: ${aud}`);
    }

    const jti = payload.jti || gerarIdMensagem();
    console.log(`[SW-MSG] 📋 jti: ${jti}`);

    const publicKeyVapid = header.kid;
    if (!publicKeyVapid) {
      throw new Error("Header JWT não contém 'kid' (chave pública VAPID).");
    }

    const emailRemetente = payload.iss || "remetente@desconhecido";
    const nomeRemetente = payload.nm || payload.name || emailRemetente.split('@')[0] || "Remetente";
    console.log(`[SW-MSG] 🔐 Mensagem de ${nomeRemetente} <${emailRemetente}>`);

    let contato = null;
    if (publicKeyVapid) {
      contato = await buscarContatoPorPublicKey(publicKeyVapid);
      if (contato) {
        console.log(`[SW-MSG] Contato existente encontrado: ${contato.email}`);
      }
    }

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA de decodificação não encontrada.");
    }

    const envelopeJson = payload.ct || payload.cipherText;
    if (!envelopeJson) throw new Error("Envelope não encontrado.");

    const envelope = JSON.parse(envelopeJson);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateDecryptKey,
      chaveAesCifradaBytes
    );
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const textoDecifradoBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );
    const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
    const textoDecifrado = new TextDecoder().decode(decompressed);

    let mensagemObj = JSON.parse(textoDecifrado);
    const conteudo = mensagemObj.c || textoDecifrado;

    const e = mensagemObj.e || {};
    const subscription = e.s ? {
      endpoint: e.s.e || e.s.endpoint,
      keys: e.s.k || e.s.keys
    } : null;
    const publicKeyRSA = e.p || null;
    const vapidPrivateKey = (e.s && e.s.v) ? e.s.v : null;

    if (publicKeyVapid && publicKeyRSA && subscription) {
      let contatoExistente = await buscarContatoPorPublicKey(publicKeyVapid);
      const novoContato = {
        publicKeyVapid: publicKeyVapid,
        email: emailRemetente,
        nome: contatoExistente?.nome || nomeRemetente,
        publicKeyRSA: publicKeyRSA,
        subscription: subscription,
        vapidPrivateKey: vapidPrivateKey || '',
        homologado: contatoExistente ? contatoExistente.homologado : false,
        createdAt: contatoExistente ? contatoExistente.createdAt : Date.now(),
        updatedAt: Date.now()
      };
      await salvarContato(novoContato);
      contato = novoContato;
    } else {
      console.warn("[SW-MSG] ⚠️ Dados insuficientes para salvar contato.");
    }

    const msgId = jti;
    const contatoKey = publicKeyVapid ? await serializarPublicKeyVapid(publicKeyVapid) : '';
    const mensagemRecebida = {
      id: msgId,
      contatoPublicKeyVapid: contatoKey,
      conteudo: conteudo,
      status: 'nao_lida',
      recebidoEm: Date.now()
    };
    await salvarMensagemRecebida(mensagemRecebida);

    if (contatoKey) {
      await criarHandshakeConfirmacaoEntrega(msgId, contatoKey);
    } else {
      console.warn("[SW-MSG] ⚠️ Não foi possível criar handshake: contatoKey vazio.");
    }

    const homologadoFinal = contato ? contato.homologado : false;
    const podeResponder = !!(contato && contato.subscription && contato.publicKeyRSA && contato.vapidPrivateKey);
    const statusEmoji = homologadoFinal ? '✅' : '🔄';
    const statusTexto = homologadoFinal ? 'Homologado' : 'Não homologado';

    let bodyNotificacao = `${conteudo}\n\n${statusEmoji} De: ${nomeRemetente} - ${statusTexto}`;
    if (aud !== profile.email) {
      bodyNotificacao += `\n⚠️ Esta mensagem foi enviada para outro destinatário (${aud})`;
    }

    await self.registration.showNotification(`📥 Nova mensagem`, {
      body: bodyNotificacao,
      icon: '/icon.png',
      data: {
        mensagemId: msgId,
        publicKeyVapid: publicKeyVapid,
        homologado: homologadoFinal,
        podeResponder: podeResponder,
        acao: homologadoFinal ? 'ver_mensagem' : 'homologar_emissor'
      },
      tag: msgId,
      requireInteraction: !homologadoFinal,
      vibrate: [200, 100, 200]
    });

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({
        type: "PUSH_RECEIVED",
        payload: {
          id: msgId,
          body: conteudo,
          remetente: nomeRemetente,
          homologado: homologadoFinal,
          podeResponder: podeResponder,
          status: 'nao_lida',
          audMismatch: aud !== profile.email
        }
      });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar mensagem:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA CRIAR HANDSHAKE DE CONFIRMAÇÃO DE ENTREGA
// ============================================================
async function criarHandshakeConfirmacaoEntrega(mensagemId: string, contatoPublicKeyVapid: string) {
  console.log(`[SW-MSG] 🔄 Criando handshake de confirmação para mensagem ${mensagemId}`);
  try {
    const handshakesExistentes = await listarHandshakesPorMensagemId(mensagemId);
    if (handshakesExistentes.some(h => h.tipo === 'confirmacao_entrega' && h.direcao === 'out')) {
      console.log(`[SW-MSG] ℹ️ Handshake de confirmação já existe para ${mensagemId}.`);
      return;
    }

    const contato = await buscarContatoPorChave(contatoPublicKeyVapid);
    if (!contato) {
      throw new Error(`Contato para a mensagem ${mensagemId} não encontrado.`);
    }

    const handshakeId = gerarIdMensagem();
    const handshake = {
      id: handshakeId,
      mensagemId: mensagemId,
      tipo: 'confirmacao_entrega',
      direcao: 'out',
      status: 'pendente',
      tentativas: 0,
      payload: { recebidoEm: Date.now() },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await salvarHandshake(handshake);
    console.log(`[SW-MSG] ✅ Handshake ${handshakeId} salvo com status 'pendente'.`);

    // Disparar processamento imediato da fila de handshakes (agora com importação direta)
    await processarFilaHandshake();
    console.log(`[SW-MSG] ✅ Processamento da fila de handshakes iniciado.`);

    // Notifica janelas abertas (opcional)
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(client => {
      client.postMessage({ type: 'HANDSHAKE_CRIADO', payload: { handshakeId, mensagemId } });
    });

  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao criar handshake:", err);
  }
}

// ============================================================
// FUNÇÃO DE PROCESSAMENTO DA FILA DE ENVIO
// ============================================================
export async function processarFilaEnvio() {
  console.log("[SW-MSG] 🔄 Processando fila de envio...");

  try {
    const pendentes = await listarMensagensEnviadasPorStatus('pendente');
    const enviandoAntigos = (await listarMensagensEnviadasPorStatus('enviando'))
      .filter(m => (Date.now() - m.updatedAt) > 30000);

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-MSG] ℹ️ Nenhuma mensagem pendente para enviar.");
      return;
    }

    console.log(`[SW-MSG] 📦 ${paraProcessar.length} mensagens para processar`);

    for (const msg of paraProcessar) {
      await atualizarStatusMensagemEnviada(msg.id, 'enviando');

      try {
        const contato = await buscarContatoPorChave(msg.contatoHash);
        let profile = await buscarProfile();

        if (!contato) throw new Error("Contato não encontrado");
        if (!profile) throw new Error("Perfil não encontrado");

        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Mensagens Web Push não configurada (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-MSG] ⚠️ Envelope da chave VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter a chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const payloadObj = {
          c: msg.conteudo,
          e: {
            s: {
              e: profile.subscription.endpoint,
              k: profile.subscription.keys,
              v: vapidPrivateKeyEnvelope
            },
            p: profile.e2ePublicKey
          }
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "msg",
          aud: contato.email,
          jti: msg.id,
          ct: envelopeJson,
          nm: profile.name
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
const MAX_PAYLOAD_SIZE = 4096;
if (jwt.length > MAX_PAYLOAD_SIZE) {
  throw new Error(`Payload excede limite de ${MAX_PAYLOAD_SIZE} bytes (tamanho atual: ${jwt.length})`);
}
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey
          }
        );

        await atualizarStatusMensagemEnviada(msg.id, 'enviada');
        console.log(`[SW-MSG] ✅ Mensagem ${msg.id} enviada com sucesso!`);

      } catch (err) {
        console.error(`[SW-MSG] ❌ Erro ao enviar mensagem ${msg.id}:`, err);
        const mensagemAtual = await buscarMensagemEnviada(msg.id);
        if (mensagemAtual) {
          mensagemAtual.tentativas++;
          mensagemAtual.erro = err.message;
          if (mensagemAtual.tentativas >= MAX_TENTATIVAS) {
            mensagemAtual.status = 'falha';
            console.log(`[SW-MSG] ⛔ Mensagem ${msg.id} excedeu tentativas máximas.`);
          } else {
            mensagemAtual.status = 'pendente';
          }
          mensagemAtual.updatedAt = Date.now();
          await salvarMensagemEnviada(mensagemAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-MSG] ❌ Erro ao processar fila de envio:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS (permanecem usando self para os eventos)
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_ENVIO') {
    console.log("[SW-MSG] 📩 Recebido comando para processar fila de envio.");
    await processarFilaEnvio();
  }
});

self.addEventListener('sync', async function(event) {
  if (event.tag === 'sync-envio-mensagens') {
    event.waitUntil(processarFilaEnvio());
  }
});

self.addEventListener('online', async function() {
  console.log("[SW-MSG] 🌐 Conexão restaurada, processando filas...");
  await processarFilaEnvio();
});

console.log("[SW-MSG] 📦 Módulo de mensagens carregado.");
```

---

## Arquivo: `src/sw/sw-handshakes.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { get, createStore } from "idb-keyval";
import { gunzipSync } from "fflate";
import { DB_NAMES, STORE_NAMES, KEY_NAMES, MAX_TENTATIVAS } from "../constants/db.ts";
import { base64UrlToArrayBuffer } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  listarHandshakesPendentesPorTipo,
  atualizarStatusHandshake,
  buscarMensagemEnviada,
  atualizarStatusMensagemEnviada,
  salvarProfile,
  buscarContatoPorChave,
  buscarHandshake,
  buscarProfile,
  buscarChaveDecript,
  listarHandshakes,
} from "../utils/db-helpers.ts";
import { criarJWT } from "../utils/jwt-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";

// ============================================================
// FUNÇÃO PARA PROCESSAR HANDSHAKE RECEBIDO (sub: "hand")
// ============================================================
export async function processarHandshakeRecebido(payload: any, header: any, jwt: string) {
  console.log("[SW-HANDSHAKE] 🤝 Processando handshake recebido...");

  try {
    if (!payload.jti) throw new Error("Handshake sem jti");
    if (!payload.aud) throw new Error("Handshake sem aud (mensagemId esperada)");
    if (!payload.ct) throw new Error("Handshake sem ct (envelope cifrado)");

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não disponível para decifrar handshake.");
    }

    const envelopeJson = payload.ct;
    const envelope = JSON.parse(envelopeJson);
    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;
    if (!iv || !dados || !chaveAesCifrada) throw new Error("Envelope incompleto.");

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateDecryptKey,
      chaveAesCifradaBytes
    );
    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const textoDecifradoBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      chaveSimetricaAes,
      dadosBytes
    );
    const decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
    const textoDecifrado = new TextDecoder().decode(decompressed);
    const payloadObj = JSON.parse(textoDecifrado);

    if (!payloadObj.htype) throw new Error("Handshake sem htype no envelope");

    const mensagemId = payload.aud;

    const handshake = {
      id: payload.jti,
      mensagemId: mensagemId,
      tipo: payloadObj.htype,
      direcao: 'in',
      status: 'entregue',
      tentativas: 0,
      payload: payloadObj,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await salvarHandshake(handshake);
    console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} (tipo: ${handshake.tipo}) recebido para mensagem ${mensagemId}.`);

    if (payloadObj.htype === 'confirmacao_entrega') {
      try {
        const mensagemEnviada = await buscarMensagemEnviada(mensagemId);
        if (mensagemEnviada) {
          await atualizarStatusMensagemEnviada(mensagemId, 'entregue');
          console.log(`[SW-HANDSHAKE] ✅ Mensagem enviada ${mensagemId} marcada como entregue.`);

          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(client => {
            client.postMessage({
              type: 'MENSAGEM_ENTREGUE',
              payload: {
                mensagemId: mensagemId,
                entregueEm: Date.now(),
              }
            });
          });
        } else {
          console.warn(`[SW-HANDSHAKE] ⚠️ Mensagem enviada ${mensagemId} não encontrada.`);
        }
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao marcar mensagem enviada ${mensagemId} como entregue:`, err);
      }
    }

  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar handshake:", err);
    throw err;
  }
}

// ============================================================
// FUNÇÃO PARA PROCESSAR FILA DE HANDSHAKES (envio)
// ============================================================
export async function processarFilaHandshake() {
  console.log("[SW-HANDSHAKE] 🔄 Processando fila de handshakes...");

  try {
    const pendentes = await listarHandshakesPendentesPorTipo('confirmacao_entrega');
    const todos = await listarHandshakes();
    const enviandoAntigos = todos.filter(
      h => h.tipo === 'confirmacao_entrega' &&
           h.direcao === 'out' &&
           h.status === 'enviando' &&
           (Date.now() - h.updatedAt) > 30000
    );

    const paraProcessar = [...pendentes, ...enviandoAntigos];

    if (paraProcessar.length === 0) {
      console.log("[SW-HANDSHAKE] ℹ️ Nenhum handshake pendente.");
      return;
    }

    console.log(`[SW-HANDSHAKE] 📦 ${paraProcessar.length} handshakes para processar (${pendentes.length} pendentes, ${enviandoAntigos.length} reenfileirados)`);

    for (const handshake of paraProcessar) {
      await atualizarStatusHandshake(handshake.id, 'enviando');

      try {
        const storeMensagensRecebidas = createStore(DB_NAMES.MENSAGENS_RECEBIDAS_B, STORE_NAMES.KEYVAL);
        const mensagemRecebida = await get(handshake.mensagemId, storeMensagensRecebidas);
        if (!mensagemRecebida) {
          throw new Error(`Mensagem ${handshake.mensagemId} não encontrada no banco.`);
        }

        const contato = await buscarContatoPorChave(mensagemRecebida.contatoPublicKeyVapid);
        if (!contato) {
          throw new Error(`Contato para a mensagem ${handshake.mensagemId} não encontrado.`);
        }

        let profile = await buscarProfile();
        if (!profile) throw new Error("Perfil não encontrado");

        if (!profile.e2ePublicKey || !profile.vapidPublicKey || !profile.vapidPrivateKeyJwk) {
          throw new Error("Usuário não logado (sem Chaves)");
        }
        if (!profile.subscription) {
          throw new Error("Web Push não configurado (sem Subscription)");
        }
        if (!contato.publicKeyRSA || !contato.publicKeyVapid || !contato.vapidPrivateKey) {
          throw new Error("Contato sem Chaves");
        }
        if (!contato.subscription) {
          throw new Error("Contato sem Subscription");
        }

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          console.warn("[SW-HANDSHAKE] ⚠️ Envelope VAPID não encontrado. Cifrando...");
          const res = await fetch("/api/server-public-key");
          if (!res.ok) throw new Error("Não foi possível obter chave pública do servidor.");
          const serverPublicKeyJwk = await res.json();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const payloadObj = {
          htype: handshake.tipo,
        };

        const envelope = await cifrarPayloadObj(payloadObj, contato.publicKeyRSA);
        const envelopeJson = JSON.stringify(envelope);

        const payloadJwt = {
          iss: profile.email,
          sub: "hand",
          aud: handshake.mensagemId,
          jti: handshake.id,
          ct: envelopeJson,
        };

        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });

        console.log(`[SW-HANDSHAKE] 📤 Enviando handshake ${handshake.id} para ${contato.email}`);
const MAX_PAYLOAD_SIZE = 4096;
if (jwt.length > MAX_PAYLOAD_SIZE) {
  throw new Error(`Payload excede limite de ${MAX_PAYLOAD_SIZE} bytes (tamanho atual: ${jwt.length})`);
}
        await enviarParaProxy(
          contato.subscription,
          jwt,
          {
            subject: `mailto:${contato.email}`,
            publicKey: contato.publicKeyVapid,
            privateKey: contato.vapidPrivateKey,
          }
        );

        await atualizarStatusHandshake(handshake.id, 'enviado');
        console.log(`[SW-HANDSHAKE] ✅ Handshake ${handshake.id} enviado com sucesso!`);
      } catch (err) {
        console.error(`[SW-HANDSHAKE] ❌ Erro ao enviar handshake ${handshake.id}:`, err);
        const handshakeAtual = await buscarHandshake(handshake.id);
        if (handshakeAtual) {
          handshakeAtual.tentativas++;
          handshakeAtual.erro = err.message;
          if (handshakeAtual.tentativas >= MAX_TENTATIVAS) {
            handshakeAtual.status = 'falha';
            console.log(`[SW-HANDSHAKE] ⛔ Handshake ${handshake.id} excedeu tentativas máximas.`);
          } else {
            handshakeAtual.status = 'pendente';
          }
          handshakeAtual.updatedAt = Date.now();
          await salvarHandshake(handshakeAtual);
        }
      }
    }
  } catch (err) {
    console.error("[SW-HANDSHAKE] ❌ Erro ao processar fila:", err);
  }
}

// ============================================================
// LISTENERS DE EVENTOS
// ============================================================
self.addEventListener('message', async (event) => {
  const data = event.data;
  if (data.type === 'PROCESSAR_FILA_HANDSHAKE') {
    console.log("[SW-HANDSHAKE] 📩 Recebido comando para processar fila de handshakes.");
    await processarFilaHandshake();
  }
});

self.addEventListener('sync', async function (event) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', async function () {
  console.log("[SW-HANDSHAKE] 🌐 Conexão restaurada, processando handshakes...");
  await processarFilaHandshake();
});

console.log("[SW-HANDSHAKE] 📦 Módulo de handshakes carregado.");
```

---

## Arquivo: `src/sw/push.ts`

```ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarMensagemRecebida } from "./sw-mensagens.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import type { PayloadMensagem, PayloadHandshake } from "../constants/db.ts";

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

        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload as PayloadHandshake, header, rawText);
          return;
        }

        if (payload.sub === "msg") {
          await processarMensagemRecebida(payload as PayloadMensagem, header, rawText);
          return;
        }

        await self.registration.showNotification("⚠️ Tipo de mensagem inválido", {
          body: `Esperado 'msg' ou 'hand', recebido '${payload.sub}'`,
          icon: '/icon.png',
        });
        console.warn(`[SW-PUSH-ROUTER] ⚠️ JWT com sub inválido: ${payload.sub}`);
      } catch (err) {
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

## Arquivo: `src/utils/id-utils.ts`

```ts
// src/utils/id-utils.ts

/**
 * Tamanho padrão do ID para mensagens.
 * 12 caracteres oferecem ~10^18 combinações, suficiente para protótipo.
 */
const ID_LENGTH = 12;

/**
 * Caracteres seguros para URL usados em IDs (como NanoID).
 * Remove: +, /, = (caracteres perigosos para URLs)
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/**
 * Gera um ID único para mensagens usando Web Crypto API.
 * Substitui nanoid (que usa node:crypto no esm.sh) com implementação pura browser-safe.
 * @param length - Tamanho do ID (padrão: 12)
 * @returns ID único (ex: "V1StGXR8_Z5jd")
 */
export function gerarIdMensagem(length: number = ID_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}

/**
 * Verifica se um ID é válido (tem o formato esperado).
 * @param id - ID a ser validado
 * @returns true se o ID parece válido
 */
export function validarIdMensagem(id: string): boolean {
  // NanoID usa caracteres A-Z, a-z, 0-9, _, -
  return /^[A-Za-z0-9_-]+$/.test(id) && id.length >= 8;
}

/**
 * Gera um ID de fallback para situações onde o nanoID não está disponível.
 * @returns ID de fallback (timestamp + random)
 */
export function gerarIdFallback(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
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
// Contatos
// ============================================================

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function serializarPublicKeyVapid(jwk: JsonWebKey): Promise<string> {
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

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.publicKeyVapid);
  await salvarChave(storeContatos, key, contato);
}

export async function buscarContatoPorPublicKey(publicKeyVapid: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  return buscarChave<Contato>(storeContatos, key);
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  return buscarChave<Contato>(storeContatos, key);
}

export async function listarContatos(): Promise<Contato[]> {
  const entries = await listarChaves<Contato>(storeContatos);
  return entries.map(([_, c]) => c);
}

export async function homologarContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
  const contato = await buscarChave<Contato>(storeContatos, key);
  if (contato) {
    contato.homologado = true;
    contato.updatedAt = Date.now();
    await salvarChave(storeContatos, key, contato);
  }
}

export async function removerContato(publicKeyVapid: JsonWebKey): Promise<void> {
  const key = await serializarPublicKeyVapid(publicKeyVapid);
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

export async function listarHandshakesPorStatus(status: Handshake['status']): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.status === status);
}

export async function listarHandshakesPendentesPorTipo(tipo: Handshake['tipo']): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.status === 'pendente' && h.tipo === tipo && h.direcao === 'out');
}

export async function atualizarStatusHandshake(id: string, status: Handshake['status'], erro?: string): Promise<void> {
  const handshake = await buscarHandshake(id);
  if (handshake) {
    handshake.status = status;
    handshake.updatedAt = Date.now();
    if (erro) handshake.erro = erro;
    await salvarHandshake(handshake);
  }
}

export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}

export async function listarHandshakesPorMensagemId(mensagemId: string): Promise<Handshake[]> {
  const todos = await listarHandshakes();
  return todos.filter(h => h.mensagemId === mensagemId);
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
    if (!existingProfile || !vapidKeyPair) {
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
      const rawPublicKey = await window.crypto.subtle.exportKey("raw", vapidKeyPair.publicKey);
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
    let e2ePrivateKeyCrypto: CryptoKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      addDebugLog("📂 Chaves E2E encontradas no perfil.");
      e2ePublicKey = existingProfile.e2ePublicKey;
      e2ePrivateKeyJwk = existingProfile.e2ePrivateKeyJwk;
      try {
        e2ePrivateKeyCrypto = await window.crypto.subtle.importKey(
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
        e2ePrivateKeyCrypto = newKeys.privateDecrypt;
      }
    } else {
      addDebugLog("🔑 Gerando novas chaves E2E...");
      const newKeys = await generateE2EEKeys();
      e2ePublicKey = newKeys.publicEncrypt;
      e2ePrivateKeyJwk = newKeys.privateDecryptJwk;
      e2ePrivateKeyCrypto = newKeys.privateDecrypt;
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
      privateKey: vapidKeyPair.privateKey
    };
    await salvarIdentidadeA(identidadeTemporaria);

    addDebugLog("✅ Perfil salvo com sucesso.");
    return profile;
  } catch (err) {
    addDebugLog("❌ Erro ao gerar perfil: " + (err instanceof Error ? err.message : String(err)));
    throw err;
  }
}
```

---

## Arquivo: `src/utils/share-utils.ts`

```ts
// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

/**
 * Converte uma string Base64 / Base64Url para Uint8Array direto
 */
function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(base64UrlToArrayBuffer(b64));
}

/**
 * Converte Uint8Array diretamente para Base64Url sem inflar a memória
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  return arrayBufferToBase64Url(bytes.buffer);
}

/**
 * 1. GERADOR DE QR CODE BINÁRIO (De-para direto de ArrayBuffer - Extremamente leve)
 */
export function gerarPayloadQrCodeCompacto(p: ProfileConfig): string {
  const envelopeObj = JSON.parse(atob(p.vapidPrivateKeyEnvelope));

  // Otimiza o endpoint tirando o prefixo repetitivo da Google
  let ep = p.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) {
    ep = "1:" + ep.replace(FCM_PREFIX, "");
  }

  // Decodifica strings Hex/Base64 para Uint8Arrays brutos
  const hexToBytes = (hex: string) => 
    new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

  const ivBytes = hexToBytes(envelopeObj.iv);
  const dadosBytes = hexToBytes(envelopeObj.dadosCifrados);
  const chaveBytes = hexToBytes(envelopeObj.chaveAesCifrada);
  const rsaNBytes = base64ToBytes(p.e2ePublicKey.n!);

  // Estrutura ultra-compacta contendo valores convertidos/compactados
  const compactPayload = [
    p.email,
    p.name,
    p.vapidPublicKey.x,
    p.vapidPublicKey.y,
    bytesToBase64Url(rsaNBytes), // RSA Módulo em bytes limpos
    ep,
    p.subscription.keys.p256dh,
    p.subscription.keys.auth,
    bytesToBase64Url(ivBytes),
    bytesToBase64Url(dadosBytes),
    bytesToBase64Url(chaveBytes)
  ];

  // Comprime o JSON minimalista
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compactPayload));
  const compressed = gzipSync(jsonBytes);

  return bytesToBase64Url(compressed);
}

/**
 * 2. GERADOR DE LINK DE CONVITE (JWT Assinado Comprimido para Web/WhatsApp)
 */
export async function gerarLinkConviteWeb(p: ProfileConfig, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  const payload = {
    iss: p.email,
    sub: "contact",
    nm: p.name,
    p: p.e2ePublicKey,
    s: {
      endpoint: p.subscription.endpoint,
      keys: p.subscription.keys,
      k: p.vapidPrivateKeyEnvelope
    },
    iat: Math.floor(Date.now() / 1000)
  };

  const jwt = await criarJWT(payload, p.vapidPrivateKeyJwk, { kid: p.vapidPublicKey });
  
  const jwtBytes = new TextEncoder().encode(jwt);
  const compressed = gzipSync(jwtBytes);
  const cjwt = bytesToBase64Url(compressed);

  return `${window.location.origin}/share.html?cjwt=${cjwt}`;
}

/**
 * 3. PARSER UNIFICADO (Lê tanto QR Codes binários quanto Links cjwt/jwt)
 */
export async function processarQualquerConvite(input: string): Promise<{ header: any; payload: any }> {
  let cqr = null;
  let cjwt = null;
  let jwt = null;

  try {
    const url = new URL(input);
    cqr = url.searchParams.get('cqr');
    cjwt = url.searchParams.get('cjwt');
    jwt = url.searchParams.get('jwt');
  } catch {
    // Se colou código bruto no campo de texto
    if (!input.includes('.')) {
      cqr = input; // Tenta como payload binário
    } else {
      jwt = input;
    }
  }

  // CASO A: Payload Binário de QR Code
  if (cqr) {
    try {
      const compressed = base64ToBytes(cqr);
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const data = JSON.parse(jsonText);

      if (Array.isArray(data) && data.length === 11) {
        let [email, name, vapidX, vapidY, rsaN, endpoint, p256dh, auth, b64Iv, b64Dados, b64Chave] = data;

        // Reconstitui o endpoint FCM se tiver sido tokenizado
        if (endpoint.startsWith("1:")) {
          endpoint = FCM_PREFIX + endpoint.substring(2);
        }

        // Reconstitui o Envelope Hexadecimal a partir do Base64
        const b64ToHex = (b64: string) => {
          const bytes = base64ToBytes(b64);
          return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const envelope = {
          iv: b64ToHex(b64Iv),
          dadosCifrados: b64ToHex(b64Dados),
          chaveAesCifrada: b64ToHex(b64Chave)
        };

        return {
          header: {
            kid: { kty: "EC", crv: "P-256", x: vapidX, y: vapidY }
          },
          payload: {
            iss: email,
            nm: name,
            p: { kty: "RSA", e: "AQAB", n: rsaN, alg: "RSA-OAEP-256", ext: true },
            s: {
              endpoint: endpoint,
              keys: { p256dh, auth },
              k: btoa(JSON.stringify(envelope))
            }
          }
        };
      }
    } catch (e) {
      // Se falhar o parse do binário, cai pro CJWT
    }
  }

  // CASO B: JWT Comprimido (Link Web / WhatsApp)
  const targetCjwt = cjwt || cqr;
  if (targetCjwt) {
    const compressed = base64ToBytes(targetCjwt);
    const decompressed = gunzipSync(compressed);
    const jsonText = new TextDecoder().decode(decompressed);

    const { header, payload, valid } = await verificarJWT(jsonText);
    if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
    return { header, payload };
  }

  // CASO C: JWT Legado (Não comprimido)
  if (jwt) {
    const { header, payload, valid } = await verificarJWT(jwt);
    if (!valid) throw new Error("Assinatura do convite inválida.");
    return { header, payload };
  }

  throw new Error("Formato de convite ou QR Code inválido.");
}
```

---

## Arquivo: `src/service-worker.ts`

```ts
// src/service-worker.ts
import "./sw/cache.ts";
import "./sw/push.ts";
import "./sw/click.ts";
import "./sw/sw-mensagens.ts";
import "./sw/sw-handshakes.ts";
import { processarFilaEnvio } from "./sw/sw-mensagens.ts";
import { processarFilaHandshake } from "./sw/sw-handshakes.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

// Ativação: processar filas pendentes (com await adequado)
self.addEventListener('activate', (event) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      // Aguarda 1 segundo antes de iniciar
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaEnvio();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de envio:", e);
      }
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

## Arquivo: `src/share.tsx`

```tsx
// src/share.tsx
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { processarQualquerConvite } from './utils/share-utils.ts';
import { adicionarContato, initContatosStore } from './stores/contatosStore.ts';
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
  const preview = useSignal<any | null>(null);
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
    } catch (err) {
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
      const { header, payload } = preview.value;
      const novoContato: Contato = {
        publicKeyVapid: header.kid,
        email: payload.iss,
        nome: payload.nm || payload.iss,
        publicKeyRSA: payload.p,
        subscription: {
          endpoint: payload.s.endpoint,
          keys: payload.s.keys
        },
        vapidPrivateKey: payload.s.k,
        homologado: true, 
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      await adicionarContato(novoContato);
      alert("✅ Contato adicionado com sucesso!");
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
              <h3 style="margin: 0; font-size: 1.2rem;">{preview.value.payload.nm}</h3>
              <p style="margin: 0; color: #666; font-size: 0.85rem;">{preview.value.payload.iss}</p>
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

/* Botão de voltar (escondido no desktop) */
.back-button {
  display: none;
}

/* --- Responsividade Mobile (Deslizamento e Viewport Dinâmica) --- */
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

  /* Quando a view ativa for a lista de conversas */
  .view-mode-list .app-main {
    transform: translateX(100%);
  }
  .view-mode-list .app-sidebar {
    transform: translateX(0);
  }

  /* Quando a view ativa for o chat aberto */
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

/* Containers (cards padrão) */
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

.container-emissor {
  border-left-color: #002b3d;
}

.container-receptor {
  border-left-color: #ff6b00;
}

.container-contatos {
  border-left-color: #6c4f00;
}

/* Grid / Row */
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

/* Material Design Components Espaçamentos */
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
}

label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 0.875rem;
}

/* Campo de Perfil e JSON Viewer */
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
.msg-item {
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 8px;
  background: var(--md-sys-color-surface);
  border: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  transition: background 0.15s ease;
}

.msg-item-nao-lida {
  background: #fffde7;
  border-left: 4px solid #ffb300;
}

.msg-item-notificada {
  background: #e3f2fd;
  border-left: 4px solid #1e88e5;
}

.msg-item-lida {
  background: #f5f5f5;
}

.msg-item-homologado {
  border-left: 4px solid #2e7d32;
}

.msg-item-nao-homologado {
  border-left: 4px solid #e65100;
}

.msg-item-pendente {
  background: #fff8e1;
  border-left: 4px solid #f9a825;
}

.msg-item-enviada {
  background: #e8f5e9;
  border-left: 4px solid #43a047;
}

.msg-item-entregue {
  background: #c8e6c9;
  border-left: 4px solid #2e7d32;
}

.msg-item-falha {
  background: #ffebee;
  border-left: 4px solid #d32f2f;
}

/* Badges de Status (Pílulas) */
.status-badge {
  display: inline-block;
  padding: 2px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.status-badge-homologado { background: #d4edda; color: #155724; }
.status-badge-nao-homologado { background: #fff3cd; color: #856404; }
.status-badge-lida { background: #d1ecf1; color: #0c5460; }
.status-badge-notificada { background: #d1ecf1; color: #0c5460; }
.status-badge-enviada { background: #d4edda; color: #155724; }
.status-badge-entregue { background: #c3e6cb; color: #155724; }
.status-badge-falha { background: #f8d7da; color: #721c24; }
.status-badge-pendente { background: #fff3cd; color: #856404; }

/* Wrapper da Linha */
.chat-bubble-wrapper {
  display: flex;
  width: 100%;
  margin-bottom: 8px;
}

.chat-bubble-wrapper.in {
  justify-content: flex-start;
}
.chat-bubble-wrapper.out {
  justify-content: flex-end;
}

/* O Balão de Fala */
.chat-bubble {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  position: relative;
  box-shadow: 0 1px 1px rgba(0,0,0,0.1);
  word-wrap: break-word;
  user-select: none;
}

/* Balão Recebido (Esquerda) */
.chat-bubble.in {
  background-color: var(--md-sys-color-surface);
  border-top-left-radius: 2px;
}

/* Balão Enviado (Direita - Estilo Mensageiros) */
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

/* Fundo da Área de Mensagens */
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
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Utilitários Gerais */
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

## Arquivo: `src/app.tsx`

```tsx
// src/app.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { ContatosSection } from './components/ContatosSection.tsx';
import { ChatSection } from './components/ChatSection.tsx'; 
import { DebugPanel } from './components/DebugPanel.tsx';
import { addDebugLog, currentMobileView, contatoSelecionado } from './signals/state.ts';
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

  const fecharChat = () => {
    currentMobileView.value = 'list';
    contatoSelecionado.value = '';
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
              
              {/* 🔥 MENU HAMBÚRGUER COM ABERTURA DO MODAL DE DEBUG */}
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
          <md-icon-button class="back-button" onClick={fecharChat}>
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          
          <div style="display: flex; align-items: center; gap: 12px;">
            <md-icon style="font-size: 2rem; color: #555;">account_circle</md-icon>
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; line-height: 1.2;">
                {contatoAtivo ? contatoAtivo.nome : "Selecione um contato"}
              </h2>
              <span style="font-size: 0.8rem; color: #666;">
                {contatoAtivo ? contatoAtivo.email : "Inicie uma conversa na barra lateral"}
              </span>
            </div>
          </div>
        </header>

        {contatoSelecionado.value ? (
           <ChatSection /> 
        ) : (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888;">
            <div style="text-align: center;">
              <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
              <p>Clique em um contato na barra lateral<br/>para iniciar uma conversa criptografada.</p>
            </div>
          </div>
        )}
      </main>

      {/* 🔥 MODAL DE DEBUG FLUTUANTE INTEGRADO NA INDEX */}
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

## Arquivo: `src/profile.tsx`

```tsx
// src/profile.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { profile, carregarProfile, atualizarProfile } from './stores/profileStore.ts';
import { profileName, profileEmail, addDebugLog, showToast } from './signals/state.ts';
import { gerarProfileCompleto } from './utils/profile-utils.ts';
import { cifrarChaveVapid } from './utils/push-utils.ts';
import { salvarProfile } from './utils/db-helpers.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from './utils/share-utils.ts';

import "@material/web/all.js";
import './styles.css';

function ProfileApp() {
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
    const gerarQrCodeLocal = async () => {
      const p = profile.value;
      if (!p) return;
      try {
        const payloadBinario = gerarPayloadQrCodeCompacto(p);
        
        const qr = qrcode(0, 'L');
        qr.addData(payloadBinario);
        qr.make();
        qrCodeDataUrl.value = qr.createDataURL(5, 0);

      } catch (e) {
        console.error("Falha ao gerar QR Code", e);
        qrCodeDataUrl.value = null;
      }
    };

    if (!hasErrors && profile.value) {
      gerarQrCodeLocal();
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

      <div style="width: 100%; max-width: 600px; padding: 16px; display: flex; flex-direction: column; gap: 16px; box-sizing: border-box;">
        
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
            {hasErrors ? (
              <md-filled-button onClick={handleGerarOuCorrigir} style="width: 100%; --md-sys-color-primary: #ba1a1a;">
                🔧 Gerar Chaves / Corrigir Permissões
              </md-filled-button>
            ) : (
              <md-filled-button onClick={handleGerarOuCorrigir} style="width: 100%;">
                💾 Salvar Alterações
              </md-filled-button>
            )}
            
            <md-outlined-button onClick={handleCompartilhar} style="width: 100%;" disabled={hasErrors ? true : undefined}>
              🔗 Copiar Link de Convite
            </md-outlined-button>

            {!hasErrors && !diag.loading && (
               <md-text-button onClick={() => window.location.href = '/'} style="width: 100%; margin-top: 8px;">
                 Entrar no App ➡️
               </md-text-button>
            )}
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

        <div class="container" style="background: #fff; margin-bottom: 0; border-left-color: #555;">
          <h3 style="font-size: 0.95rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <md-icon style="font-size: 1.2rem;">health_and_safety</md-icon>
            Diagnóstico Criptográfico
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
    </div>
  );
}

const root = document.getElementById('app-profile');
if (root) {
  render(<ProfileApp />, root);
}
```

---

## Arquivo: `README.md`

````md
# 📡 Loco – Mensageiro PWA Descentralizado

## 1. Visão Geral

O Loco é um PWA (Progressive Web App) de mensagens descentralizado com interface Material Design 3, comunicação híbrida (Web Push + WebRTC) e arquitetura de armazenamento robusta offline-first. O app prioriza a privacidade, o controle granular de dados pelo usuário e a resistência à evicção automática pelo navegador.

Neste estágio, o núcleo implementa a comunicação utilizando a API **Web Push** (especificamente via FCM) como transporte. Dois ou mais navegadores trocam mensagens diretamente, sem um banco de dados central para armazenar mensagens ou gerenciar contatos.

Cada navegador atua como um **ponto autônomo**:

* **Emissor**: envia mensagens criptografadas para outro usuário.
* **Receptor**: recebe mensagens, emite recibos de entrega (handshakes) e pode responder.

A infraestrutura mínima é um **servidor proxy** (Deno) que fornece uma chave pública RSA usada para cifrar a chave privada VAPID durante a troca de perfis e reencaminha as requisições push ao serviço (FCM).

---

## 2. Regras de Desenvolvimento (Para Devs e Agentes IA)

Para manter a sanidade da base de código e garantir a performance, siga estas regras rigorosamente:

* **Runtime e Ecossistema:** Obrigatório o uso do Deno 2.x. Nunca usar Node, npm ou dependências que exijam Node nativo. O build é feito de forma customizada em `build.ts` usando `Deno.bundle()`.
* **Zero `localStorage`:** É estritamente proibido o uso de `localStorage`. Todo e qualquer dado deve passar pelo `src/utils/storage.ts` (wrapper do `idb-keyval`) ou OPFS.
* **Gerenciamento de Estado:** Os Signals devem ser importados exclusivamente de `@preact/signals`. Nunca instancie signals em nível de módulo global se eles forem exclusivos de um componente; crie-os dentro do escopo adequado.
* **Isolamento Assíncrono:** Todas as operações de leitura/escrita de dados devem ser `async/await`. Processamentos pesados (WebTorrent, I/O de arquivos, criptografia massiva) devem rodar em Web Workers (`p2p-transfer.worker.js`).
* **Comentários Táticos:** Comente apenas para explicar o "porquê" de uma decisão complexa, nunca o "o quê" o código está fazendo.
* **Degradação Graciosa (Fallback):** O sistema deve tentar conexões P2P (`RTCDataChannel`) primeiro. O Web Push atua como fallback silencioso e garantido.

---

## 3. Conceitos Fundamentais

### 3.1. Perfil (Profile)

A identidade de um usuário, armazenada no IndexedDB (`AppConfig_DB`). Pode ser compartilhada através de um **JWT** (JSON Web Token) com a claim `sub: "contact"`.

```json
{
  "iss": "email@exemplo.com",       // Identificador único do dono
  "sub": "contact",                 // Tipo de token
  "nm": "Nome do Usuário",          // Nome legível
  "kid": { ... },                   // Chave pública VAPID (ECDSA P-256) em JWK
  "p": { ... },                     // Chave pública RSA (RSA-OAEP-256) em JWK
  "s": {                            // Subscription do Web Push
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "base64...",
      "auth": "base64..."
    },
    "k": "base64..."                // Chave privada VAPID cifrada (envelope)
  },
  "iat": 1738765432                 // Timestamp de emissão
}

```

**Segurança VAPID:** O campo `k` contém a chave privada VAPID cifrada (AES-GCM + RSA-OAEP) com a chave pública do servidor proxy. Apenas o servidor pode decifrá-la para disparar o push, garantindo que ela nunca vaze em texto puro. Ao compartilhar o perfil, o sistema recria automaticamente esse envelope.

### 3.2. Contato (Contact)

Quando um usuário recebe uma mensagem ou importa um perfil via JWT, o emissor é salvo localmente. Contatos importados via JWT já recebem a flag `homologado: true`.

```typescript
interface Contato {
  publicKeyVapid: JsonWebKey;      // Chave pública VAPID (ECDSA)
  email: string;
  nome: string;
  publicKeyRSA: JsonWebKey;        // Chave pública RSA (para cifrar a resposta)
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  vapidPrivateKey: string;         // Chave privada VAPID cifrada
  homologado: boolean;             // Controle de lista branca
  createdAt: number;
  updatedAt: number;
}

```

### 3.3. Mensagens e Filas

As mensagens transitam dentro de um JWT assinado e comprimido para respeitar o limite de 4096 bytes.

* **Mensagem Recebida:** Possui `id`, `contatoPublicKeyVapid` (Hash SHA-256 da chave VAPID), `conteudo`, `status` (`'nao_lida'`, `'lida'`, `'notificada'`) e timestamp.
* **Mensagem Enviada (Fila):** Mantida offline-first com os campos `contatoHash`, `conteudo`, `status` (`'pendente'`, `'enviando'`, `'enviada'`, `'falha'`, `'entregue'`), e limite de `MAX_TENTATIVAS = 3`.

### 3.4. Handshake (Confirmação de Entrega)

O receptor de uma mensagem (`sub: "msg"`) notifica o emissor invisivelmente usando um JWT do tipo `sub: "hand"`.

```typescript
interface Handshake {
  id: string;                    // NanoID (12 caracteres)
  mensagemId: string;            // ID da mensagem confirmada
  tipo: 'confirmacao_entrega';   // Expansível para leitura, etc.
  direcao: 'out' | 'in';         // Fluxo de saída ou entrada
  status: 'pendente' | 'enviado' | 'falha' | 'entregue';
  tentativas: number;
  payload: any;
  createdAt: number;
  updatedAt: number;
}

```

---

## 4. Armazenamento: IndexedDB e OPFS

A aplicação usa uma arquitetura de dados híbrida para resistir a limitações do navegador.

### Bancos de Dados (`idb-keyval`)

| Store (`DB_NAMES`) | Chave Primária | Entidade | Descrição |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Store unificada com perfil, chaves e subscriptions. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (hex) | `Contato` | Contatos. Chave é hash para evitar erros de serialização. |
| `BrowserB_MensagensRecebidas_DB` | ID da Mensagem | `MensagemRecebida` | Histórico local de entrada. |
| `BrowserA_MensagensEnviadas_DB` | ID da Mensagem | `MensagemEnviada` | Fila local de saída. |
| `Handshake_DB` | ID do Handshake | `Handshake` | Rastreamento de confirmações e recibos. |

### Origin Private File System (OPFS) - *Em Implementação*

Destinado a arquivos binários grandes (fotos, vídeos, PDF) recebidos ou enviados via WebTorrent/WebRTC. Arquivos serão nomeados como `{messageId}.{ext}` e o usuário poderá excluí-los granularmente sem afetar o histórico de texto no IndexedDB.

---

## 5. Fluxos Detalhados (Engenharia)

**1. Geração do Perfil (`gerarProfileCompleto`)**
Solicita permissão de notificação -> Registra Service Worker -> Gera pares ECDSA (VAPID) e RSA-OAEP (E2E) -> Obtém Subscription no PushManager -> Busca chave pública do Proxy -> Cifra chave VAPID privada (Envelope) -> Salva no IndexedDB.

**2. Envio de Mensagem (`processarFilaEnvio` no SW)**
Interface salva na fila como `'pendente'` e avisa o SW -> SW acorda e filtra fila -> Monta payload e cifra com AES-GCM + RSA-OAEP -> Constrói JWT (`sub: "msg"`) -> Envia payload, subscription e envelope VAPID para `/api/proxy-push` -> Atualiza status local para `'enviada'`.

**3. Recebimento e Handshake (`processarMensagemRecebida`)**
Evento push acorda o SW -> Valida JWT e `aud` -> Decifra envelope -> Atualiza ou cria contato -> Salva mensagem recebida -> Cria registro `'pendente'` no `Handshake_DB` -> Aciona `processarFilaHandshake()` para enviar recibo ao emissor original via `/api/proxy-push` (`sub: "hand"`).

**4. Confirmação de Entrega (Recepção do Handshake)**
Evento push acorda o emissor original -> SW valida JWT (`sub: "hand"`) -> Atualiza `Handshake_DB` para `'entregue'` -> Encontra a mensagem original e altera status final para `'entregue'` -> Manda `postMessage` atualizando a UI caso o usuário esteja online.

---

## 6. Estrutura do Projeto

| Caminho / Arquivo | Responsabilidade Principal |
| --- | --- |
| `src/app.tsx` | Ponto de entrada do Preact. Roteamento de telas e actions baseadas em hash. |
| `src/service-worker.ts` | Orquestrador principal. Registra processadores e acorda filas. |
| `src/sw/push.ts` | Router do SW. Faz triagem pelo claim `sub` do JWT (`msg` ou `hand`). |
| `src/sw/sw-mensagens.ts` | Descriptografa mensagens e gerencia a fila principal de envio. |
| `src/sw/sw-handshakes.ts` | Decodifica confirmações e gerencia a fila de recibos de saída. |
| `src/utils/push-utils.ts` | Helpers pesados de criptografia híbrida (AES-GCM + RSA-OAEP). |
| `src/utils/storage.ts` | (A ser criado) Wrapper absoluto para IDB, OPFS e proteção de quota. |
| `main.ts` | Servidor Deno (Proxy Web Push). Endpoints: `/api/server-public-key` e `/api/proxy-push`. |
| `build.ts` | Ferramenta de CLI. Gera os bundles via `Deno.bundle`, injeta variáveis e atualiza HTML. |

---

## 7. Build e Execução

Use os comandos integrados definidos no `deno.json`.

**Gerar o Bundle de Produção (HTML, SW e Workers):**

```bash
deno task build

```

**Iniciar Servidor Local:**

```bash
deno task start

```

*Disponível em `http://localhost:8000`. Testes de push exigem múltiplas instâncias de navegadores diferentes.*

**Rodar Testes Unitários:**

```bash
deno task test --no-check

```

---

## 8. Roadmap & Integrações Planejadas

A aplicação está transicionando de um protótipo estrito de Web Push para um mensageiro moderno abrangente:

* **P2P First (WebRTC & WebTorrent):** Implementação de `RTCDataChannel` para envio de texto direto, deixando o push apenas para acordar o Worker. Criação do `p2p-transfer.worker.js` para tráfego pesado focado diretamente no disco virtual (OPFS).
* **Media & APIs PWA:** Implementação do leitor de QR Code (`BarcodeDetector`), Picture-in-Picture nativo para chamadas (`CallScreen.tsx`) e `Screen Wake Lock` durante uploads ativos.
* **Proteção de Evicção:** Automação de solicitações `navigator.storage.persist()` para assegurar os dados do usuário.
* **Web Share Target:** Permitir que o Loco receba conteúdos diretos do Android share sheet.
* **Backup (fflate):** Exportação completa do estado (IDB + OPFS) criptografada em um arquivo ZIP.

---

## 9. Glossário e Troubleshooting

* **Evicção:** Processo em que o SO apaga o IndexedDB para liberar espaço. Evitado usando `persist()`.
* **VAPID:** *Voluntary Application Server Identification*. Assegura ao provedor (FCM) quem está emitindo o push.
* **Rate Limiting:** Falhas `HTTP 429` ou `410` do FCM ao sobrecarregar a fila de Push. Resolvido caindo para WebRTC sempre que a aba estiver aberta.
* **"Não foi possível extrair o código do SW":** Erro do `build.ts`. Certifique-se de que não há erros de sintaxe explícitos nos arquivos importados pelo `service-worker.ts`.
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


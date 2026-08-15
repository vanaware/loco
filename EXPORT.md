> **INSTRUÇÃO PARA A IA:** 
> O texto abaixo contém múltiplos arquivos do projeto **Loco v0.2.94-msu738bx** (CÓDIGO FONTE) estruturados em blocos. 
> Cada arquivo começa com um título indicando seu caminho relativo exato (ex: `## Arquivo: src/main.ts`).
> Sempre que sugerir alterações, indique claramente qual arquivo deve ser modificado com base nesses caminhos e forneça o novo código completo do arquivo.

---

# Contexto Exportado do Projeto Loco [v0.2.94-msu738bx] - Modo: MAIN

Gerado automaticamente em: 8/15/2026, 6:50:11 AM

---

## Arquivo: `src/components/ToastSnackbar.tsx`

```tsx
// src/components/ToastSnackbar.tsx
import { toastState } from '../signals/state.ts';

export function ToastSnackbar() {
  const state = toastState.value;
  if (!state.visible) return null;

  // Cores adaptadas ao padrão MD3 com base no tipo de mensagem
  let background = 'var(--md-sys-color-inverse-surface, #2e312e)';
  let color = 'var(--md-sys-color-inverse-on-surface, #eff1ed)';
  let iconName = 'info';

  if (state.type === 'success') {
    background = 'var(--md-sys-color-primary-container, #8cf0cf)';
    color = 'var(--md-sys-color-on-primary-container, #002114)';
    iconName = 'check_circle';
  } else if (state.type === 'error') {
    background = 'var(--md-sys-color-error-container, #ffdad6)';
    color = 'var(--md-sys-color-on-error-container, #410002)';
    iconName = 'error';
  }

  return (
    <div style={`
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background-color: ${background};
      color: ${color};
      padding: 12px 20px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      font-size: 0.9rem;
      max-width: 90vw;
      width: auto;
      animation: fadeIn 0.25s cubic-bezier(0.2, 0, 0, 1);
    `}>
      <md-icon style="font-size: 1.2rem; flex-shrink: 0;">{iconName}</md-icon>
      <span style="word-break: break-word; line-height: 1.3;">{state.message}</span>
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
import { gerarId } from '../utils/id-utils.ts';
import { mensagensAtivas, hasMoreMessages, inicializarChat, carregarMaisMensagens, atualizarOuAdicionarChatAtivo } from '../stores/mensagensStore.ts';
import type { Chat } from '../constants/db.ts';

export function ChatSection() {
  const inputText = useSignal<string>('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const isScrolledUp = useSignal<boolean>(false);

  // Efeito principal: Quando o contato muda, reseta a paginação e carrega
  useEffect(() => {
    if (contatoSelecionado.value) {
      inicializarChat(contatoSelecionado.value).then(() => {
        rolarParaFim();
      });
    }

    // Escuta PostMessages do SW para atualizações em tempo real (Push recebido, Auto-Ack)
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'CHAT_ATUALIZADO' && e.data?.payload?.chatId) {
        import('../stores/mensagensStore.ts').then(m => {
           m.processarAtualizacaoDeStatusDB(e.data.payload.chatId).then(() => {
             // Só rola pra baixo automaticamente se o usuário não tiver subido a tela lendo o histórico
             if (!isScrolledUp.value) rolarParaFim();
           });
        });
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

  const rolarParaFim = (force = false) => {
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    }, force ? 10 : 100);
  };

  // Observa o scroll para disparar Lazy Loading quando chegar no topo
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLDivElement;
    
    // Se o usuário subiu a barra mais que 100px, não forçamos mais a rolagem
    isScrolledUp.value = target.scrollHeight - target.scrollTop - target.clientHeight > 100;

    // Se chegou perto do topo, carrega a página anterior (histórico antigo)
    if (target.scrollTop < 50 && hasMoreMessages.value) {
      // Guarda a altura antes de carregar para manter a barra no mesmo lugar visual
      const oldHeight = target.scrollHeight;
      carregarMaisMensagens(contatoSelecionado.value).then(() => {
        requestAnimationFrame(() => {
          if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight - oldHeight;
          }
        });
      });
    }
  };

  const handleEnviar = async () => {
    const texto = inputText.value.trim();
    const hashAtivo = contatoSelecionado.value;
    
    if (!texto || !hashAtivo) return;
    
    // Limpa a caixa de texto e gera os IDs
    inputText.value = ''; 
    const msgId = gerarId();
    const handshakeId = gerarId();
    const agora = Date.now();

    // 1. Atualização Otimista Imediata (O usuário vê a mensagem antes mesmo do SW rodar)
    const novaMensagem: Chat = {
      id: msgId,
      contatoHash: hashAtivo,
      conteudo: texto,
      tipo: 'out',
      createdAt: agora,
      handshake: handshakeId
    };
    
    await atualizarOuAdicionarChatAtivo(novaMensagem);
    rolarParaFim(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) throw new Error("Service Worker inativo");

      // 2. Delega a blindagem e o despacho para a Thread do SW
      reg.active.postMessage({
        type: 'CRIAR_HANDSHAKE_OUT',
        payload: {
          rotasModulo: 'mensagem',
          params: { function: 'enviarMensagem', contato: hashAtivo, conteudo: texto, msgId, handshakeId, createdAt: agora }
        }
      });
    } catch (err: any) {
      showToast(`❌ Erro de thread: ${err.message}`, "error");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  // Helper Inteligente Baseado em Timestamps
  const renderStatus = (msg: Chat) => {
    if (msg.tipo === 'in') return null; // Recebidas não exibem tique do nosso lado

    if (msg.errorAt) {
      return <md-icon title="Falha no envio" style="font-size: 14px; color: var(--md-sys-color-error);">error</md-icon>;
    }
    if (msg.readAt) {
      return <md-icon title="Lida" style="font-size: 14px; color: var(--md-sys-color-primary);">done_all</md-icon>;
    }
    if (msg.receivedAt) {
      return <md-icon title="Entregue ao dispositivo" style="font-size: 14px; opacity: 0.8;">done_all</md-icon>;
    }
    if (msg.sentAt) {
      return <md-icon title="Enviada ao servidor" style="font-size: 14px; opacity: 0.8;">check</md-icon>;
    }
    
    return <md-icon title="Aguardando rede..." style="font-size: 14px; opacity: 0.5;">schedule</md-icon>;
  };

  return (
    <div style="display: flex; flex-direction: column; height: 100%; flex-grow: 1; overflow: hidden;">
      
      {/* Área de rolagem das mensagens */}
      <div 
        ref={chatScrollRef}
        onScroll={handleScroll}
        style="flex-grow: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: var(--md-sys-color-surface-container-lowest);"
      >
        
        {/* Indicador de Loading para paginação */}
        {hasMoreMessages.value && mensagensAtivas.value.length > 0 && (
           <div style="text-align: center; color: #888; font-size: 0.8rem; padding: 10px;">
             Carregando histórico antigo...
           </div>
        )}

        {mensagensAtivas.value.length === 0 ? (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888; font-size: 0.9rem;">
            Nenhuma mensagem. Diga um "Olá" (criptografado)! 🔒
          </div>
        ) : (
          mensagensAtivas.value.map(msg => {
            const isMine = msg.tipo === 'out';
            return (
              <div 
                key={msg.id} 
                style={`display: flex; flex-direction: column; max-width: 85%; align-self: ${isMine ? 'flex-end' : 'flex-start'};`}
              >
                <div style={`
                  padding: 10px 14px;
                  border-radius: 16px;
                  background: ${isMine ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-variant)'};
                  color: ${isMine ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface-variant)'};
                  border-bottom-right-radius: ${isMine ? '4px' : '16px'};
                  border-bottom-left-radius: ${!isMine ? '4px' : '16px'};
                  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                  white-space: pre-wrap;
                  word-wrap: break-word;
                `}>
                  {msg.conteudo}
                </div>
                
                <div style={`display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 0.7rem; color: #888; align-self: ${isMine ? 'flex-end' : 'flex-start'};`}>
                  <span>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {renderStatus(msg)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input e Barra inferior */}
      <div style="flex-shrink: 0; padding: 12px 16px; background: var(--md-sys-color-surface); border-top: 1px solid var(--md-sys-color-outline-variant); display: flex; gap: 8px; align-items: flex-end;">
        <md-outlined-text-field
          style="flex-grow: 1; margin-bottom: 0;"
          placeholder="Escreva uma mensagem..."
          value={inputText.value}
          onInput={(e: Event) => inputText.value = (e.target as HTMLInputElement).value}
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

## Arquivo: `src/components/DebugPanel.tsx`

```tsx
// src/components/DebugPanel.tsx
import { signal, computed } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { JSX } from "preact";
import { buscarChave, salvarChave, criarStore } from "../utils/db-helpers.ts";
import { DB_NAMES } from "../constants/db.ts";

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success";
  module: string;
  message: string;
  details?: unknown;
}

const DEBUG_CONFIG_KEY = "loco_debug_enabled";
const DEBUG_LOG_PREFIX = "debug_log_";
const MAX_LOGS = 200;
const DEBUG_CHANNEL_NAME = "loco_debug_channel";

const storeConfigDB = criarStore(DB_NAMES.CONFIG);

export const isDebugEnabled = signal<boolean>(false);

buscarChave<boolean>(storeConfigDB, DEBUG_CONFIG_KEY).then((val) => {
  if (val !== undefined) {
    isDebugEnabled.value = val;
  }
});

export const debugLogs = signal<DebugLogEntry[]>(loadIndividualLogsFromStorage());

function loadIndividualLogsFromStorage(): DebugLogEntry[] {
  try {
    const logs: DebugLogEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DEBUG_LOG_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            const entry = JSON.parse(value) as DebugLogEntry;
            if (entry && entry.id) {
              logs.push(entry);
            }
          } catch {
            // Ignora itens corrompidos
          }
        }
      }
    }

    logs.sort((a, b) => b.id.localeCompare(a.id));
    return logs.slice(0, MAX_LOGS);
  } catch (e) {
    console.warn("Falha ao carregar logs individuais do localStorage:", e);
    return [];
  }
}

function persistSingleLog(entry: DebugLogEntry) {
  if (!isDebugEnabled.value) return;
  try {
    localStorage.setItem(`${DEBUG_LOG_PREFIX}${entry.id}`, JSON.stringify(entry));
    
    const currentLogs = debugLogs.value;
    if (currentLogs.length > MAX_LOGS) {
      const excesso = currentLogs.slice(MAX_LOGS);
      for (const old of excesso) {
        localStorage.removeItem(`${DEBUG_LOG_PREFIX}${old.id}`);
      }
      debugLogs.value = currentLogs.slice(0, MAX_LOGS);
    }
  } catch (e) {
    console.warn("Falha ao salvar log individual no localStorage:", e);
  }
}

export async function clearDebugLogs() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DEBUG_LOG_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
    debugLogs.value = [];
  } catch (e) {
    console.error("Erro ao limpar logs individuais do localStorage:", e);
  }
}

const debugChannel = new BroadcastChannel(DEBUG_CHANNEL_NAME);

debugChannel.onmessage = (event) => {
  if (!isDebugEnabled.value) return;

  if (event.data && event.data.type === "LOCO_DEBUG_LOG") {
    const entry: DebugLogEntry = event.data.entry;
    if (entry && entry.id) {
      const updated = [entry, ...debugLogs.value].slice(0, MAX_LOGS);
      debugLogs.value = updated;
      persistSingleLog(entry);
    }
  }
};

const filterText = signal<string>("");
const filterType = signal<string>("all");

export function DebugPanel() {
  useEffect(() => {
    salvarChave(storeConfigDB, DEBUG_CONFIG_KEY, isDebugEnabled.value).catch((err) => {
      console.warn("Falha ao salvar configuração de debug no IndexedDB:", err);
    });
  }, [isDebugEnabled.value]);

  const filteredLogs = computed(() => {
    return debugLogs.value.filter((log) => {
      const matchesText =
        filterText.value === "" ||
        log.module.toLowerCase().includes(filterText.value.toLowerCase()) ||
        log.message.toLowerCase().includes(filterText.value.toLowerCase());

      const matchesType =
        filterType.value === "all" || log.type === filterType.value;

      return matchesText && matchesType;
    });
  });

  const toggleDebug = () => {
    isDebugEnabled.value = !isDebugEnabled.value;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={styles.title}>🐞 Painel de Debug</span>
          <span style={styles.badgeCount}>{debugLogs.value.length} logs</span>
        </div>

        <div style={styles.actions}>
          <label style={styles.switchLabel}>
            <input
              type="checkbox"
              checked={isDebugEnabled.value}
              onChange={toggleDebug}
              style={styles.checkbox}
            />
            <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
              {isDebugEnabled.value ? "LIGADO" : "DESLIGADO"}
            </span>
          </label>

          <md-outlined-button
            onClick={clearDebugLogs}
            disabled={debugLogs.value.length === 0}
          >
            Limpar
          </md-outlined-button>
        </div>
      </div>

      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Filtrar por módulo ou mensagem..."
          value={filterText.value}
          onInput={(e) => (filterText.value = (e.target as HTMLInputElement).value)}
          style={styles.searchInput}
        />

        <select
          value={filterType.value}
          onChange={(e) => (filterType.value = (e.target as HTMLSelectElement).value)}
          style={styles.selectInput}
        >
          <option value="all">Todos os tipos</option>
          <option value="info">Info</option>
          <option value="warn">Avisos (Warn)</option>
          <option value="error">Erros</option>
          <option value="success">Sucesso</option>
        </select>
      </div>

      <div style={styles.logList}>
        {!isDebugEnabled.value && (
          <div style={styles.disabledNotice}>
            ⚠️ O modo Debug está <strong>DESLIGADO</strong>. O painel não está registrando novas mensagens.
          </div>
        )}

        {filteredLogs.value.length === 0 ? (
          <div style={styles.emptyState}>Nenhum log gravado.</div>
        ) : (
          filteredLogs.value.map((log) => (
            <div key={log.id} style={{ ...styles.logItem, ...getTypeStyle(log.type) }}>
              <div style={styles.logMeta}>
                <span style={styles.time}>{log.timestamp}</span>
                <span style={styles.module}>[{log.module}]</span>
                <span style={{ ...styles.typeTag, ...getTypeBadgeStyle(log.type) }}>
                  {log.type.toUpperCase()}
                </span>
              </div>
              <div style={styles.message}>{log.message}</div>
              {log.details !== undefined && (
                <details style={styles.details}>
                  <summary style={styles.summary}>Ver detalhes JSON</summary>
                  <pre style={styles.json}>{JSON.stringify(log.details, null, 2)}</pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function getTypeStyle(type: DebugLogEntry["type"]): JSX.CSSProperties {
  switch (type) {
    case "error":
      return { borderLeft: "4px solid #f44336", backgroundColor: "rgba(244, 67, 54, 0.05)" };
    case "warn":
      return { borderLeft: "4px solid #ff9800", backgroundColor: "rgba(255, 152, 0, 0.05)" };
    case "success":
      return { borderLeft: "4px solid #4caf50", backgroundColor: "rgba(76, 175, 80, 0.05)" };
    default:
      return { borderLeft: "4px solid #2196f3", backgroundColor: "rgba(33, 150, 243, 0.05)" };
  }
}

function getTypeBadgeStyle(type: DebugLogEntry["type"]): JSX.CSSProperties {
  switch (type) {
    case "error":
      return { color: "#d32f2f" };
    case "warn":
      return { color: "#ed6c02" };
    case "success":
      return { color: "#2e7d32" };
    default:
      return { color: "#0288d1" };
  }
}

const styles: Record<string, JSX.CSSProperties> = {
  container: {
    display: "flex", flexDirection: "column", gap: "12px", padding: "16px",
    backgroundColor: "var(--md-sys-color-surface-container, #f5f5f5)", borderRadius: "12px",
    border: "1px solid var(--md-sys-color-outline-variant, #e0e0e0)", fontFamily: "monospace",
    fontSize: "0.85rem", maxHeight: "600px",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" },
  titleGroup: { display: "flex", alignItems: "center", gap: "8px" },
  title: { fontSize: "1rem", fontWeight: "bold" },
  badgeCount: { fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px", backgroundColor: "var(--md-sys-color-secondary-container, #e0e0e0)" },
  actions: { display: "flex", alignItems: "center", gap: "12px" },
  switchLabel: { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none" },
  checkbox: { cursor: "pointer", width: "16px", height: "16px" },
  filterBar: { display: "flex", gap: "8px" },
  searchInput: { flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.85rem" },
  selectInput: { padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "0.85rem" },
  logList: { display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", maxHeight: "450px", paddingRight: "4px" },
  disabledNotice: { padding: "10px", backgroundColor: "#fff3cd", color: "#856404", borderRadius: "6px", fontSize: "0.8rem" },
  emptyState: { textAlign: "center", padding: "24px", color: "#888" },
  logItem: { padding: "8px 12px", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "4px" },
  logMeta: { display: "flex", gap: "8px", alignItems: "center", fontSize: "0.75rem" },
  time: { color: "#666" },
  module: { fontWeight: "bold", color: "#333" },
  typeTag: { fontWeight: "bold" },
  message: { wordBreak: "break-word", whiteSpace: "pre-wrap" },
  details: { marginTop: "4px" },
  summary: { cursor: "pointer", color: "#0066cc", fontSize: "0.75rem" },
  json: { margin: "4px 0 0 0", padding: "8px", backgroundColor: "#1e1e1e", color: "#00ff66", borderRadius: "4px", fontSize: "0.75rem", overflowX: "auto" },
};
```

---

## Arquivo: `src/components/ContatosSection.tsx`

```tsx
import { useEffect } from 'preact/hooks';
import { contatosComHash, removerContatoPorPublicKey, homologarContatoPorPublicKey } from '../stores/contatosStore.ts';
import { showToast } from '../signals/state.ts';
import { navigate } from '../utils/router.ts';

export function ContatosSection() {
  useEffect(() => {}, []);

  const abrirChat = (hash: string) => {
    navigate(`#chat=${hash}`);
  };

  const abrirDetalhesContato = (e: Event, hash: string) => {
    e.stopPropagation();
    navigate(`#detail=${hash}`);
  };

  return (
    <div class="container container-contatos" style="border-left-color: #6c4f00; margin-bottom: 24px;">
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="font-size: 1.1rem; margin: 0;">📇 Meus Contatos</h2>
        <md-icon-button onClick={() => navigate('#share')} title="Adicionar / Escanear Contato">
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

## Arquivo: `src/components/AdvancedSection.tsx`

```tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { profile } from '../stores/profileStore.ts';
import { showToast } from '../signals/state.ts';
import { solicitarArmazenamentoPersistente } from '../utils/profile-utils.ts';
import { DebugPanel } from './DebugPanel.tsx';
import { APP_VERSION } from '../constants/version.ts'; 
import { navigate } from '../utils/router.ts';
import { loadAllConfigs, CONFIG_KEYS } from '../stores/config-store.ts';

export function AdvancedSection() {
  const diagnostic = useSignal({
    identificacao: false, criptografia: false, blindagemServidor: false,
    permissoesNotificacao: false, inscricaoRegistrada: false, inscricaoValida: false,
    swAtivoEControlando: false, isOnline: navigator.onLine, isPwaInstalado: false,
    permissaoCamera: 'prompt', permissaoMicrofone: 'prompt', suporteBarcodeDetector: false,
    suporteOpfs: false, suporteWebRTC: false, suporteBackgroundSync: false,
    armazenamentoPersistido: false, cotaEspaco: { usoMB: 0, livreMB: 0 },
    proxyPath: '',
    loading: true,
  });
  
  // Listener para atualizar quando a configuração mudar
  useEffect(() => {
    const updateConfig = async () => {
      const config = await loadAllConfigs();
      diagnostic.value = { ...diagnostic.value, proxyPath: config.proxy_path || '' };
    };
    
    window.addEventListener('config-updated', updateConfig);
    updateConfig();
    
    return () => {
      window.removeEventListener('config-updated', updateConfig);
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
      proxyPath: diagnostic.value.proxyPath, // Mantém o valor atual da configuração
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
                <li style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
                  <span>🔗 <strong>Proxy Path:</strong> {diag.proxyPath || '(Raiz Relativa)'}</span>
                  <md-outlined-button onClick={() => navigate('#settings')} style="height: 32px; font-size: 0.75rem; margin-bottom: 0;">
                    <md-icon slot="icon">edit</md-icon>
                    Configurar
                  </md-outlined-button>
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
```

---

## Arquivo: `src/components/LogoutSection.tsx`

```tsx
import { useSignal } from '@preact/signals';
import { buildProxyUrl } from '../constants/config.ts';
import { navigate } from '../utils/router.ts';

export function LogoutSection() {
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
        const cookieStr = cookies[i];
        if (!cookieStr) continue;
        const parts = cookieStr.split("=");
        const part0 = parts[0];
        if (!part0) continue;
        const name = part0.trim();
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
      const proxyUrl = await buildProxyUrl('/logout');
      const resposta = await fetch(proxyUrl, { method: 'POST' });

      if (resposta.ok) {
        status.value = "✅ Logout e Destruição de Chaves Concluídos!";
        setTimeout(() => {
          window.location.reload(); 
        }, 1000);
      } else {
        throw new Error("Falha no servidor ao deslogar.");
      }
    } catch (erro: any) {
      status.value = `❌ Erro: ${erro.message}`;
      executando.value = false;
    }
  };

  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      <div class="container" style="border-left-color: var(--md-sys-color-error); text-align: center; max-width: 480px; width: 100%;">
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
            <md-outlined-button onClick={() => navigate('')} style="width: 100%;">
              Cancelar e Voltar
            </md-outlined-button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Arquivo: `src/components/ContactDetailSection.tsx`

```tsx
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import qrcode from 'qrcode-generator';

import { contatosComHash, adicionarContato } from '../stores/contatosStore.ts';
import { profile } from '../stores/profileStore.ts';
import { contatoCompartilharHash, showToast } from '../signals/state.ts';
import { gerarPayloadQrCodeCompacto, gerarLinkConviteWeb } from '../utils/share-utils.ts';
import { navigate } from '../utils/router.ts';
import { ehContatoProprio } from '../utils/self-contact-utils.ts';

export function ContactDetailSection() {
  const qrCodeDataUrl = useSignal<string | null>(null);
  const isEditing = useSignal<boolean>(false);
  const editNome = useSignal<string>('');
  const editEmail = useSignal<string>('');
  const editProxyserver = useSignal<string>('');
  const isContatoProprio = useSignal<boolean>(false);

  const hash = contatoCompartilharHash.value;
  const item = contatosComHash.value.find(c => c.hash === hash);
  const contato = item?.contato;

  useEffect(() => {
    if (!contato) {
      qrCodeDataUrl.value = null;
      isEditing.value = false;
      isContatoProprio.value = false;
      return;
    }

    editNome.value = contato.name || '';
    editEmail.value = contato.email || '';
    editProxyserver.value = contato.subscription?.proxyserver || '';

    // Verifica se é o contato próprio
    if (hash) {
      ehContatoProprio(hash, profile.value).then((ehProprio) => {
        isContatoProprio.value = ehProprio;
        
        // 🔥 Se for o próprio contato, redireciona para a tela de perfil
        if (ehProprio) {
          navigate('profile');
        }
      });
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
  }, [contato, hash]);

  if (!contato || !hash) return null;
  
  // 🔥 Previne renderização se for o contato próprio (já foi redirecionado)
  if (isContatoProprio.value) return null;

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
            responder: false
          }
        }
      });
      
      showToast("🚀 Meus dados foram enviados para o contato!", "success");
    } catch (err: any) {
      showToast(`❌ Erro ao enviar dados: ${err.message}`, "error");
    }
  };

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
        subscription: {
          ...contato.subscription,
          proxyserver: editProxyserver.value.trim()
        },
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
    editProxyserver.value = contato.subscription?.proxyserver || '';
    isEditing.value = false;
  };

  const handleIniciarChat = () => {
    navigate(`#chat=${hash}`);
  };

  const handleFechar = () => {
    navigate('');
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
              onInput={(e: Event) => editNome.value = (e.target as HTMLInputElement).value}
            ></md-outlined-text-field>

            <md-outlined-text-field
              label="E-mail do Contato"
              value={editEmail.value}
              onInput={(e: Event) => editEmail.value = (e.target as HTMLInputElement).value}
            ></md-outlined-text-field>

            <md-outlined-text-field
              label="Proxy Server (URL completa)"
              value={editProxyserver.value}
              onInput={(e: Event) => editProxyserver.value = (e.target as HTMLInputElement).value}
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

            <p style="color: #666; font-size: 0.9rem; margin-bottom: 4px;">{contato.email || 'Sem e-mail'}</p>
            <p style="color: #888; font-size: 0.8rem; margin-bottom: 20px; word-break: break-all;">
              <md-icon style="font-size: 1rem; vertical-align: middle;">dns</md-icon> Proxy: {contato.subscription?.proxyserver || 'Não informado'}
            </p>
          </>
        )}

        {!isEditing.value && (
          <>
            <div style="background: var(--md-sys-color-surface-variant); padding: 16px; border-radius: 12px; margin-bottom: 20px; text-align: left; display: flex; flex-direction: column; gap: 16px;">
              
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

              <md-outlined-button onClick={handleEnviarMeusDados} style="width: 100%;">
                <md-icon slot="icon">send_to_mobile</md-icon>
                Enviar meus dados ao contato
              </md-outlined-button>

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

## Arquivo: `src/components/SettingsSection.tsx`

```tsx
import { useSignal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { loadAllConfigs, saveConfig, resetConfig } from '../stores/config-store.ts';
import { showToast } from '../signals/state.ts';
import { navigate } from '../utils/router.ts';
import { buildProxyUrl, pingProxy } from '../constants/config.ts';

export function SettingsSection() {
  const proxyPath = useSignal('');
  const isSaving = useSignal(false);
  const isTesting = useSignal(false);
  const hasChanges = useSignal(false);
  const serverStatus = useSignal<'unknown' | 'ok' | 'error'>('unknown');
  const previewUrls = useSignal({ endpoint: '', publicKey: '', logout: '' });
  
  useEffect(() => {
    const load = async () => {
      const config = await loadAllConfigs();
      proxyPath.value = config.proxy_path || '';
      await updatePreview(config.proxy_path || '');
    };
    load();
  }, []);
  
  const updatePreview = async (path: string) => {
    previewUrls.value = {
      endpoint: await buildProxyUrl('/', path),
      publicKey: await buildProxyUrl('/publickey', path),
      logout: await buildProxyUrl('/logout', path)
    };
    serverStatus.value = 'unknown'; // reseta status visual ao digitar
  };

  const handleProxyPathChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    proxyPath.value = target.value;
    hasChanges.value = true;
    updatePreview(target.value);
  };
  
  const handleTestarConexao = async () => {
    isTesting.value = true;
    const path = proxyPath.value.trim() === '' ? '/' : proxyPath.value.trim();
    
    try {
      const isAlive = await pingProxy(path);
      if (isAlive) {
        serverStatus.value = 'ok';
        showToast('✅ Servidor detectado com sucesso!', 'success');
      } else {
        serverStatus.value = 'error';
        showToast('❌ Servidor não respondeu ou não é um Loco Proxy.', 'error');
      }
    } catch {
      serverStatus.value = 'error';
      showToast('❌ Falha na conexão de rede.', 'error');
    } finally {
      isTesting.value = false;
    }
  };

  const handleSalvar = async () => {
    const path = proxyPath.value.trim() === '' ? '/' : proxyPath.value.trim();
    isSaving.value = true;
    
    try {
      // Opcional: Impedir salvar se o ping falhar, mas vamos ser permissivos
      // e só avisar, vai que o usuário está offline na hora.
      await saveConfig('PROXY_PATH', path);
      showToast(`✅ Configuração salva: ${path}`, 'success');
      hasChanges.value = false;
      window.dispatchEvent(new CustomEvent('config-updated'));
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      showToast('❌ Erro ao salvar configuração. Verifique o console.', 'error');
    } finally {
      isSaving.value = false;
    }
  };
  
  const handleReset = async () => {
    if (!confirm('Tem certeza que deseja resetar todas as configurações para o padrão?')) {
      return;
    }
    try {
      await resetConfig();
      const config = await loadAllConfigs(); // engatilha auto-discovery
      proxyPath.value = config.proxy_path || '/';
      hasChanges.value = false;
      serverStatus.value = 'unknown';
      showToast('✅ Auto-Discovery resetado', 'success');
      window.dispatchEvent(new CustomEvent('config-updated'));
    } catch (error) {
      showToast('❌ Erro ao resetar', 'error');
    }
  };
  
  const handleCancelar = () => {
    loadAllConfigs().then(config => {
      proxyPath.value = config.proxy_path || '';
      hasChanges.value = false;
      serverStatus.value = 'unknown';
      showToast('Alterações descartadas', 'info');
    });
  };
  
  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 600px; width: 100%;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 1rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <md-icon>settings</md-icon> Configurações de Rede
            </span>
            <span style="font-size: 0.75rem; color: #888; margin-left: 30px;">
              Ajuste o Roteamento de Mensagens
            </span>
          </div>
          <md-icon-button onClick={() => navigate('')} title="Fechar Configurações">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="proxy-path" style="font-size: 0.9rem; font-weight: 600; color: var(--md-sys-color-on-surface); display: flex; justify-content: space-between; align-items: center;">
              Servidor Proxy
              {serverStatus.value === 'ok' && <span style="color: green; font-size: 0.75rem; font-weight: bold;">(Online)</span>}
              {serverStatus.value === 'error' && <span style="color: red; font-size: 0.75rem; font-weight: bold;">(Offline)</span>}
            </label>
            <div style="display: flex; gap: 8px;">
              <md-outlined-text-field
                id="proxy-path"
                value={proxyPath.value}
                onInput={handleProxyPathChange}
                placeholder="Ex: /, /api ou https://push.com"
                style="flex-grow: 1;"
                disabled={isSaving.value || isTesting.value}
              >
                <md-icon slot="leading-icon">dns</md-icon>
              </md-outlined-text-field>
              
              <md-filled-tonal-button onClick={handleTestarConexao} disabled={isTesting.value || isSaving.value} style="height: 56px;">
                 {isTesting.value ? '...' : 'Testar'}
              </md-filled-tonal-button>
            </div>
            <span style="font-size: 0.75rem; color: #666;">
              Se o PWA foi instalado via GitHub Pages ou IPFS e não possui um servidor nativo, informe a URL absoluta de um Worker ativo do Loco.
            </span>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--md-sys-color-secondary);">
              🔍 Resolução Dinâmica (Preview):
            </span>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem;">
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 80px;">Push URL:</span>
                <code style="color: #444;">{previewUrls.value.endpoint}</code>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 80px;">Ping Test:</span>
                <code style="color: #444;">{previewUrls.value.endpoint}/ping</code>
              </div>
            </div>
          </div>
          
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
            <md-outlined-button onClick={handleCancelar} disabled={!hasChanges.value || isSaving.value || isTesting.value}>
              Cancelar
            </md-outlined-button>
            
            <md-outlined-button onClick={handleReset} disabled={isSaving.value || isTesting.value} style="color: var(--md-sys-color-error);">
              Auto-Discovery
            </md-outlined-button>
            
            <md-filled-button onClick={handleSalvar} disabled={!hasChanges.value || isSaving.value || isTesting.value}>
              {isSaving.value ? (
                <md-circular-progress indeterminate style="width: 20px; height: 20px;"></md-circular-progress>
              ) : (
                <>
                  <md-icon slot="icon">save</md-icon>
                  Salvar
                </>
              )}
            </md-filled-button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
```

---

## Arquivo: `src/components/ProfileSection.tsx`

```tsx
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
  const isEditing = useSignal<boolean>(false); // 🔥 Novo estado de edição

  useEffect(() => {
    carregarProfile();
  }, []);

  const p = profile.value;
  const temChaveVapid = !!(p?.vapidPublicKey && p?.vapidPrivateKeyJwk);

  // 🔥 ARQUITETURA: Máquina de estado inicial
  // Se não tem chave gerada, o usuário está no Onboarding. Forçamos o modo de edição.
  useEffect(() => {
    if (!temChaveVapid) {
      isEditing.value = true;
    } else {
      isEditing.value = false;
    }
  }, [temChaveVapid]);

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
      
      isEditing.value = false; // Sai do modo de edição após salvar com sucesso

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
      // Reverte os valores dos inputs para os dados consolidados no banco
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
        
        {/* 🔥 Cabeçalho com Ícone de Edição */}
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

        <md-icon style="font-size: 64px; color: var(--md-sys-color-primary); margin-bottom: 8px;">account_circle</md-icon>

        {isEditing.value ? (
          <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 10px; text-align: left;">
            
            {!temChaveVapid && (
               <p style="font-size: 0.85rem; color: #666; margin-bottom: 8px; text-align: center;">
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
            {/* 🔥 Visão de Leitura (Read-Only) */}
            <h2 style="justify-content: center; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              {p?.name?.trim() || "Anônimo"}
            </h2>
            <p style="color: #666; font-size: 0.9rem; margin-bottom: 24px;">{p?.email || 'Sem e-mail'}</p>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <md-outlined-button onClick={handleCompartilhar} style="width: 100%;">
                <md-icon slot="icon">share</md-icon>
                Compartilhar Link de Convite
              </md-outlined-button>
            </div>
          </>
        )}
      </div>

      {/* 🔥 O QR Code some durante a edição para manter a tela focada */}
      {qrCodeDataUrl.value && temChaveVapid && !isEditing.value && (
        <div class="container" style="background: #fff; max-width: 480px; width: 100%; border-left-color: var(--md-sys-color-primary); text-align: center;">
          <h3 style="font-size: 1rem; margin-top: 0; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <md-icon style="font-size: 1.2rem;">qr_code_2</md-icon>
            Seu QR Code
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
```

---

## Arquivo: `src/components/ShareSection.tsx`

```tsx
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
              <p style="margin: 0; color: #666; font-size: 0.85rem; margin-bottom: 8px;">{preview.value.email || "Sem e-mail"}</p>
              
              {/* 🔥 ARQUITETURA: Exibição do Proxy de destino para o qual o app enviará os handshakes */}
              <div style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; max-width: 100%;">
                <md-icon style="font-size: 1rem; color: #888;">dns</md-icon> 
                <span style="font-size: 0.75rem; color: #666; word-break: break-all; text-align: left; line-height: 1.2;">
                  <strong>Rota de Proxy:</strong><br/>
                  {preview.value.subscription?.proxyserver || 'Padrão (Não informado)'}
                </span>
              </div>
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
```

---

## Arquivo: `src/constants/db.ts`

```ts
// src/constants/db.ts

export const DB_NAMES = {
  CONFIG: "AppConfig_DB",
  CHAT: "Chat_DB", // 🔥 Unificou MensagensEnviadas e MensagensRecebidas
  CONTATOS: "BrowserB_Contatos_DB",
  HANDSHAKES: "Handshake_DB",
} as const;

export const STORE_NAMES = {
  KEYVAL: "keyval",
} as const;

export const KEY_NAMES = {
  PROFILE: "profile",
  CONTATO: "contato_",
  CHAT_INDEX: "chat_index_", // 🔥 Novo prefixo para guardar os arrays de paginação
} as const;

export const MAX_TENTATIVAS = 3;
export const MAX_PAYLOAD_SIZE = 4096;

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
    proxyserver?: string;
  };
  createdAt: number;
  updatedAt: number;
}

// 🔥 Nova Estrutura Unificada e Baseada em Timestamps
export interface Chat {
  id: string;
  contatoHash: string;
  conteudo: string;
  tipo: 'in' | 'out';
  readAt?: number;
  notifiedAt?: number;
  receivedAt?: number;
  sentAt?: number;
  createdAt: number;
  updatedAt?: number;
  errorAt?: number;
  handshake: string;
}

export type MeStatus = 'trusted' | 'none' | 'wrong' | 'saved';

export interface Contato {
  id: string; 
  email: string;
  name: string;
  vapidPublicKey: JsonWebKey;
  e2ePublicKey: JsonWebKey;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    proxyserver?: string;
  };
  vapidPrivateKeyEnvelope: string;
  trusted: boolean;
  me: MeStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ProfileRouteData {
  campos?: string[];
  data?: Record<string, unknown>;
  id?: string;
}

export interface MensagemRouteData {
  recebida?: string;
  enviada?: string;
  conteudo?: string;
  campos?: string[];
  data?: Record<string, unknown>;
}

export interface ContatoRouteData {
  id?: string;
  campos?: string[];
  data?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}

export interface HandshakeRotas { 
  profile?: ProfileRouteData; 
  mensagem?: MensagemRouteData; 
  contato?: ContatoRouteData; 
  [key: string]: unknown;
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
  aud: string; 
  in?: FluxoIn; 
  out?: FluxoOut; 
  createdAt: number; 
  updatedAt: number; 
}

export interface EnvelopeCifrado {
  i: string;
  d: string;
  k: string;
}
```

---

## Arquivo: `src/constants/config.ts`

```ts
// src/constants/config.ts
import { get as idbGet, set as idbSet, createStore } from "idb-keyval";
import { DB_NAMES } from "./db.ts";

/**
 * 🔥 O Padrão agora é "/" (Raiz Relativa do PWA).
 */
export const DefaultProxyPath: string = "/";

/**
 * 🔥 O Fallback Absoluto (Workers Seguro).
 */
export const FallbackAbsoluteProxy: string = "https://loco.arvati.workers.dev";

const PROXY_PATH_KEY = 'ProxyPath';

let _configStore: ReturnType<typeof createStore> | null = null;

function getConfigStore() {
  if (_configStore === null && typeof indexedDB !== 'undefined') {
    _configStore = createStore(DB_NAMES.CONFIG, 'keyval');
  }
  return _configStore;
}

async function loadProxyPathFromDB(): Promise<string> {
  const configStore = getConfigStore();
  if (!configStore) return DefaultProxyPath;
  
  try {
    const stored = await idbGet<any>(PROXY_PATH_KEY, configStore);
    if (stored !== undefined && stored !== null) {
      return String(stored);
    }
    return DefaultProxyPath;
  } catch (error) {
    console.warn('[CONFIG] Erro ao carregar ProxyPath do IndexedDB:', error);
    return DefaultProxyPath;
  }
}

export async function getProxyPath(): Promise<string> {
  return await loadProxyPathFromDB();
}

export async function setProxyPath(path: string): Promise<void> {
  const configStore = getConfigStore();
  if (!configStore) return;
  try {
    await idbSet(PROXY_PATH_KEY, path, configStore);
    console.log('[CONFIG] ProxyPath atualizado no IndexedDB:', path);
  } catch (error) {
    console.error('[CONFIG] Erro ao salvar ProxyPath no IndexedDB:', error);
    throw error;
  }
}

/**
 * Resolve o BasePath nativo (ex: "/" ou "/loco/")
 */
function getAppBasePath(): string {
  if (typeof globalThis === 'undefined' || !globalThis.location) return '/';
  let basePath = globalThis.location.pathname;
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    basePath += '/';
  }
  return basePath;
}

/**
 * Constrói uma URL completa de API com inteligência de rotas relativas vs absolutas.
 */
export async function buildProxyUrl(endpoint: string, specificProxy?: string): Promise<string> {
  let proxyPath = specificProxy !== undefined ? specificProxy : await getProxyPath();
  
  // Normalização de input: se o usuário deixou vazio, tratamos como "/"
  if (!proxyPath || proxyPath.trim() === '') proxyPath = "/";

  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  let base = "";

  // Cenário 1: É uma URL Absoluta Externa (https://...)
  if (proxyPath.startsWith('http://') || proxyPath.startsWith('https://')) {
    base = proxyPath;
  } 
  // Cenário 2: Caminho Relativo local (ex: "/", "/api", "./api")
  else {
    const origin = typeof globalThis !== 'undefined' && globalThis.location 
      ? globalThis.location.origin 
      : 'http://localhost';
    
    const appBase = getAppBasePath(); // Ex: "/" ou "/loco/"
    
    // Removemos possíveis "/", "./" ou "../" do começo do proxyPath do usuário
    const cleanProxyPath = proxyPath.replace(/^(\.\/|\.\.\/|\/+)/, '');
    
    base = origin + appBase + cleanProxyPath;
  }

  base = base.replace(/\/$/, ''); // Tira barra do final da base
  return `${base}/${cleanEndpoint}`;
}

/**
 * Dispara um Heartbeat para testar a validade da URL
 */
export async function pingProxy(proxyUrlToCheck: string): Promise<boolean> {
  try {
    const url = await buildProxyUrl('/ping', proxyUrlToCheck);
    
    // Configura um timeout de 3 segundos para não travar a aplicação
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(url, { 
      method: 'POST', // 🔥 ARQUITETURA: POST para furar o cache do navegador e Edge Nodes
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (!res.ok) return false;
    
    const data = await res.json();
    return data && data.status === "ok" && data.service === "loco-proxy";
  } catch (err) {
    return false;
  }
}
```

---

## Arquivo: `src/constants/version.ts`

```ts
// Arquivo gerado automaticamente pelo build.ts
export const APP_VERSION = "0.2.94-msu738bx";

```

---

## Arquivo: `src/signals/state.ts`

```ts
import { signal } from '@preact/signals';
import { addDebugLog as emitLog } from '../utils/debug-utils.ts';

export const currentMobileView = signal<'list' | 'chat' | 'profile'>('list');

export const contatoSelecionado = signal<string>('');
export const contatoCompartilharHash = signal<string | null>(null); 
export const showAdvanced = signal<boolean>(false);
export const mensagemEnvio = signal<string>('');

// 🔥 Novo Signal para carregar dados de convite da URL
export const sharePayload = signal<string | null>(null);

export const profileInput = signal<string>('');
export const profileName = signal<string>('');
export const profileEmail = signal<string>('');

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

export const toastState = signal<ToastState>({
  message: '',
  type: 'info',
  visible: false,
});

let toastTimer: number | null = null;

export function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastState.value = {
    message: msg,
    type,
    visible: true,
  };

  toastTimer = setTimeout(() => {
    toastState.value = { ...toastState.value, visible: false };
  }, 3500) as unknown as number;
}

export function addDebugLog(
  typeOrMsg: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  emitLog(typeOrMsg, moduleOrDetails, message, details);
}

export function clearDebugLogs(): void {}
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

## Arquivo: `src/stores/profileStore.ts`

```ts
// src/stores/profileStore.ts
import { signal } from '@preact/signals';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { profileName, profileEmail, addDebugLog } from '../signals/state.ts';

// Mutex simples para evitar condições de corrida ao salvar o perfil ativamente
let isSavingProfile = false;

export const profile = signal<ProfileConfig | null>(null);

export async function carregarProfile() {
  try {
    const p = await buscarProfile();
    profile.value = p || null;
    
    // 🔥 Preenche a UI passivamente com os dados salvos no banco de dados
    if (p) {
      profileName.value = p.name;
      profileEmail.value = p.email;
    }
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha ao carregar perfil do DB", error);
  }
}

/**
 * Atualiza o Profile localmente de forma síncrona e engatilha o DB assíncrono.
 * Implementa um mutex (isSavingProfile) caso multiplas chamadas tentem
 * gravar coisas simultâneas.
 */
export async function atualizarProfile(p: ProfileConfig) {
  // 1. Atualização Otimista na Memória
  profile.value = { ...p };
  profileName.value = p.name;
  profileEmail.value = p.email;
  
  if (isSavingProfile) {
      addDebugLog("warn", "STORE:PROFILE", "Salvamento de perfil enfileirado/ignorado por concorrência.");
      return; // Previne gravações corrompidas e cruzadas
  }

  // 2. Persistência Isolada com Trava
  isSavingProfile = true;
  try {
    await salvarProfile(p);
  } catch (error) {
    addDebugLog("error", "STORE:PROFILE", "Falha catastrófica ao persistir perfil no DB.", error);
    // Em um app real pesado, faríamos um rollback aqui recarregando do DB: await carregarProfile()
  } finally {
    isSavingProfile = false;
  }
}

export async function initProfileStore() {
  await carregarProfile();
}
```

---

## Arquivo: `src/stores/mensagensStore.ts`

```ts
// src/stores/mensagensStore.ts
import { signal } from '@preact/signals';
import { listarChatPaginado, salvarChat, buscarChat } from '../utils/db-helpers.ts';
import type { Chat } from '../constants/db.ts';
import { contatoSelecionado } from '../signals/state.ts';

// O Cache ativo de mensagens na RAM
export const mensagensAtivas = signal<Chat[]>([]);
export const hasMoreMessages = signal<boolean>(true);

const PAGE_SIZE = 30;
let currentOffset = 0;
let isFetching = false;
let activeChatHash: string | null = null; // 🔥 Trava de segurança contra Race Condition

/**
 * Reseta e carrega a primeira página de mensagens do contato selecionado.
 */
export async function inicializarChat(contatoHash: string) {
  activeChatHash = contatoHash; // Define o chat atual ativo
  currentOffset = 0;
  hasMoreMessages.value = true;
  mensagensAtivas.value = [];
  await carregarMaisMensagens(contatoHash);
}

/**
 * Lazy Loader: Busca a próxima fatia do IndexedDB e empurra para a RAM.
 */
export async function carregarMaisMensagens(contatoHash: string) {
  // 🔥 Impede fetch se já estiver buscando, se acabaram as msgs ou se o usuário trocou de chat no meio do await
  if (isFetching || !hasMoreMessages.value || contatoHash !== activeChatHash) return;
  isFetching = true;

  try {
    const novas = await listarChatPaginado(contatoHash, PAGE_SIZE, currentOffset);
    
    // Validação pós-await: se o usuário mudou de chat enquanto o disco respondia, descarta o resultado obsoleto
    if (contatoHash !== activeChatHash) return;
    
    if (novas.length < PAGE_SIZE) {
      hasMoreMessages.value = false;
    }

    if (novas.length > 0) {
      currentOffset += novas.length;
      
      // Como estamos carregando de trás pra frente (paginação reversa), 
      // adicionamos as antigas no início do array
      mensagensAtivas.value = [...novas, ...mensagensAtivas.value].sort((a, b) => a.createdAt - b.createdAt);
    }
  } finally {
    isFetching = false;
  }
}

/**
 * Atualização Otimista O(1): Insere/Atualiza diretamente na memória sem engasgar o app
 */
export async function atualizarOuAdicionarChatAtivo(chat: Chat) {
  // 1. Atualiza memória (se o chat pertencer estritamente à tela atual)
  if (chat.contatoHash === contatoSelecionado.value && chat.contatoHash === activeChatHash) {
    const atual = mensagensAtivas.value;
    const index = atual.findIndex(m => m.id === chat.id);
    
    if (index !== -1) {
      const nova = [...atual];
      nova[index] = chat;
      mensagensAtivas.value = nova;
    } else {
      // É nova, empurra pro final da fila e soma no offset
      mensagensAtivas.value = [...atual, chat];
      currentOffset += 1;
    }
  }

  // 2. Persiste assincronamente no DB
  await salvarChat(chat);
}

/**
 * Helper chamado pelos Handshakes no SW (via Broadcast/PostMessage)
 */
export async function processarAtualizacaoDeStatusDB(chatId: string) {
  // Busca a versão consolidada que o SW acabou de gravar no DB
  const chatAtualizado = await buscarChat(chatId);
  if (chatAtualizado) {
    await atualizarOuAdicionarChatAtivo(chatAtualizado);
  }
}

export async function initMensagensStore() {
  // A inicialização inicial agora é vazia, pois carregamos sob demanda na UI
}
```

---

## Arquivo: `src/stores/contatosStore.ts`

```ts
// src/stores/contatosStore.ts
import { signal, computed } from "@preact/signals";
import {
  listarContatos,
  salvarContato,
  removerContato,
  serializarPublicKeyVapid,
  buscarProfile,
} from "../utils/db-helpers.ts";
import type { Contato } from "../constants/db.ts";
import { addDebugLog } from "../utils/debug-utils.ts";
import { gerarContatoProprio } from "../utils/self-contact-utils.ts";

export type { Contato };

export const contatosRaw = signal<Contato[]>([]);

export const contatosComHash = computed(() => {
  return contatosRaw.value.map((contato) => ({
    contato,
    hash: contato.id,
  }));
});

export const contatosMap = computed(() => {
  const map = new Map<string, Contato>();
  for (const c of contatosRaw.value) {
    map.set(c.id, c);
  }
  return map;
});

export async function carregarContatos(): Promise<void> {
  try {
    const lista = await listarContatos();
    
    // 🔥 Carrega o contato próprio (baseado no profile) e adiciona à lista
    const profile = await buscarProfile();
    if (profile) {
      const contatoProprio = await gerarContatoProprio(profile);
      if (contatoProprio) {
        // Verifica se já existe na lista para não duplicar
        const indexExistente = lista.findIndex(c => c.id === contatoProprio.id);
        if (indexExistente >= 0) {
          // Atualiza o existente com os dados mais recentes do profile
          lista[indexExistente] = contatoProprio;
        } else {
          // Adiciona o contato próprio à lista
          lista.push(contatoProprio);
        }
      }
    }
    
    contatosRaw.value = lista;
    addDebugLog("info", "STORE:CONTATO", `Carregados ${lista.length} contatos (incluindo próprio) do banco local`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao carregar contatos do IndexedDB", err);
  }
}

let isContatosListenerInitialized = false;

export async function initContatosStore(): Promise<void> {
  await carregarContatos();

  if (!isContatosListenerInitialized && 'serviceWorker' in navigator) {
    isContatosListenerInitialized = true;
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'CONTATO_ATUALIZADO') {
        carregarContatos();
      }
    });
  }
}

export async function adicionarContato(contato: Contato): Promise<void> {
  try {
    const atual = contatosRaw.value;
    const index = atual.findIndex(c => c.id === contato.id);
    if (index >= 0) {
      const novaLista = [...atual];
      novaLista[index] = contato;
      contatosRaw.value = novaLista;
    } else {
      contatosRaw.value = [...atual, contato];
    }

    await salvarContato(contato);
    addDebugLog("success", "STORE:CONTATO", `Contato salvo em disco: ${contato.name}`);
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", `Erro ao persistir contato ${contato.id}`, err);
    throw err;
  }
}

export function adicionarOuAtualizarContato(contato: Contato): void {
  adicionarContato(contato).catch((err) => {
    addDebugLog("error", "STORE:CONTATO", "Falha assíncrona ao adicionar/atualizar contato", err);
  });
}

export async function removerContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    
    contatosRaw.value = contatosRaw.value.filter(c => c.id !== hash);
    
    await removerContato(vapidPublicKey);
    addDebugLog("warn", "STORE:CONTATO", "Contato removido por chave pública");
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao remover contato por chave pública", err);
  }
}

export async function homologarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<void> {
  try {
    const hash = await serializarPublicKeyVapid(vapidPublicKey);
    const atual = contatosRaw.value;
    const index = atual.findIndex(c => c.id === hash);
    
    if (index >= 0 && atual[index]) {
      const contatoAtual = atual[index];
      const contatoModificado: Contato = { ...contatoAtual, trusted: true, updatedAt: Date.now() };
      const novaLista = [...atual];
      novaLista[index] = contatoModificado;
      contatosRaw.value = novaLista;
      
      await salvarContato(contatoModificado);
      addDebugLog("success", "STORE:CONTATO", `Contato homologado como confiável: ${contatoModificado.name}`);
    } else {
      addDebugLog("warn", "STORE:CONTATO", "Contato não encontrado em memória para homologação");
    }
  } catch (err) {
    addDebugLog("error", "STORE:CONTATO", "Erro ao homologar contato", err);
  }
}

export function atualizarStatusVerificacaoContato(id: string, meStatus: Contato["me"]): void {
  const atual = contatosRaw.value;
  const index = atual.findIndex(c => c.id === id);
  if (index >= 0 && atual[index]) {
    const contatoAtual = atual[index];
    const contatoModificado: Contato = { ...contatoAtual, me: meStatus, updatedAt: Date.now() };
    const novaLista = [...atual];
    novaLista[index] = contatoModificado;
    contatosRaw.value = novaLista;
    
    salvarContato(contatoModificado).catch(err => {
        addDebugLog("error", "STORE:CONTATO", `Erro em background ao atualizar status do contato ${id}`, err);
    });
  } else {
    addDebugLog("error", "STORE:CONTATO", `Contato ${id} não encontrado na memória para atualizar status`);
  }
}
```

---

## Arquivo: `src/stores/config-store.ts`

```ts
// src/stores/config-store.ts
import { get, set, del, createStore } from "idb-keyval";
import { DB_NAMES } from "../constants/db.ts";
import { setProxyPath, DefaultProxyPath, FallbackAbsoluteProxy, pingProxy } from "../constants/config.ts";

const CONFIG_STORE_NAME = DB_NAMES.CONFIG;
const configStore = createStore(CONFIG_STORE_NAME, 'keyval');

export const CONFIG_KEYS = {
  PROXY_PATH: "ProxyPath",
  SERVER_PUBLIC_KEY: "ServerPublicKey", // 🔥 ARQUITETURA: Nova chave para cache
} as const;

export async function saveConfig<K extends keyof typeof CONFIG_KEYS>(key: K, value: string): Promise<void> {
  try {
    const configKey = CONFIG_KEYS[key];
    await set(configKey, value, configStore);
    
    // 🔥 ARQUITETURA: Invalidação de Cache Atrelada
    // Se o Proxy mudar, a chave pública do servidor antigo torna-se letal para a criptografia.
    // Nós a apagamos imediatamente para forçar um novo download seguro na próxima operação.
    if (key === 'PROXY_PATH' && typeof value === 'string') {
      await setProxyPath(value);
      await del(CONFIG_KEYS.SERVER_PUBLIC_KEY, configStore);
      console.log("[CONFIG-STORE] 🧹 Chave pública do servidor invalidada devido à troca de proxy.");
    }
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao salvar configuração:", error);
    throw error;
  }
}

export async function getConfigValue<K extends keyof typeof CONFIG_KEYS>(key: K): Promise<string | undefined> {
  try {
    const configKey = CONFIG_KEYS[key];
    const value = await get<string>(configKey, configStore);
    return value !== undefined && value !== null ? value : undefined;
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao carregar configuração:", error);
    return undefined;
  }
}

export async function resetConfig(): Promise<void> {
  try {
    await del(CONFIG_KEYS.PROXY_PATH, configStore);
    await del(CONFIG_KEYS.SERVER_PUBLIC_KEY, configStore); // Expurgamos a chave no reset também
    await setProxyPath(DefaultProxyPath); 
  } catch (error) {
    console.error("[CONFIG-STORE] Erro ao resetar configurações:", error);
    throw error;
  }
}

/**
 * Carrega as configurações. 
 * Executa o Auto-Discovery de Rede apenas se for a primeira inicialização.
 */
export async function loadAllConfigs(): Promise<{ proxy_path?: string }> {
  const proxy_path = await getConfigValue('PROXY_PATH');
  
  if (proxy_path !== undefined) {
    await setProxyPath(proxy_path);
    return { proxy_path };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn(`[AUTO-DISCOVERY] 🔌 Offline no primeiro acesso. Assumindo Cloudflare Worker nativo.`);
    await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
    return { proxy_path: FallbackAbsoluteProxy };
  }

  console.log(`[AUTO-DISCOVERY] Primeira inicialização detectada. Avaliando ambiente...`);
  
  const isLocalAlive = await pingProxy(DefaultProxyPath);

  if (isLocalAlive) {
    console.log(`[AUTO-DISCOVERY] ✅ Servidor nativo da hospedagem respondeu! Mantendo rota relativa.`);
    await saveConfig('PROXY_PATH', DefaultProxyPath);
    return { proxy_path: DefaultProxyPath };
  }

  console.log(`[AUTO-DISCOVERY] ⚠️ Servidor nativo indisponível ou estático (Ex: GitHub Pages). Iniciando Fallback...`);

  const isFallbackAlive = await pingProxy(FallbackAbsoluteProxy);
  
  if (isFallbackAlive) {
    console.log(`[AUTO-DISCOVERY] 🛡️ Fallback ativado com sucesso. Conectado ao nó Edge!`);
    await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
    return { proxy_path: FallbackAbsoluteProxy };
  }

  console.warn(`[AUTO-DISCOVERY] ❌ Nenhum servidor Proxy respondeu. Definindo Rota Padrão Segura.`);
  await saveConfig('PROXY_PATH', FallbackAbsoluteProxy);
  return { proxy_path: FallbackAbsoluteProxy };
}
```

---

## Arquivo: `src/sw/push.ts`

```ts
// src/sw/push.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { verificarJWT } from "../utils/jwt-helpers.ts";
import { processarHandshakeRecebido } from "./sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

addDebugLog("[SW-PUSH-ROUTER] 🔀 Event Listener de Push engatilhado.");

self.addEventListener('push', function (event) {
  if (!event.data) return;
  const rawText = event.data.text();
  addDebugLog(`[SW-PUSH-ROUTER] 📩 WebPush físico recebido! (Tamanho: ${rawText.length} bytes)`);

  if (rawText.split('.').length !== 3) {
    event.waitUntil(
      self.registration.showNotification("Notificação", { body: "Dados crus capturados." })
    );
    return;
  }

  // Envolve todo o fluxo de processamento assíncrono para garantir que o SW permaneça vivo
  event.waitUntil(
    (async function () {
      try {
        const { header, payload, valid } = await verificarJWT(rawText);
        
        if (!valid) {
          addDebugLog("[SW-PUSH-ROUTER] ⚠️ Assinatura de pacote rejeitada.");
          await self.registration.showNotification("⚠️ Assinatura inválida", {
            body: `Mensagem rejeitada por falha de integridade.`,
            icon: '/icon-192.png',
          });
          return;
        }

        // Redireciona o payload fechado de Handshake para nossa Máquina de Estados
        if (payload.sub === "hand") {
          await processarHandshakeRecebido(payload, header, rawText);
          return;
        }

        addDebugLog(`[SW-PUSH-ROUTER] ⚠️ JWT legado recebido e ignorado: ${payload.sub}`);
      } catch (err: any) {
        addDebugLog(`[SW-PUSH-ROUTER] ❌ Falha crítica no desempacotamento de Push: ${err.message}`);
        await self.registration.showNotification("⚠️ Erro de Rede", {
          body: "Falha criptográfica no processamento de uma mensagem recebida.",
          icon: '/icon-192.png',
        });
      }
    })()
  );
});
```

---

## Arquivo: `src/sw/cache.ts`

```ts
// src/sw/cache.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __GENERATED_ASSETS__: string[];

const CACHE_VERSION = "VERSION_HASH";
const CACHE_NAME = `loco-proto-cache-${CACHE_VERSION}`;

const ASSETS_TO_CACHE: string[] = __GENERATED_ASSETS__;

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

self.addEventListener("fetch", (event: any) => {
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
// src/sw/click.ts

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('notificationclick', function(event: any) {
  console.log("[SW-CLICK] 🔗 ===== CLIQUE NA NOTIFICAÇÃO DETECTADO =====");
  event.notification.close();
  
  // 🔥 ARQUITETURA: Usa o escopo do Service Worker registrado em vez de '/' hardcoded.
  // Isso garante que o clique na notificação abra o app no diretório correto (ex: Github Pages).
  const urlParaAbrir = new URL(self.registration.scope).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client && client.url === urlParaAbrir && 'focus' in client) {
            try {
              return client.focus();
            } catch (err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível focar a janela:", err.message);
              break;
            }
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlParaAbrir)
            .catch(function(err: any) {
              console.warn("[SW-CLICK] ⚠️ Não foi possível abrir janela:", err.message);
              return Promise.resolve();
            });
        }
      })
  );
});
```

---

## Arquivo: `src/sw/sw-utils.ts`

```ts
// src/sw/sw-utils.ts
import { addDebugLog } from '../utils/debug-utils.ts';

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration> {
  addDebugLog("📡 Verificando suporte ao Service Worker...");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker não é suportado neste navegador.");
  }

  // 🔥 ARQUITETURA: Resolução Dinâmica de Rota Base (Environment Agnostic)
  // Lemos a URL atual para descobrir se estamos rodando na raiz (/) ou em um subdiretório (/loco/)
  let basePath = globalThis.location.pathname;
  
  // Se a URL aponta para um arquivo (ex: /loco/index.html), extraímos apenas o diretório
  if (basePath.split('/').pop()?.includes('.')) {
    basePath = basePath.substring(0, basePath.lastIndexOf('/') + 1);
  } else if (!basePath.endsWith('/')) {
    // Se a URL é /loco (sem barra no final), forçamos a barra. 
    // Isso evita que o navegador interprete "loco" como arquivo e tente registrar o SW na raiz "/".
    basePath += '/';
  }

  const cacheBuster = Date.now();
  addDebugLog(`⏳ Registrando Service Worker no escopo: ${basePath}`);

  try {
    // Injetamos o basePath absoluto calculado na hora
    const registration = await navigator.serviceWorker.register(
      `${basePath}service-worker.js?cacheBuster=${cacheBuster}`,
      { scope: basePath }
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

## Arquivo: `src/sw/sw-handshakes.ts`

```ts
// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { Handshake, MAX_TENTATIVAS } from "../constants/db.ts";
import { buildProxyUrl } from "../constants/config.ts";
import { base64UrlToArrayBuffer, criarJWT } from "../utils/jwt-helpers.ts";
import {
  salvarHandshake,
  buscarHandshake,
  listarHandshakes,
  removerHandshake,
  buscarContatoPorChave,
  buscarProfile,
  buscarChaveDecript,
  salvarProfile,
  serializarPublicKeyVapid,
  normalizarChaveContato
} from "../utils/db-helpers.ts";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "../utils/push-utils.ts";
import { extrairDadosCompactos } from "../utils/share-utils.ts";
import { addDebugLog } from "../utils/debug-utils.ts";
import { getServerPublicKey } from '../utils/profile-utils.ts';

import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

async function realizarGarbageCollection(emergencia = false) {
  try {
    const todos = await listarHandshakes();
    const agora = Date.now();
    
    const LIMITE_MS = emergencia ? (60 * 60 * 1000) : (7 * 24 * 60 * 60 * 1000); 

    let removidos = 0;
    for (const h of todos) {
      const idade = agora - (h.updatedAt || h.createdAt);
      
      if (idade > LIMITE_MS) {
        const inConcluido = !h.in || ['processado', 'falha'].includes(h.in.status);
        const outConcluido = !h.out || ['enviado', 'entregue', 'falha'].includes(h.out.status);

        const apagarForcado = emergencia && (idade > 3 * 24 * 60 * 60 * 1000);

        if ((inConcluido && outConcluido) || apagarForcado) {
          await removerHandshake(h.id);
          removidos++;
        }
      }
    }
    
    if (removidos > 0) {
      addDebugLog(`[SW-ROUTER] 🧹 Garbage Collection: ${removidos} handshakes antigos removidos (Emergência: ${emergencia}).`);
    }
  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro durante o Garbage Collection: ${err.message}`);
  }
}

async function salvarHandshakeTransacional(handshake: Handshake, mensagemSucesso?: string) {
  try {
    await salvarHandshake(handshake);
    if (mensagemSucesso) addDebugLog(mensagemSucesso);
  } catch (e: any) {
    if (e.name === 'QuotaExceededError') {
      addDebugLog("[SW-ROUTER] 🚨 CRÍTICO: Cota de armazenamento excedida. Disparando GC de emergência...");
      await realizarGarbageCollection(true);
      
      try {
        await salvarHandshake(handshake);
        addDebugLog("[SW-ROUTER] ✅ Espaço liberado. Handshake salvo com sucesso após emergência.");
      } catch (e2: any) {
        addDebugLog(`[SW-ROUTER] ❌ Falha catastrófica: Disco permanentemente cheio. Erro: ${e2.message}`);
        throw e2;
      }
    } else {
      addDebugLog(`[SW-ROUTER] ❌ Erro ao gravar handshake no IndexedDB: ${e.message}`);
      throw e;
    }
  }
}

export async function processarHandshakeRecebido(payload: any, header: any, _jwt: string) {
  addDebugLog("[SW-ROUTER] 🤝 Handshake recebido. Decifrando envelope...");

  try {
    if (!payload?.jti) {
      addDebugLog("[SW-ROUTER] ⚠️ Handshake rejeitado precocemente: Ausência de 'jti'");
      return;
    }
    if (!payload?.ct) {
      addDebugLog("[SW-ROUTER] ⚠️ Handshake rejeitado precocemente: Ausência de 'ct' (envelope cifrado)");
      return;
    }

    const privateDecryptKey = await buscarChaveDecript();
    if (!privateDecryptKey) {
      throw new Error("Chave privada RSA não encontrada para decifrar handshake.");
    }

    let envelope;
    try {
      envelope = JSON.parse(payload.ct);
    } catch (_e) {
      addDebugLog("[SW-ROUTER] ⚠️ Falha ao fazer parse do envelope cifrado 'ct'. JSON malformado.");
      return;
    }

    const iv = envelope.i || envelope.iv;
    const dados = envelope.d || envelope.dadosCifrados;
    const chaveAesCifrada = envelope.k || envelope.chaveAesCifrada;

    if (!iv || !dados || !chaveAesCifrada) {
      addDebugLog("[SW-ROUTER] ⚠️ Envelope incompleto. Descarte antecipado.");
      return;
    }

    const ivBytes = new Uint8Array(base64UrlToArrayBuffer(iv));
    const dadosBytes = new Uint8Array(base64UrlToArrayBuffer(dados));
    const chaveAesCifradaBytes = new Uint8Array(base64UrlToArrayBuffer(chaveAesCifrada));

    const aesChaveCruaBuffer = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateDecryptKey, chaveAesCifradaBytes);
    const chaveSimetricaAes = await crypto.subtle.importKey("raw", aesChaveCruaBuffer, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const textoDecifradoBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, chaveSimetricaAes, dadosBytes);

    let decompressed;
    let rotasObj;
    try {
      decompressed = gunzipSync(new Uint8Array(textoDecifradoBuffer));
      rotasObj = JSON.parse(new TextDecoder().decode(decompressed));
    } catch (_e) {
      addDebugLog("[SW-ROUTER] ⚠️ Falha ao descomprimir (fflate) ou fazer parse JSON do payload decifrado.");
      throw new Error("Falha na descompressão ou parse do payload interno.");
    }

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

    await salvarHandshakeTransacional(handshake, `[SW-ROUTER] ✅ Handshake ${handshake.id} decifrado e enfileirado para processamento In.`);
    
    processarFilaHandshake().catch(err => console.error(err));

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro ao decifrar handshake recebido: ${err.message}`);
    throw err;
  }
}

let isProcessingFila = false;

export async function processarFilaHandshake() {
  if (isProcessingFila) {
    return;
  }
  
  isProcessingFila = true;
  addDebugLog("[SW-ROUTER] 🔄 Processando fila geral de handshakes...");

  try {
    const todos = await listarHandshakes();

    const pendentesIn = todos.filter(h => h.in && (h.in.status === 'recebido' || (h.in.status === 'processando' && (Date.now() - h.updatedAt) > 60000)) && h.in.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesIn) {
      h.in!.status = 'processando';
      h.in!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshakeTransacional(h);

      try {
        if (h.in!.rotas.profile) await ProcessarProfile({ in: h.id });
        if (h.in!.rotas.contato) await ProcessarContato({ in: h.id });
        if (h.in!.rotas.mensagem) await ProcessarMensagem({ in: h.id });

        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'processado';
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Falha na rota IN do handshake ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.in) {
          hFresh.in.status = 'falha';
          hFresh.in.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      }
    }

    if (!navigator.onLine) {
      addDebugLog("[SW-ROUTER] 🌐 Dispositivo offline. Retendo fila de saída (Out).");
      return;
    }

    const todosAposIn = await listarHandshakes();
    const pendentesOut = todosAposIn.filter(h => h.out && (h.out.status === 'pendente' || (h.out.status === 'enviando' && (Date.now() - h.updatedAt) > 60000)) && h.out.tentativas < MAX_TENTATIVAS);

    for (const h of pendentesOut) {
      h.out!.status = 'enviando';
      h.out!.tentativas++;
      h.updatedAt = Date.now();
      await salvarHandshakeTransacional(h);

      try {
        const contatoIdHash = await normalizarChaveContato(h.aud);
        const contato = await buscarContatoPorChave(contatoIdHash);
        
        if (!contato) throw new Error(`Contato alvo (hash: ${contatoIdHash}) não encontrado.`);
        const profile = await buscarProfile();
        if (!profile) throw new Error("Perfil local não encontrado.");

        let vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
        if (!vapidPrivateKeyEnvelope) {
          const serverPublicKeyJwk = await getServerPublicKey();
          vapidPrivateKeyEnvelope = await cifrarChaveVapid(profile.vapidPrivateKeyJwk, serverPublicKeyJwk);
          profile.vapidPrivateKeyEnvelope = vapidPrivateKeyEnvelope;
          await salvarProfile(profile);
        }

        const isSyncHandshake = !!(h.out!.rotas?.contato?.sync);
        const isPullHandshake = Array.isArray(h.out!.rotas?.contato?.campos);
        
        if (!isSyncHandshake && !isPullHandshake && (contato.me === 'none' || contato.me === 'wrong')) {
          addDebugLog(`[SW-ROUTER] 💉 Contato desatualizado. Injetando dados de perfil no handshake ${h.id}.`);
          h.out!.rotas.contato = h.out!.rotas.contato || {};
          h.out!.rotas.contato.sync = extrairDadosCompactos(profile, true, contato.trusted === true) as unknown as Record<string, unknown>;
        }

        // 🔥 ARQUITETURA: Correção do Roteamento
        // Se a URL de proxy do contato for absoluta, usa ela pura para evitar corrupção por concatenação
        let proxyserverDestino = "";
        if (contato.subscription.proxyserver) {
           proxyserverDestino = contato.subscription.proxyserver;
        } else {
           proxyserverDestino = await buildProxyUrl('/');
        }

        const envelope = await cifrarPayloadObj(h.out!.rotas, contato.e2ePublicKey);
        const payloadJwt = { 
          sub: "hand", 
          aud: contato.id, 
          jti: h.id, 
          ct: JSON.stringify(envelope),
          proxyserver: proxyserverDestino
        };
        const jwt = await criarJWT(payloadJwt, profile.vapidPrivateKeyJwk, { kid: profile.vapidPublicKey });
        
        if (jwt.length > 4096) throw new Error(`Payload excede limite da WebPush de 4KB (atual: ${jwt.length})`);

        await enviarParaProxy(
          contato.subscription, jwt,
          { subject: `mailto:${contato.email || profile.email}`, publicKey: contato.vapidPublicKey, privateKey: contato.vapidPrivateKeyEnvelope }
        );

        h.out!.status = 'enviado';
        h.updatedAt = Date.now();
        await salvarHandshakeTransacional(h);
        addDebugLog(`[SW-ROUTER] 📤 Sucesso! Pacote blindado de Handshake ${h.id} disparado para a rede.`);

      } catch (err: any) {
        addDebugLog(`[SW-ROUTER] ❌ Erro ao enviar handshake OUT ${h.id}: ${err.message}`);
        const hFresh = await buscarHandshake(h.id);
        if (hFresh && hFresh.out) {
          hFresh.out.status = hFresh.out.tentativas >= MAX_TENTATIVAS ? 'falha' : 'pendente';
          hFresh.out.erro = err.message;
          hFresh.updatedAt = Date.now();
          await salvarHandshakeTransacional(hFresh);
        }
      }
    }
    
    await realizarGarbageCollection(false);

  } catch (err: any) {
    addDebugLog(`[SW-ROUTER] ❌ Erro geral ao processar fila: ${err.message}`);
  } finally {
    isProcessingFila = false;
  }
}

self.addEventListener('sync', function (event: any) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
});

self.addEventListener('online', function (event: Event) {
  if ('waitUntil' in event) {
    (event as ExtendableEvent).waitUntil(processarFilaHandshake());
  } else {
    processarFilaHandshake();
  }
});
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

## Arquivo: `src/utils/debug-utils.ts`

```ts
// src/utils/debug-utils.ts

const DEBUG_CHANNEL_NAME = "loco_debug_channel";

// BroadcastChannel é suportado tanto na Window (UI) quanto no ServiceWorker
let debugChannel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  debugChannel = new BroadcastChannel(DEBUG_CHANNEL_NAME);
}

export interface DebugLogPayload {
  id: string;
  timestamp: string;
  type: "info" | "warn" | "error" | "success";
  module: string;
  message: string;
  details?: unknown;
}

/**
 * Emite logs desacoplados via BroadcastChannel para o DebugPanel e inspeciona no console nativo.
 * Esta função suporta retrocompatibilidade, aceitando tanto 1 argumento (msg) quanto a versão rica.
 */
export function addDebugLog(
  typeOrMsg: string,
  moduleOrDetails?: any,
  message?: string,
  details?: unknown
): void {
  let logType: DebugLogPayload["type"] = "info";
  let logModule = "SYSTEM";
  let logMessage = "";
  let logDetails: unknown = undefined;

  // Trata a sobrecarga de argumentos
  if (arguments.length === 1 || (arguments.length === 2 && typeof moduleOrDetails !== "string")) {
    logType = "info";
    logModule = "APP";
    logMessage = typeOrMsg;
    logDetails = moduleOrDetails;
  } else {
    logType = (typeOrMsg as DebugLogPayload["type"]) || "info";
    logModule = moduleOrDetails as string || "SYSTEM";
    logMessage = message || "";
    logDetails = details;
  }

  // 🔥 Cria a estrutura exata que o DebugPanel.tsx espera receber
  const entry: DebugLogPayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    type: logType,
    module: logModule,
    message: logMessage,
    details: logDetails,
  };

  try {
    if (debugChannel) {
      debugChannel.postMessage({
        type: "LOCO_DEBUG_LOG",
        entry, // A propriedade mágica "entry" que faltava no payload
      });
    }
  } catch (err) {
    console.warn("Erro ao emitir log no BroadcastChannel:", err);
  }

  // Espelha no console de desenvolvedor do navegador
  const consoleMsg = `[${logModule}] ${logMessage}`;
  if (logType === "error") console.error(consoleMsg, logDetails ?? "");
  else if (logType === "warn") console.warn(consoleMsg, logDetails ?? "");
  else console.log(consoleMsg, logDetails ?? "");
}
```

---

## Arquivo: `src/utils/self-contact-utils.ts`

```ts
// src/utils/self-contact-utils.ts
import type { ProfileConfig, Contato } from '../constants/db.ts';

/**
 * Função interna para serializar chave pública VAPID em hash SHA-256.
 * Implementação própria para evitar dependência do IndexedDB em testes.
 */
async function serializarPublicKeyVapidInterna(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gera um objeto Contato baseado no ProfileConfig do próprio usuário.
 * Este contato especial usa o hash da chave pública VAPID do profile como ID,
 * permitindo que o sistema identifique quando o usuário está enviando mensagem para si mesmo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns Um objeto Contato representando o próprio usuário, ou null se profile for inválido
 */
export async function gerarContatoProprio(profile: ProfileConfig): Promise<Contato | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }

  try {
    const id = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    
    const contatoProprio: Contato = {
      id,
      email: profile.email,
      name: `${profile.name} (Eu)`,
      vapidPublicKey: profile.vapidPublicKey,
      e2ePublicKey: profile.e2ePublicKey,
      subscription: profile.subscription,
      vapidPrivateKeyEnvelope: profile.vapidPrivateKeyEnvelope,
      trusted: true,
      me: 'trusted', // 🔥 Marca especial indicando que é o próprio usuário
      createdAt: profile.createdAt,
      updatedAt: Date.now()
    };

    return contatoProprio;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao gerar contato próprio:', error);
    return null;
  }
}

/**
 * Verifica se um determinado contato é o próprio usuário.
 * Compara o hash do contato com o hash da chave pública VAPID do profile.
 * 
 * @param contatoHash - O hash/ID do contato a verificar
 * @param profile - O ProfileConfig do usuário atual
 * @returns true se o contato for o próprio usuário, false caso contrário
 */
export async function ehContatoProprio(
  contatoHash: string, 
  profile: ProfileConfig | null
): Promise<boolean> {
  if (!profile || !profile.vapidPublicKey) {
    return false;
  }

  try {
    const meuHash = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    return contatoHash === meuHash;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao verificar se é contato próprio:', error);
    return false;
  }
}

/**
 * Obtém o hash do próprio usuário a partir do profile.
 * Útil para comparações rápidas sem precisar gerar o objeto Contato completo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns O hash da chave pública VAPID do usuário, ou null se profile for inválido
 */
export async function obterHashProprio(profile: ProfileConfig | null): Promise<string | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }

  try {
    return await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao obter hash próprio:', error);
    return null;
  }
}

```

---

## Arquivo: `src/utils/db-helpers.ts`

```ts
// src/utils/db-helpers.ts
import { get, set, createStore, del, entries, values, getMany } from "idb-keyval";
import { STORE_NAMES, KEY_NAMES, DB_NAMES } from "../constants/db.ts";
import type { ProfileConfig, Chat, Contato, Handshake } from "../constants/db.ts";
import { 
  minifyVapidPublic, expandVapidPublic, 
  minifyVapidPrivate, expandVapidPrivate, 
  minifyRsaPublic, expandRsaPublic, 
  minifyRsaPrivate, expandRsaPrivate 
} from "./crypto-utils.ts";

// ============================================================
// Criação de Stores
// ============================================================

export function criarStore(nome: string, storeName: string = STORE_NAMES.KEYVAL) {
  return createStore(nome, storeName);
}

const storeConfig = criarStore(DB_NAMES.CONFIG);
export const storeChat = criarStore(DB_NAMES.CHAT); 
export const storeContatos = criarStore(DB_NAMES.CONTATOS);
export const storeHandshakes = criarStore(DB_NAMES.HANDSHAKES, STORE_NAMES.KEYVAL);

// ============================================================
// Funções Genéricas
// ============================================================

export async function salvarChave<T>(store: any, key: string, value: T): Promise<void> {
  return set(key, value, store);
}

export async function buscarChave<T>(store: any, key: string): Promise<T | undefined> {
  return get(key, store);
}

export async function removerChave(store: any, key: string): Promise<void> {
  return del(key, store);
}

export async function listarChaves<T>(store: any): Promise<[string, T][]> {
  return entries(store) as Promise<[string, T][]>;
}

export async function listarValores<T>(store: any): Promise<T[]> {
  return values(store) as Promise<T[]>;
}

// ============================================================
// Interceptadores de Compressão (DB Middlewares)
// ============================================================

function compactarProfile(p: ProfileConfig): any {
  return {
    ...p,
    vapidPublicKey: minifyVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: minifyVapidPrivate(p.vapidPrivateKeyJwk),
    e2ePublicKey: minifyRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: minifyRsaPrivate(p.e2ePrivateKeyJwk)
  };
}

function expandirProfile(p: any): ProfileConfig | undefined {
  if (!p) return undefined;
  return {
    ...p,
    vapidPublicKey: expandVapidPublic(p.vapidPublicKey),
    vapidPrivateKeyJwk: expandVapidPrivate(p.vapidPrivateKeyJwk, p.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(p.e2ePublicKey),
    e2ePrivateKeyJwk: expandRsaPrivate(p.e2ePrivateKeyJwk, p.e2ePublicKey)
  } as ProfileConfig;
}

function compactarContato(c: Contato): any {
  return {
    ...c,
    vapidPublicKey: minifyVapidPublic(c.vapidPublicKey),
    e2ePublicKey: minifyRsaPublic(c.e2ePublicKey)
  };
}

function expandirContato(c: any): Contato | undefined {
  if (!c) return undefined;
  return {
    ...c,
    vapidPublicKey: expandVapidPublic(c.vapidPublicKey),
    e2ePublicKey: expandRsaPublic(c.e2ePublicKey)
  } as Contato;
}

// ============================================================
// Gerenciamento do Perfil (ProfileConfig)
// ============================================================

export async function salvarProfile(profile: ProfileConfig): Promise<void> {
  profile.updatedAt = Date.now();
  if (!profile.createdAt) {
    profile.createdAt = Date.now();
  }
  await salvarChave(storeConfig, KEY_NAMES.PROFILE, compactarProfile(profile));
}

export async function buscarProfile(): Promise<ProfileConfig | undefined> {
  const p = await buscarChave<any>(storeConfig, KEY_NAMES.PROFILE);
  return expandirProfile(p);
}

export async function removerProfile(): Promise<void> {
  await removerChave(storeConfig, KEY_NAMES.PROFILE);
}

export async function buscarChaveDecript(): Promise<CryptoKey | null> {
  try {
    const profile = await buscarProfile();
    if (!profile || !profile.e2ePrivateKeyJwk) return null;

    return await crypto.subtle.importKey(
      "jwk",
      profile.e2ePrivateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
    );
  } catch (err) {
    console.error("[DB-HELPERS] ❌ Erro ao buscar chave de decodificação:", err);
    return null;
  }
}

// ============================================================
// Mensagens de Chat (Novo Formato Unificado + Lazy Loading)
// ============================================================

export async function salvarChat(chat: Chat): Promise<void> {
  chat.updatedAt = Date.now();
  await salvarChave(storeChat, chat.id, chat);

  const indexKey = `${KEY_NAMES.CHAT_INDEX}${chat.contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];
  
  if (!index.includes(chat.id)) {
    index.push(chat.id);
    await salvarChave(storeChat, indexKey, index);
  }
}

export async function buscarChat(id: string): Promise<Chat | undefined> {
  return buscarChave<Chat>(storeChat, id);
}

export async function listarChatPaginado(contatoHash: string, limit: number, offset: number): Promise<Chat[]> {
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  const index = await buscarChave<string[]>(storeChat, indexKey) || [];

  const total = index.length;
  if (total === 0 || offset >= total) return [];

  const startIndex = Math.max(0, total - offset - limit);
  const endIndex = total - offset;
  
  const sliceIds = index.slice(startIndex, endIndex);

  const records = await getMany(sliceIds, storeChat);
  return records.filter(Boolean) as Chat[];
}

export async function removerChat(id: string, contatoHash: string): Promise<void> {
  await removerChave(storeChat, id);
  const indexKey = `${KEY_NAMES.CHAT_INDEX}${contatoHash}`;
  let index = await buscarChave<string[]>(storeChat, indexKey) || [];
  index = index.filter(x => x !== id);
  await salvarChave(storeChat, indexKey, index);
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
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  
  // 🔥 Essencial: Sempre expandir a chave antes de gerar o hash, garantindo que
  // chaves previamente geradas mantenham o mesmo ID e não quebrem o app.
  const expanded = expandVapidPublic(jwk);
  const raw = `${expanded.kty?.toLowerCase() || ''}|${expanded.crv?.toLowerCase() || ''}|${expanded.x?.toLowerCase() || ''}|${expanded.y?.toLowerCase() || ''}`;
  return await sha256(raw);
}

export async function normalizarChaveContato(input: string | JsonWebKey): Promise<string> {
  if (typeof input === 'string') return input;
  if (typeof input === 'object' && input !== null && ('kty' in input || 'x' in input)) {
    return await serializarPublicKeyVapid(input as JsonWebKey);
  }
  throw new Error('Chave de contato inválida: deve ser string (hash) ou JWK.');
}

export async function salvarContato(contato: Contato): Promise<void> {
  const key = await serializarPublicKeyVapid(contato.vapidPublicKey);
  await salvarChave(storeContatos, key, compactarContato(contato));
}

export async function buscarContatoPorPublicKey(vapidPublicKey: JsonWebKey): Promise<Contato | undefined> {
  const key = await serializarPublicKeyVapid(vapidPublicKey);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}

export async function buscarContatoPorChave(chaveOuJwk: string | JsonWebKey): Promise<Contato | undefined> {
  const key = await normalizarChaveContato(chaveOuJwk);
  const c = await buscarChave<any>(storeContatos, key);
  return expandirContato(c);
}

export async function listarContatos(): Promise<Contato[]> {
  const entriesList = await listarChaves<any>(storeContatos);
  return entriesList.map(([_, c]) => expandirContato(c) as Contato);
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
  return listarValores<Handshake>(storeHandshakes);
}

export async function removerHandshake(id: string): Promise<void> {
  await removerChave(storeHandshakes, id);
}
```

---

## Arquivo: `src/utils/push-utils.ts`

```ts
// src/utils/push-utils.ts
import { gzipSync } from "fflate";
import { addDebugLog } from "./debug-utils.ts";
import { buildProxyUrl } from '../constants/config.ts';
import { minifyVapidPrivate, minifyVapidPublic } from "./crypto-utils.ts";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
  } catch (e: any) {
    throw new Error(`Erro ao encodar payload cifrado para Base64: ${e.message}`);
  }
}

export async function cifrarPayloadObj(payloadObj: any, publicKeyRSA: JsonWebKey): Promise<{
  i: string;
  d: string;
  k: string;
}> {
  try {
    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(payloadObj);
    const bytes = encoder.encode(jsonString);
    
    const compressed = gzipSync(bytes);
    
    addDebugLog("info", "CRYPTO:PUSH", `Comprimido: ${compressed.length} bytes (Original: ${bytes.length} bytes)`);
    if (compressed.length > 3000) {
       addDebugLog("warn", "CRYPTO:PUSH", `Atenção: O payload comprimido está em ${compressed.length} bytes. Risco de estourar o limite de 4KB após a assinatura JWT.`);
    }

    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      compressed as unknown as BufferSource
    );

    const cryptoKeyDestino = await crypto.subtle.importKey(
      "jwk" as any,
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
      i: arrayBufferToBase64(iv.buffer as ArrayBuffer),
      d: arrayBufferToBase64(encryptedBuffer),
      k: arrayBufferToBase64(aesKeyEncrypted)
    };
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:PUSH", `Erro severo na montagem do envelope E2EE: ${err.message}`);
    throw new Error(`Falha de criptografia Híbrida: ${err.message}`);
  }
}

export async function enviarParaProxy(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payloadText: string,
  vapid: { subject: string; publicKey: JsonWebKey; privateKey: string }
): Promise<void> {
  const payloadSize = new Blob([payloadText]).size;
  if (payloadSize > 4096) {
    addDebugLog("error", "NETWORK:PUSH", `Rejeição preventiva: Payload de ${payloadSize} bytes ultrapassa o limite arquitetural de 4096 bytes do FCM.`);
    throw new Error(`Limite de cota de rede excedido. O pacote final ficou com ${payloadSize} bytes, mas as redes celulares aceitam apenas até 4KB.`);
  }

  try {
    const proxyUrl = await buildProxyUrl('/');
    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        payloadText,
        vapid: {
          subject: vapid.subject,
          // 🔥 Minifica a chave pública para transitar na rede de forma enxuta
          publicKey: minifyVapidPublic(vapid.publicKey),
          privateKey: vapid.privateKey
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`O servidor retransmissor rejeitou o pacote. HTTP ${response.status}: ${errorText}`);
    }
  } catch (err: any) {
     addDebugLog("error", "NETWORK:PUSH", `Falha de conexão com o Proxy: ${err.message}`);
     throw err;
  }
}

export async function cifrarChaveVapid(privateKeyJwk: JsonWebKey, serverPublicKeyJwk: JsonWebKey): Promise<string> {
  try {
    const serverKey = await crypto.subtle.importKey(
      "jwk" as any,
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
    
    // 🔥 ARQUITETURA: Cortando o peso do Envelope 
    // Só ciframos a propriedade `{ d: "..." }`
    const minifiedPrivate = minifyVapidPrivate(privateKeyJwk);
    const vapidBytes = encoder.encode(JSON.stringify(minifiedPrivate));
    
    const vapidCifrado = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      vapidBytes as unknown as BufferSource
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
      iv: toHex(iv.buffer as ArrayBuffer),
      dadosCifrados: toHex(vapidCifrado),
      chaveAesCifrada: toHex(aesKeyCifrado)
    };
    
    return btoa(JSON.stringify(envelope));
  } catch (err: any) {
    addDebugLog("error", "CRYPTO:VAPID", `Falha no envelopamento da chave de Identidade: ${err.message}`);
    throw new Error(`Erro ao blindar perfil para a rede: ${err.message}`);
  }
}
```

---

## Arquivo: `src/utils/crypto-utils.ts`

```ts
// src/utils/crypto-utils.ts
import { addDebugLog } from "./debug-utils.ts";

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Falha crítica ao converter Buffer para Base64Url", err.message);
    throw new Error(`Buffer conversion failed: ${err.message}`);
  }
}

export function rawBufferToBase64Url(buffer: ArrayBuffer): string {
  return bufferToBase64Url(buffer);
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  try {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padLength);
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch (err: any) {
    addDebugLog("error", "CRYPTO", "Tentativa de decodificar Base64Url malformado ou corrompido", err.message);
    throw new Error("Formato Base64Url inválido.");
  }
}

// ============================================================
// 🔥 COMPRESSÃO POR ESQUEMA ESTÁTICO (Static Schema Compression)
// ============================================================

export function minifyVapidPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk; 
  return { x: jwk.x, y: jwk.y };
}

export function expandVapidPublic(minified: any): JsonWebKey {
  // Defensive Programming: Previne falhas se recebermos string ou lixo da rede
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  
  // Se a chave já possui 'kty', ela não está minificada, devolve como está
  if (minified.kty) return minified as JsonWebKey;
  
  // Reconstrói a chave injetando a 'gordura' estática da curva P-256
  // Fallbacks (vx, vy) mantidos para garantir retrocompatibilidade com QR Codes antigos
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minified.x || minified.vx, 
    y: minified.y || minified.vy, 
    ext: true, 
    key_ops: ["verify"] 
  };
}

export function minifyVapidPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  // A chave privada de Curva Elíptica é apenas o escalar "d".
  // "x" e "y" são removidos porque nós já temos eles na Chave Pública.
  return { d: jwk.d }; 
}

export function expandVapidPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  // Reconstrói a chave privada importando 'x' e 'y' da chave pública que sempre viaja junto
  return { 
    kty: "EC", 
    crv: "P-256", 
    x: minifiedPub.x || minifiedPub.vx, 
    y: minifiedPub.y || minifiedPub.vy, 
    d: minifiedPriv.d, 
    ext: true, 
    key_ops: ["sign"] 
  };
}

export function minifyRsaPublic(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  // Para RSA com expoente público fixo (65537), apenas o Módulo "n" é a variável matemática
  return { n: jwk.n };
}

export function expandRsaPublic(minified: any): JsonWebKey {
  if (typeof minified === "string") {
    try { minified = JSON.parse(minified); } catch { return {} as JsonWebKey; }
  }
  if (!minified || typeof minified !== "object") return {} as JsonWebKey;
  if (minified.kty) return minified as JsonWebKey;
  
  // Injeta o esquema estático RSA-OAEP e o expoente 'AQAB'
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minified.n || minified.en, 
    ext: true, 
    key_ops: ["encrypt"] 
  };
}

export function minifyRsaPrivate(jwk: JsonWebKey): any {
  if (!jwk || !jwk.kty) return jwk;
  // Extrai apenas os fatores primos estritamente secretos e o expoente 'd'
  return { d: jwk.d, p: jwk.p, q: jwk.q, dp: jwk.dp, dq: jwk.dq, qi: jwk.qi };
}

export function expandRsaPrivate(minifiedPriv: any, minifiedPub: any): JsonWebKey {
  if (typeof minifiedPriv === "string") {
    try { minifiedPriv = JSON.parse(minifiedPriv); } catch { return {} as JsonWebKey; }
  }
  if (!minifiedPriv || typeof minifiedPriv !== "object") return {} as JsonWebKey;
  if (minifiedPriv.kty) return minifiedPriv as JsonWebKey;
  
  // Remonta a chave RSA Privada buscando o 'n' na Chave Pública correspondente
  return { 
    kty: "RSA", 
    alg: "RSA-OAEP-256", 
    e: "AQAB", 
    n: minifiedPub.n || minifiedPub.en, 
    d: minifiedPriv.d, 
    p: minifiedPriv.p, 
    q: minifiedPriv.q, 
    dp: minifiedPriv.dp, 
    dq: minifiedPriv.dq, 
    qi: minifiedPriv.qi, 
    ext: true, 
    key_ops: ["decrypt"] 
  };
}

// ============================================================
// GERAÇÃO E OPERAÇÕES DA WEBCRYPTO API
// ============================================================

export async function generateVAPIDKeys(): Promise<CryptoKeyPair> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    addDebugLog("info", "CRYPTO", "Par de chaves VAPID (ECDSA P-256) gerado com sucesso");
    return keyPair;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de Hardware/Browser ao gerar VAPID: ${error.message}`, error);
    throw new Error("Este navegador não suporta geração de chaves ECDSA P-256 necessárias para o funcionamento offline.");
  }
}

export async function generateE2EEKeys(): Promise<{
  publicEncrypt: JsonWebKey;
  privateDecryptJwk: JsonWebKey;
}> {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // Corresponde a "AQAB" em Base64Url
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const publicEncrypt = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateDecryptJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

    addDebugLog("info", "CRYPTO", "Par de chaves RSA-OAEP gerado com sucesso");
    return { publicEncrypt, privateDecryptJwk };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha ao gerar chaves RSA E2E: ${error.message}`, error);
    throw new Error("Este dispositivo não suporta geração de chaves RSA-OAEP de 2048 bits.");
  }
}

export async function encryptTextAES(
  key: CryptoKey,
  plainText: string
): Promise<{ cipherTextBase64: string; ivBase64: string }> {
  try {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = enc.encode(plainText);

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encodedText
    );

    addDebugLog("info", "CRYPTO", "Texto criptografado via AES-GCM com sucesso");

    return {
      cipherTextBase64: bufferToBase64Url(cipherBuffer),
      ivBase64: bufferToBase64Url(iv.buffer as ArrayBuffer),
    };
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha interna no motor AES-GCM (Encrypt): ${error.message}`, error);
    throw new Error("Não foi possível criptografar os dados.");
  }
}

export async function decryptTextAES(
  key: CryptoKey,
  cipherTextBase64: string,
  ivBase64: string
): Promise<string> {
  try {
    const cipherBuffer = base64UrlToBuffer(cipherTextBase64);
    const ivBuffer = base64UrlToBuffer(ivBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Falha de decifragem AES-GCM (Chave incorreta ou corrompido): ${error.message}`, error);
    throw new Error("A decodificação falhou. Dados corrompidos ou chave inválida.");
  }
}

export async function exportKeyToJWK(key: CryptoKey): Promise<JsonWebKey> {
  try {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return jwk;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro ao extrair chave (não extraível?): ${error.message}`, error);
    throw new Error("Falha ao exportar a chave para formato seguro.");
  }
}

export async function importJWKToKey(
  jwk: JsonWebKey,
  algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams,
  extractable: boolean,
  keyUsages: KeyUsage[]
): Promise<CryptoKey> {
  try {
    // A função importJWKToKey espera sempre o formato completo, garantindo que
    // as camadas superiores do App (db-helpers, etc) já tenham inflado a chave.
    const key = await crypto.subtle.importKey(
      "jwk" as any,
      jwk,
      algorithm,
      extractable,
      keyUsages
    );
    return key;
  } catch (error: any) {
    addDebugLog("error", "CRYPTO", `Erro estrutural ao importar chave JWK: ${error.message}`, error);
    throw new Error("A chave de criptografia fornecida está corrompida ou é incompatível.");
  }
}
```

---

## Arquivo: `src/utils/router.ts`

```ts
import { signal, computed, effect } from "@preact/signals";
import {
  contatoSelecionado,
  contatoCompartilharHash,
  showAdvanced,
  currentMobileView,
  sharePayload
} from "../signals/state.ts";

export const currentHash = signal<string>(globalThis.location?.hash || "");

if (typeof globalThis !== "undefined" && globalThis.addEventListener) {
  globalThis.addEventListener("hashchange", () => {
    currentHash.value = globalThis.location.hash;
  });
}

export function navigate(hash: string) {
  if (typeof globalThis !== "undefined") {
    globalThis.location.hash = hash;
  }
}

effect(() => {
  const hash = currentHash.value;

  // Reset states
  contatoSelecionado.value = '';
  contatoCompartilharHash.value = null;
  showAdvanced.value = false;
  sharePayload.value = null;

  if (hash.startsWith('#chat=')) {
    contatoSelecionado.value = hash.substring(6);
    currentMobileView.value = 'chat';
  } else if (hash.startsWith('#detail=')) {
    contatoCompartilharHash.value = hash.substring(8);
    currentMobileView.value = 'chat';
  } else if (hash === '#advanced') {
    showAdvanced.value = true;
    currentMobileView.value = 'chat';
  // 🔥 CORREÇÃO: Adicionamos '#settings' para que ele ocupe a área principal no mobile
  } else if (hash === '#profile' || hash === '#logout' || hash === '#settings') {
    currentMobileView.value = 'chat'; 
  } else if (hash.startsWith('#share')) {
    currentMobileView.value = 'chat';
    // Extrai o payload caso venha via URL: #share=jwt_aqui
    if (hash.includes('=')) {
      sharePayload.value = hash.substring(hash.indexOf('=') + 1);
    }
  } else {
    // Se não for nenhuma das telas acima, volta para a lista (sidebar)
    currentMobileView.value = 'list';
  }
});

export const activeView = computed(() => {
  const hash = currentHash.value;
  if (hash.startsWith('#chat=')) return 'chat';
  if (hash.startsWith('#detail=')) return 'detail';
  if (hash === '#advanced') return 'advanced';
  if (hash === '#profile') return 'profile';
  if (hash === '#logout') return 'logout';
  if (hash.startsWith('#share')) return 'share';
  if (hash === '#settings') return 'settings';
  return 'home';
});
```

---

## Arquivo: `src/utils/profile-utils.ts`

```ts
// src/utils/profile-utils.ts
import { salvarProfile, buscarProfile } from './db-helpers.ts';
import { cifrarChaveVapid } from './push-utils.ts';
import { registrarServiceWorker } from "../sw/sw-utils.ts";
import { generateE2EEKeys, generateVAPIDKeys, rawBufferToBase64Url, expandRsaPublic } from './crypto-utils.ts';
import type { ProfileConfig } from '../constants/db.ts';
import { addDebugLog } from './debug-utils.ts';
import { buildProxyUrl } from '../constants/config.ts';
import { getConfigValue, saveConfig } from '../stores/config-store.ts';

export async function getServerPublicKey() {
  try {
    const cachedKey = await getConfigValue('SERVER_PUBLIC_KEY');
    if (cachedKey) {
      addDebugLog("info", "CRYPTO", "Chave do servidor carregada instantaneamente do cache local.");
      // 🔥 ARQUITETURA: O cache no IndexedDB guarda apenas o {"n": "..."}.
      // Expandimos para o formato JWK completo exigido pela WebCrypto API na RAM.
      return expandRsaPublic(JSON.parse(cachedKey));
    }
  } catch (e) {
    addDebugLog("warn", "CRYPTO", "Falha ao ler cache da chave do servidor. Recarregando da rede...");
  }

  addDebugLog("info", "NETWORK", "Buscando chave pública do servidor na rede...");
  const proxyUrl = await buildProxyUrl('/publickey');
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) throw new Error(`Erro ao buscar chave do servidor: ${response.status}`);
  
  const keyData = await response.json();
  
  // 🔥 ARQUITETURA: Salvamos exatamente o que veio da rede (A versão minificada {"n": "..."})
  await saveConfig('SERVER_PUBLIC_KEY', JSON.stringify(keyData));
  
  // Expandimos para uso imediato em memória
  return expandRsaPublic(keyData);
}

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

export async function gerarProfileCompleto(nome: string, email: string = ""): Promise<ProfileConfig> {
  addDebugLog("📦 Gerando/Atualizando perfil unificado...");

  if (!nome || nome.trim() === "") {
    throw new Error("Preencha pelo menos o seu Nome.");
  }

  try {
    addDebugLog("Step 1: Verificando permissão de notificação...");
    try {
      if (Notification.permission === "denied") {
        addDebugLog("⚠️ Permissão de notificação negada. Continuando offline...");
      } else if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          addDebugLog("⚠️ Permissão de notificação não concedida.");
        }
      }
    } catch (notifErr: any) {
      addDebugLog("⚠️ Erro ao verificar notificações: " + notifErr?.message);
    }

    addDebugLog("Step 2: Registrando Service Worker...");
    const registration = await registrarServiceWorker();

    addDebugLog("Step 3: Buscando chave pública do servidor...");
    const serverPublicKeyJwk = await getServerPublicKey();
    addDebugLog("Step 3.5: Chave do servidor garantida");

    let vapidKeyPair: CryptoKeyPair | undefined = undefined;
    let publicKeyJwk: JsonWebKey | undefined = undefined;
    let privateKeyJwk: JsonWebKey | undefined = undefined;

    let existingProfile = await buscarProfile();
    if (existingProfile && existingProfile.vapidPublicKey && existingProfile.vapidPrivateKeyJwk) {
      addDebugLog("📂 Chaves VAPID encontradas no perfil.");
      publicKeyJwk = existingProfile.vapidPublicKey;
      privateKeyJwk = existingProfile.vapidPrivateKeyJwk;
      try {
        vapidKeyPair = {
          publicKey: await window.crypto.subtle.importKey("jwk" as any, publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
          privateKey: await window.crypto.subtle.importKey("jwk" as any, privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])
        } as CryptoKeyPair;
      } catch {
        addDebugLog("⚠️ Erro ao importar chaves VAPID existentes. Gerando novas...");
        existingProfile = undefined;
      }
    }
    if (!existingProfile || !vapidKeyPair || !publicKeyJwk || !privateKeyJwk) {
      addDebugLog("🔑 Gerando novas chaves VAPID...");
      vapidKeyPair = await generateVAPIDKeys();
      publicKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.publicKey);
      privateKeyJwk = await window.crypto.subtle.exportKey("jwk", vapidKeyPair.privateKey);
    }

    addDebugLog("Step 4: Obtendo subscription...");
    if (!registration) throw new Error("Service Worker registration é null/undefined");
    if (!registration.pushManager) throw new Error("Web Push API (pushManager) não disponível.");
    
    let existingSubscription = await registration.pushManager.getSubscription();
    let subscriptionValida = false;

    if (existingSubscription) {
      const profileSub = existingProfile?.subscription;
      if (profileSub && profileSub.endpoint === existingSubscription.endpoint) {
        subscriptionValida = true;
      } else {
        await existingSubscription.unsubscribe();
        if (existingProfile) {
           delete (existingProfile as any).subscription;
           await salvarProfile(existingProfile);
        }
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
    
    // Resolve o proxyserver com caminho completo
    const proxyserver = await buildProxyUrl('/');
    
    const subscription = {
      endpoint: existingSubscription.endpoint,
      keys: {
        p256dh: rawBufferToBase64Url(p256dhBuffer),
        auth: rawBufferToBase64Url(authBuffer)
      },
      proxyserver
    };

    let e2ePublicKey: JsonWebKey;
    let e2ePrivateKeyJwk: JsonWebKey;

    if (existingProfile && existingProfile.e2ePublicKey && existingProfile.e2ePrivateKeyJwk) {
      addDebugLog("📂 Chaves E2E encontradas no perfil.");
      e2ePublicKey = existingProfile.e2ePublicKey;
      e2ePrivateKeyJwk = existingProfile.e2ePrivateKeyJwk;
      try {
        await window.crypto.subtle.importKey("jwk" as any, e2ePrivateKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
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

    // A chave pública do servidor usada aqui é a que acabou de ser obtida (da rede ou do disco)
    const privateKeyEncrypted = await cifrarChaveVapid(privateKeyJwk, serverPublicKeyJwk);

    const profile: ProfileConfig = {
      name: nome.trim(), 
      email: email.trim(), 
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

## Arquivo: `src/utils/share-utils.ts`

```ts
// src/utils/share-utils.ts
import { gzipSync, gunzipSync } from 'fflate';
import { criarJWT, verificarJWT, base64UrlToArrayBuffer, arrayBufferToBase64Url } from './jwt-helpers.ts';
import { minifyVapidPublic, expandVapidPublic, minifyRsaPublic, expandRsaPublic } from './crypto-utils.ts';
import type { ProfileConfig, Contato } from '../constants/db.ts';

const FCM_PREFIX = "https://fcm.googleapis.com/fcm/send/";

export interface CompactContact {
  req?: boolean;
  tr?: boolean;
  em: string;
  nm: string;
  vp: any; 
  ep: any; 
  se: string;
  sp: string;
  sa: string;
  ve: string;
  ps?: string; 
}

export function extrairDadosCompactos(target: ProfileConfig | Contato, req = false, tr = false): CompactContact {
  let ep = target.subscription.endpoint;
  if (ep.startsWith(FCM_PREFIX)) ep = "1:" + ep.replace(FCM_PREFIX, "");

  return {
    req,
    tr,
    em: target.email || '',
    nm: target.name || '',
    vp: minifyVapidPublic(target.vapidPublicKey),
    ep: minifyRsaPublic(target.e2ePublicKey),
    se: ep,
    sp: target.subscription.keys.p256dh,
    sa: target.subscription.keys.auth,
    ve: target.vapidPrivateKeyEnvelope,
    ps: target.subscription.proxyserver
  };
}

export function expandirDadosCompactos(c: CompactContact): Partial<Contato> {
  let ep = c.se;
  if (ep.startsWith("1:")) ep = FCM_PREFIX + ep.substring(2);

  return {
    email: c.em,
    name: c.nm,
    vapidPublicKey: expandVapidPublic(c.vp),
    e2ePublicKey: expandRsaPublic(c.ep),
    subscription: { endpoint: ep, keys: { p256dh: c.sp, auth: c.sa }, proxyserver: c.ps },
    vapidPrivateKeyEnvelope: c.ve,
    trusted: c.tr,
    me: 'saved' 
  };
}

export function gerarPayloadQrCodeCompacto(target: ProfileConfig | Contato): string {
  const compact = extrairDadosCompactos(target);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const compressed = gzipSync(jsonBytes);
  return arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);
}

export async function gerarLinkConviteWeb(
  target: ProfileConfig | Contato,
  myVapidPrivateKeyJwk: JsonWebKey,
  myVapidPublicKeyJwk: JsonWebKey,
  baseUrl?: string
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
  const cjwt = arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);

  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  return `${origin}/#share=${cjwt}`;
}

export async function processarQualquerConvite(rawInput: string): Promise<Partial<Contato>> {
  let cqr: string | null = null;
  let cjwt: string | null = null;
  let jwt: string | null = null;

  // 🔥 ARQUITETURA: Higienização inicial
  const input = rawInput.trim();

  // 1. Extração Segura de URL (Inteligência para o Roteamento Hash do Loco)
  try {
    if (input.includes('://') || input.startsWith('http')) {
      const url = new URL(input);
      
      // O formato oficial do Loco transporta o token no hash (#share=XYZ)
      if (url.hash && url.hash.includes('share=')) {
        const extracted = url.hash.split('share=')[1]?.split('&')[0];
        if (extracted) cjwt = extracted;
      } else {
        // Retrocompatibilidade para query params
        cqr = url.searchParams.get('cqr');
        cjwt = url.searchParams.get('cjwt');
        jwt = url.searchParams.get('jwt');
      }
    }
  } catch (e) {
    // Ignora erro de parsing da URL nativa e confia no fallback
  }

  // 2. Extração via texto puro (Caso a API de URL falhe ou falte protocolo)
  if (!cqr && !cjwt && !jwt) {
    if (input.includes('#share=')) {
      cjwt = input.split('#share=')[1]?.split('&')[0] || null;
    } else if (input.includes('cjwt=')) {
      cjwt = input.split('cjwt=')[1]?.split('&')[0] || null;
    } else if (input.includes('cqr=')) {
      cqr = input.split('cqr=')[1]?.split('&')[0] || null;
    } else if (input.includes('jwt=')) {
      jwt = input.split('jwt=')[1]?.split('&')[0] || null;
    }
  }

  // 3. Chute cego defensivo (O usuário colou SÓ o token sem nenhum prefixo)
  if (!cqr && !cjwt && !jwt && input) {
    // 🔥 ARQUITETURA: Um JWT padrão tem exatas 3 partições separadas por pontos. 
    // Protegemos contra URLs puras (que tem pontos no domínio) exigindo que não contenha '://'.
    if (input.split('.').length === 3 && !input.includes('://')) {
      jwt = input;
    } else {
      // Tenta descomprimir cegamente assumindo que é um token comprimido nu (cjwt/cqr)
      try {
        const cleanBase64 = input.replace(/[^A-Za-z0-9\-_]/g, ''); 
        const compressed = new Uint8Array(base64UrlToArrayBuffer(cleanBase64));
        const decompressed = gunzipSync(compressed);
        const text = new TextDecoder().decode(decompressed);
        
        if (text.startsWith('{')) {
          cqr = cleanBase64;
        } else {
          cjwt = cleanBase64;
        }
      } catch (_e) {
        // Fallback final: se tudo falhar, tenta jogar o input bruto pro validador cjwt
        cjwt = input;
      }
    }
  }

  let compactData: CompactContact | null = null;

  if (!compactData && cjwt) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cjwt));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      
      const { payload, valid } = await verificarJWT(jsonText); 
      if (!valid) throw new Error("Assinatura do convite inválida ou corrompida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar cjwt:", e);
    }
  }

  if (!compactData && cqr) {
    try {
      const compressed = new Uint8Array(base64UrlToArrayBuffer(cqr));
      const decompressed = gunzipSync(compressed);
      const jsonText = new TextDecoder().decode(decompressed);
      const parsed = JSON.parse(jsonText);
      
      if (parsed.vp || (parsed.vx && parsed.vy)) {
        compactData = parsed as CompactContact;
      }
    } catch (e) {
      console.warn("Falha ao ler cqr:", e);
    }
  }

  if (!compactData && jwt) {
    try {
      const { payload, valid } = await verificarJWT(jwt);
      if (!valid) throw new Error("Assinatura do convite inválida.");
      if (payload) compactData = payload as CompactContact;
    } catch (e) {
      console.warn("Falha ao verificar jwt:", e);
    }
  }

  if (!compactData) throw new Error("O link ou código colado não é um convite válido do Loco.");

  // Camada de Retrocompatibilidade O(1):
  if ((compactData as any).vx && !compactData.vp) {
    compactData.vp = { x: (compactData as any).vx, y: (compactData as any).vy };
    compactData.ep = { n: (compactData as any).en };
  }

  return expandirDadosCompactos(compactData);
}
```

---

## Arquivo: `src/utils/jwt-helpers.ts`

```ts
// src/utils/jwt-helpers.ts
import { minifyVapidPublic, expandVapidPublic } from "./crypto-utils.ts";

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e: any) {
    throw new Error(`Erro ao codificar Buffer para Base64Url: ${e.message}`);
  }
}

export function base64UrlToArrayBuffer(base64Url: string): ArrayBuffer {
  try {
    // 🔥 ARQUITETURA DE BLINDAGEM MÁXIMA (Defensive Programming):
    // 1. Substitui os caracteres seguros de URL (- e _) pelos clássicos (+ e /).
    // 2. O Regex /[^A-Za-z0-9\+\/]/g atua como um "triturador": 
    //    Ele remove impiedosamente espaços invisíveis, enters (\n) e restos de URLs (como ':' e '/') 
    //    deixando o atob() trabalhar sempre de forma segura apenas com Base64 válido.
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9\+\/]/g, '');
    
    // Adiciona o padding (=) matematicamente correto
    const padLength = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padLength);
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer as ArrayBuffer;
  } catch (e: any) {
    throw new Error(`Falha ao converter Base64Url para Binário. O token está corrompido: ${e.message}`);
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  } catch (e: any) {
    throw new Error(`Erro ao codificar Buffer para Base64 padrão: ${e.message}`);
  }
}

export async function criarJWT(
  payload: Record<string, any>,
  privateKeyJwk: JsonWebKey,
  headerExtra: Record<string, any> = {}
): Promise<string> {
  try {
    if (headerExtra.kid && (headerExtra.kid.kty || headerExtra.kid.x)) {
      headerExtra.kid = minifyVapidPublic(headerExtra.kid);
    }

    const header = { alg: "ES256", ...headerExtra };
    const encoder = new TextEncoder();

    const headerEnc = encoder.encode(JSON.stringify(header));
    const payloadEnc = encoder.encode(JSON.stringify(payload));

    const headerB64 = arrayBufferToBase64Url(headerEnc.buffer as ArrayBuffer);
    const payloadB64 = arrayBufferToBase64Url(payloadEnc.buffer as ArrayBuffer);
    const toSign = `${headerB64}.${payloadB64}`;

    const privateKey = await crypto.subtle.importKey(
      "jwk" as any,
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
  } catch (err: any) {
    throw new Error(`Falha no motor criptográfico ao assinar JWT: ${err.message}`);
  }
}

export async function verificarJWT(
  jwt: string,
  publicKeyJwk?: JsonWebKey
): Promise<{ header: any; payload: any; signature: string; valid: boolean }> {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      throw new Error("JWT malformado: Estrutura diferente de 3 partições (header.payload.signature).");
    }

    const headerB64 = parts[0]!;
    const payloadB64 = parts[1]!;
    const signatureB64 = parts[2]!;
    const decoder = new TextDecoder();

    const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));
    
    let header, payload;
    try {
      header = JSON.parse(headerJson);
      payload = JSON.parse(payloadJson);
    } catch (_parseErr) {
      throw new Error("Conteúdo interno do JWT não é um JSON válido.");
    }

    let publicKeyJwkFinal = publicKeyJwk;
    if (!publicKeyJwkFinal) {
      if (!header.kid) {
        throw new Error("Header JWT não contém a propriedade 'kid' (Key ID) e nenhuma chave pública externa foi fornecida.");
      }
      publicKeyJwkFinal = expandVapidPublic(header.kid);
    } else {
      publicKeyJwkFinal = expandVapidPublic(publicKeyJwkFinal);
    }

    const publicKey = await crypto.subtle.importKey(
      "jwk" as any,
      publicKeyJwkFinal as JsonWebKey,
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
  } catch (err: any) {
    throw new Error(`Falha na verificação de integridade do JWT: ${err.message}`);
  }
}

export function decodificarJWT(jwt: string): { header: any; payload: any; signature: string } {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error("JWT malformado. Leitura interrompida.");
  }

  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;
  const decoder = new TextDecoder();

  try {
    const headerJson = decoder.decode(base64UrlToArrayBuffer(headerB64));
    const payloadJson = decoder.decode(base64UrlToArrayBuffer(payloadB64));

    return {
      header: JSON.parse(headerJson),
      payload: JSON.parse(payloadJson),
      signature: signatureB64
    };
  } catch (err: any) {
    throw new Error(`Falha de decodificação forçada no JWT: ${err.message}`);
  }
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
// src/types/material-web.d.ts
import { JSX } from "preact";

declare module "preact" {
  namespace JSX {
    type MdElement = JSX.HTMLAttributes<HTMLElement> & {
      value?: string | number;
      checked?: boolean;
      disabled?: boolean;
      label?: string;
      placeholder?: string;
      slot?: string;
      onInput?: (e: Event) => void;
      onChange?: (e: Event) => void;
    };

    interface IntrinsicElements {
      "md-filled-button": MdElement;
      "md-outlined-button": MdElement;
      "md-text-button": MdElement;
      "md-filled-tonal-button": MdElement;
      "md-icon-button": MdElement;
      "md-filled-icon-button": MdElement;
      "md-fab": MdElement;
      "md-extended-fab": MdElement;
      "md-elevated-card": MdElement;
      "md-filled-card": MdElement;
      "md-outlined-card": MdElement;
      "md-filled-text-field": MdElement;
      "md-outlined-text-field": MdElement;
      "md-checkbox": MdElement;
      "md-radio": MdElement;
      "md-switch": MdElement;
      "md-list": MdElement;
      "md-list-item": MdElement;
      "md-divider": MdElement;
      "md-menu": MdElement & { anchor?: string; positioning?: string; open?: boolean };
      "md-menu-item": MdElement;
      "md-dialog": MdElement & { open?: boolean };
      "md-assist-chip": MdElement;
      "md-filter-chip": MdElement;
      "md-input-chip": MdElement;
      "md-suggestion-chip": MdElement;
      "md-circular-progress": MdElement & { indeterminate?: boolean };
      "md-linear-progress": MdElement & { indeterminate?: boolean };
      "md-icon": MdElement;
      "md-tabs": MdElement;
      "md-primary-tab": MdElement;
      "md-secondary-tab": MdElement;
      "md-filled-select": MdElement;
      "md-outlined-select": MdElement;
      "md-select-option": MdElement;
    }
  }
}

// 🔥 Declaração Global Centralizada para a API Nativa do BarcodeDetector
declare global {
  class BarcodeDetector {
    constructor(options?: { formats: string[] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detect(image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<any[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
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

## Arquivo: `src/handshakes/hand-mensagem.ts`

```ts
// src/handshakes/hand-mensagem.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { Handshake, Chat } from "../constants/db.ts";
import { gerarId } from "../utils/id-utils.ts";
import {
  buscarHandshake,
  salvarHandshake,
  buscarChat,
  salvarChat,
  buscarContatoPorChave,
  buscarProfile,
} from "../utils/db-helpers.ts";
import { ehContatoProprio } from "../utils/self-contact-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts"; 

interface MensagemOutParams {
  function: string;
  contato: string;
  conteudo?: string;
  mensagem?: string;
  campos?: string[];
  msgId?: string;       
  handshakeId?: string; 
  createdAt?: number;
}

async function notificarUI(chatId: string) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ type: 'CHAT_ATUALIZADO', payload: { chatId } }));
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: MensagemOutParams }) {
  
  // 📥 LÓGICA DE ENTRADA (Recebendo Push Criptografado da Rede)
  if (handshakeId) {
    addDebugLog(`[HAND-MENSAGEM] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.mensagem) return;
    const msgReq = handshake.in.rotas.mensagem;

    // Cenário 1: Solicitação PULL de status
    if (msgReq.recebida && Array.isArray(msgReq.campos)) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Solicitação PULL de status da mensagem ${msgReq.recebida}.`);
      const msgLocal = await buscarChat(msgReq.recebida);
      const rotasMsgData: Record<string, unknown> = { recebida: msgReq.recebida };

      if (msgLocal) {
        const camposSet = new Set(msgReq.campos);
        if (camposSet.has('readAt')) rotasMsgData.readAt = msgLocal.readAt;
        if (camposSet.has('receivedAt')) rotasMsgData.receivedAt = msgLocal.receivedAt;
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { mensagem: { data: rotasMsgData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    // Cenário 2: Auto-Ack Recebido (Confirmação de chegada física no destino)
    else if (msgReq.data && typeof msgReq.data.recebida === 'string' && typeof msgReq.data.status === 'string') {
      addDebugLog(`[HAND-MENSAGEM] 📩 Auto-Ack recebido. Status: ${msgReq.data.status}`);
      
      const msgLocal = await buscarChat(msgReq.data.recebida);
      
      if (msgLocal && msgLocal.tipo === 'out') {
        if (msgReq.data.status === 'entregue') msgLocal.receivedAt = Date.now();
        if (msgReq.data.status === 'lida') msgLocal.readAt = Date.now();
        
        await salvarChat(msgLocal);
        notificarUI(msgLocal.id);
      }
    }

    // Cenário 3: Recebendo uma MENSAGEM NOVA
    else if (msgReq.enviada && msgReq.conteudo) {
      addDebugLog(`[HAND-MENSAGEM] 📩 Nova mensagem recebida do remetente ${handshake.aud}`);
      
      const novaMsgRecebida: Chat = {
        id: msgReq.enviada,
        contatoHash: handshake.aud,
        conteudo: msgReq.conteudo,
        tipo: 'in',
        createdAt: Date.now(),
        receivedAt: Date.now(),
        handshake: handshakeId
      };
      await salvarChat(novaMsgRecebida);

      // Devolve Auto-Ack de recebimento físico para o remetente
      const ackHandshake: Handshake = {
        id: gerarId(),
        aud: handshake.aud,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        out: {
          status: 'pendente', tentativas: 0,
          rotas: { mensagem: { data: { recebida: novaMsgRecebida.id, status: 'entregue' } } }
        }
      };
      await salvarHandshake(ackHandshake);

      // 🔍 VERIFICAÇÃO DE CLIENTES ABERTOS
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const appEstaAberto = windowClients.length > 0;

      // 🔥 Só exibe notificação nativa do sistema se o aplicativo estiver totalmente fechado
      if (!appEstaAberto) {
        const contato = await buscarContatoPorChave(handshake.aud);
        const nomeExibicao = contato?.name?.trim() || "Anônimo";
        
        await self.registration.showNotification(`📥 Nova mensagem`, {
          body: `${novaMsgRecebida.conteudo}\n\nDe: ${nomeExibicao}`,
          icon: '/icon-192.png',
          tag: novaMsgRecebida.id
        });
      } else {
        addDebugLog(`[HAND-MENSAGEM] 👁️ O app está aberto (${windowClients.length} janela(s)). Notificação nativa suprimida.`);
      }

      notificarUI(novaMsgRecebida.id);
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
  
  // 📤 LÓGICA DE SAÍDA (Criando pacotes Push para enviar)
  if (outParams) {
    if (outParams.function === 'confirmarEntrega') {
      const { contato: contatoId, mensagem: mensagemId, campos } = outParams;
      const novoHandshake: Handshake = {
        id: gerarId(), aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { recebida: mensagemId, campos } } }
      };
      await salvarHandshake(novoHandshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (outParams.function === 'enviarMensagem') {
      const { contato: contatoId, conteudo, msgId, handshakeId, createdAt } = outParams;
      if (!conteudo) throw new Error("Conteúdo da mensagem não fornecido.");

      // 🔍 VERIFICA SE É MENSAGEM PARA SI MESMO (AUTO-MENSAGEM)
      const profile = await buscarProfile();
      const ehParaSiMesmo = profile ? await ehContatoProprio(contatoId, profile) : false;
      
      if (ehParaSiMesmo) {
        // 🔄 FLUXO ESPECIAL: Mensagem para si mesmo (sem envio real, sem handshake)
        addDebugLog(`[HAND-MENSAGEM] 🔄 Detectado envio para si mesmo. Salvando localmente sem handshake.`);
        
        const idReal = msgId || gerarId();
        const agora = Date.now();
        
        // Cria a mensagem já com status completo (enviada, recebida, lida)
        const chatAuto: Chat = {
          id: idReal,
          contatoHash: contatoId,
          conteudo,
          tipo: 'out',
          createdAt: createdAt || agora,
          sentAt: agora,        // ✅ Marcada como enviada
          receivedAt: agora,    // ✅ Marcada como recebida
          readAt: agora,        // ✅ Marcada como lida
          notifiedAt: agora,    // ✅ Marcada como notificada
          handshake: 'self'     // 🔥 Handshake especial indicando auto-envio
        };
        
        await salvarChat(chatAuto);
        notificarUI(idReal);
        addDebugLog(`[HAND-MENSAGEM] ✅ Auto-mensagem ${idReal} salva com fluxo completo simulado.`);
        return; // ⚠️ Sai imediatamente sem criar handshake
      }

      // 📤 FLUXO NORMAL: Mensagem para outro contato (com handshake)
      const idReal = msgId || gerarId();
      const handIdReal = handshakeId || gerarId();
      
      const chatExistente = await buscarChat(idReal);
      if (!chatExistente) {
        const chatOut: Chat = {
          id: idReal, contatoHash: contatoId, conteudo, tipo: 'out',
          createdAt: createdAt || Date.now(), handshake: handIdReal
        };
        await salvarChat(chatOut);
      }

      const novoHandshake: Handshake = {
        id: handIdReal, aud: contatoId, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { mensagem: { enviada: idReal, conteudo } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-MENSAGEM] ✅ Mensagem ${idReal} posta na fila de saída do SW.`);
      
      setTimeout(() => processarFilaHandshake(), 100);
    }
  }
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
import { minifyVapidPublic, expandVapidPublic, minifyRsaPublic, expandRsaPublic } from "../utils/crypto-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

interface ProfileOutParams {
  function: string;
  contato: string;
  campos?: string[];
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ProfileOutParams }) {
  
  if (handshakeId) {
    addDebugLog(`[HAND-PROFILE] 📥 Processando entrada do handshake ${handshakeId}`);
    const handshake = await buscarHandshake(handshakeId);
    
    if (!handshake || !handshake.in || !handshake.in.rotas.profile) {
      addDebugLog(`[HAND-PROFILE] ⚠️ Handshake ${handshakeId} não contém rotas de profile.`);
      return;
    }

    const profileReq = handshake.in.rotas.profile;

    if (Array.isArray(profileReq.campos)) {
      addDebugLog(`[HAND-PROFILE] 📩 Solicitação de dados recebida. Campos:`, profileReq.campos);
      
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil local não encontrado para responder à requisição.");

      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);
      
      const rotasProfileData: Record<string, unknown> = { id: meuHash };
      const camposSet = new Set(profileReq.campos);

      if (camposSet.has('name')) rotasProfileData.name = profile.name;
      if (camposSet.has('email')) rotasProfileData.email = profile.email;
      // 🔥 Enviamos o payload totalmente minificado pela rede
      if (camposSet.has('vapidPublicKey')) rotasProfileData.vapidPublicKey = minifyVapidPublic(profile.vapidPublicKey);
      if (camposSet.has('vapidPrivateKeyEnvelope')) rotasProfileData.vapidPrivateKeyEnvelope = profile.vapidPrivateKeyEnvelope;
      if (camposSet.has('e2ePublicKey')) rotasProfileData.e2ePublicKey = minifyRsaPublic(profile.e2ePublicKey);
      if (camposSet.has('subscription')) rotasProfileData.subscription = profile.subscription;

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

      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (profileReq.data && typeof profileReq.data.id === 'string') {
      addDebugLog(`[HAND-PROFILE] 📩 Resposta de dados recebida do contato ${profileReq.data.id}`);
      
      const contatoId = profileReq.data.id;
      const contato = await buscarContatoPorChave(contatoId);
      
      if (contato) {
        const d = profileReq.data;
        
        if (typeof d.name === 'string') contato.name = d.name;
        if (typeof d.email === 'string') contato.email = d.email;
        if (typeof d.vapidPrivateKeyEnvelope === 'string') contato.vapidPrivateKeyEnvelope = d.vapidPrivateKeyEnvelope;
        if (d.subscription !== undefined) contato.subscription = d.subscription as any;

        // 🔥 Expandimos as chaves minificadas que chegaram da rede para o padrão JWK antes de persistir em RAM
        if (d.vapidPublicKey !== undefined) contato.vapidPublicKey = expandVapidPublic(d.vapidPublicKey);
        if (d.e2ePublicKey !== undefined) contato.e2ePublicKey = expandRsaPublic(d.e2ePublicKey);

        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-PROFILE] ✅ Contato ${contatoId} atualizado com sucesso no DB.`);

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => {
          client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: contatoId } });
        });
      } else {
        addDebugLog(`[HAND-PROFILE] ⚠️ Resposta recebida, mas contato ${contatoId} não existe no banco.`);
      }
    }
  }
  
  if (outParams) {
    addDebugLog(`[HAND-PROFILE] 📤 Preparando saída manual de profile:`, outParams);
    
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
      addDebugLog(`[HAND-PROFILE] ✅ Handshake de solicitação de perfil criado.`);
      
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
import { extrairDadosCompactos, expandirDadosCompactos, CompactContact } from "../utils/share-utils.ts";
import { processarFilaHandshake } from "../sw/sw-handshakes.ts";
import { addDebugLog } from "../utils/debug-utils.ts";

interface ContatoOutParams {
  function: string;
  contato: string;
  campos?: string[];
  responder?: boolean;
}

export async function Processar({ in: handshakeId, out: outParams }: { in?: string, out?: ContatoOutParams }) {
  
  if (handshakeId) {
    const handshake = await buscarHandshake(handshakeId);
    if (!handshake || !handshake.in || !handshake.in.rotas.contato) return;
    const contatoReq = handshake.in.rotas.contato;

    if (Array.isArray(contatoReq.campos) && contatoReq.id) {
      addDebugLog(`[HAND-CONTATO] 📩 Solicitação PULL de status recebida.`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const rotasContatoData: Record<string, unknown> = { id: handshake.aud };

      if (contato) {
        const camposSet = new Set(contatoReq.campos);
        const cp = extrairDadosCompactos(contato);
        
        // 🔥 Usa o esquema minificado limpo `vp` e `ep`
        if (camposSet.has('vapidPublicKey')) rotasContatoData.vp = cp.vp;
        if (camposSet.has('e2ePublicKey')) rotasContatoData.ep = cp.ep;
        if (camposSet.has('subscription')) { rotasContatoData.se = cp.se; rotasContatoData.sp = cp.sp; rotasContatoData.sa = cp.sa; rotasContatoData.ps = cp.ps; }
        if (camposSet.has('vapidPrivateKeyEnvelope')) rotasContatoData.ve = cp.ve;
        if (camposSet.has('email')) rotasContatoData.em = cp.em;
        if (camposSet.has('name')) rotasContatoData.nm = cp.nm;
        if (camposSet.has('trusted')) rotasContatoData.tr = contato.trusted;
      } else {
        addDebugLog(`[HAND-CONTATO] ⚠️ Contato não localizado no banco local para aud: ${handshake.aud}`);
      }

      handshake.out = { status: 'pendente', tentativas: 0, rotas: { contato: { data: rotasContatoData } } };
      handshake.updatedAt = Date.now();
      await salvarHandshake(handshake);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    else if (contatoReq.data) {
      addDebugLog(`[HAND-CONTATO] 📩 Resposta de status recebida. Avaliando consistência...`);
      const contato = await buscarContatoPorChave(handshake.aud);
      const profile = await buscarProfile();

      if (!contato) {
        addDebugLog(`[HAND-CONTATO] ⚠️ Falha na avaliação: Contato não encontrado no banco local (aud: ${handshake.aud}).`);
        return;
      }

      if (!profile) {
        addDebugLog(`[HAND-CONTATO] ⚠️ Falha na avaliação: Perfil local não encontrado.`);
        return;
      }

      const d = contatoReq.data as Record<string, unknown>;
      const mp = extrairDadosCompactos(profile);
      let novoMeStatus = contato.me;

      if (!d.se) {
        novoMeStatus = 'none'; 
      } else {
        if (d.tr === true) novoMeStatus = 'trusted';
        else novoMeStatus = 'saved';

        // Lida com a estrutura nova ou aplica a de retrocompatibilidade
        const d_vp = d.vp as any || { x: d.vx, y: d.vy };
        const d_ep = d.ep as any || { n: d.en };

        // Compara com base no nosso profile extraído (mp)
        if (d.se !== mp.se || d.sp !== mp.sp || d.sa !== mp.sa || 
            d_vp.x !== mp.vp.x || d_vp.y !== mp.vp.y || d_ep.n !== mp.ep.n || d.ve !== mp.ve) {
          novoMeStatus = 'wrong';
        }
      }

      if (contato.me !== novoMeStatus) {
        const statusAnterior = contato.me;
        contato.me = novoMeStatus;
        contato.updatedAt = Date.now();
        await salvarContato(contato);
        addDebugLog(`[HAND-CONTATO] ✅ Status alterado de '${statusAnterior}' para: '${novoMeStatus}'`);
        
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));
      } else {
        addDebugLog(`[HAND-CONTATO] ✅ Consistência avaliada. Status mantido em: '${novoMeStatus}'`);
      }
    }

    else if (contatoReq.sync) {
      addDebugLog(`[HAND-CONTATO] 📩 Pacote PUSH com perfil atualizado recebido.`);
      
      const syncData = contatoReq.sync as unknown as CompactContact;
      
      // Aplica retrocompatibilidade antes de expandir
      if ((syncData as any).vx && !syncData.vp) {
        syncData.vp = { x: (syncData as any).vx, y: (syncData as any).vy };
        syncData.ep = { n: (syncData as any).en };
      }

      const expanded = expandirDadosCompactos(syncData);
      const contatoAntigo = await buscarContatoPorChave(handshake.aud);
      
      const eleConfiaEmMim = syncData.tr === true; 
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
      addDebugLog(`[HAND-CONTATO] ✅ Contato salvo. Status: ${novoMeStatus}`);

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: 'CONTATO_ATUALIZADO', payload: { contatoHash: handshake.aud } }));

      if (syncData.req) {
        addDebugLog(`[HAND-CONTATO] 🔄 Devolvendo meus dados em reciprocidade...`);
        await Processar({ out: { function: 'enviarSubscription', contato: handshake.aud, responder: true } });
      }
    }
  }

  if (outParams) {
    if (outParams.function === 'confirmarSubscription') {
      const profile = await buscarProfile();
      if (!profile) {
        addDebugLog(`[HAND-CONTATO] ❌ Erro ao criar Pull: Perfil local ausente.`);
        return;
      }
      const meuHash = await serializarPublicKeyVapid(profile.vapidPublicKey);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { id: meuHash, campos: outParams.campos } } }
      };
      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de confirmação de inscrição (Pull) criado.`);
      setTimeout(() => processarFilaHandshake(), 100);
    }

    if (outParams.function === 'enviarSubscription') {
      const profile = await buscarProfile();
      if (!profile) throw new Error("Perfil não encontrado.");

      const contatoAlvo = await buscarContatoPorChave(outParams.contato);
      const euConfio = contatoAlvo ? (contatoAlvo.trusted === true) : false;

      const compactSyncData = extrairDadosCompactos(profile, !outParams.responder, euConfio);

      const novoHandshake: Handshake = {
        id: gerarId(), aud: outParams.contato, createdAt: Date.now(), updatedAt: Date.now(),
        out: { status: 'pendente', tentativas: 0, rotas: { contato: { sync: compactSyncData as unknown as Record<string, unknown> } } }
      };

      await salvarHandshake(novoHandshake);
      addDebugLog(`[HAND-CONTATO] ✅ Handshake de sync de contato (Push) criado.`);
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
import { Processar as ProcessarProfile } from "./handshakes/hand-profile.ts";
import { Processar as ProcessarMensagem } from "./handshakes/hand-mensagem.ts";
import { Processar as ProcessarContato } from "./handshakes/hand-contato.ts";

console.log("[SW] 🌌 Service Worker orquestrador carregado.");

self.addEventListener('activate', (event: any) => {
  console.log("[SW] 🔄 Ativando e agendando processamento de filas pendentes...");
  event.waitUntil(
    (async () => {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await processarFilaHandshake();
      } catch (e) {
        console.error("[SW] Erro ao processar fila de handshakes:", e);
      }
    })()
  );
});

self.addEventListener('message', (event: any) => {
  if (!event.data) return;

  const { type, payload } = event.data;

  if (type === 'PROCESSAR_FILA_HANDSHAKE') {
    processarFilaHandshake().catch(err => console.error(err));
    return;
  }

  if (type === 'CRIAR_HANDSHAKE_OUT') {
    const { rotasModulo, params } = payload;
    console.log(`[SW] 📨 Recebido comando da UI para CRIAR_HANDSHAKE_OUT [Módulo: ${rotasModulo}]`);
    
    if (rotasModulo === 'profile') {
      ProcessarProfile({ out: params }).catch(err => console.error("[SW] Erro no hand-profile:", err));
    } else if (rotasModulo === 'mensagem') {
      ProcessarMensagem({ out: params }).catch(err => console.error("[SW] Erro no hand-mensagem:", err));
    } else if (rotasModulo === 'contato') {
      ProcessarContato({ out: params }).catch(err => console.error("[SW] Erro no hand-contato:", err));
    } else {
      console.warn(`[SW] ⚠️ Módulo de rotas desconhecido ou não implementado: ${rotasModulo}`);
    }
  }
});
```

---

## Arquivo: `src/app.tsx`

```tsx
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';

// Componentes da Interface
import { ContatosSection } from './components/ContatosSection.tsx';
import { ChatSection } from './components/ChatSection.tsx'; 
import { ContactDetailSection } from './components/ContactDetailSection.tsx';
import { AdvancedSection } from './components/AdvancedSection.tsx';
import { ProfileSection } from './components/ProfileSection.tsx';
import { LogoutSection } from './components/LogoutSection.tsx';
import { ShareSection } from './components/ShareSection.tsx';
import { SettingsSection } from './components/SettingsSection.tsx';
import { ToastSnackbar } from './components/ToastSnackbar.tsx';

// Signals e Lógica de Negócio
import { addDebugLog, currentMobileView, contatoSelecionado, contatoCompartilharHash, showAdvanced } from './signals/state.ts';
import { profile, initProfileStore, initContatosStore, initMensagensStore, contatosComHash } from './stores/index.ts';
import { loadAllConfigs } from './stores/config-store.ts';

// Roteador Reativo
import { activeView, navigate } from './utils/router.ts';

import "@material/web/all.js";
import './styles.css';

// Componente de Fallback/Home (Quando não há nada selecionado)
const HomePlaceholder = () => (
  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888;">
    <div style="text-align: center;">
      <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
      <p>Clique em um contato na barra lateral<br/>para conversar ou ver seu cartão de indicação.</p>
    </div>
  </div>
);

// Dicionário de Rotas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ViewMap: Record<string, ComponentType<any>> = {
  'chat': ChatSection,
  'detail': ContactDetailSection,
  'advanced': AdvancedSection,
  'profile': () => <div style="padding: 24px; display: flex; justify-content: center; overflow-y: auto;"><div style="max-width: 600px; width: 100%;"><ProfileSection/></div></div>,
  'logout': LogoutSection,
  'share': ShareSection,
  'settings': () => <div style="padding: 24px; display: flex; justify-content: center; overflow-y: auto;"><div style="max-width: 600px; width: 100%;"><SettingsSection/></div></div>,
  'home': HomePlaceholder,
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Inicialização assíncrona dos Stores locais e Infraestrutura
  useEffect(() => {
    const init = async () => {
      // 🔥 ARQUITETURA: Auto-Discovery Executado Globalmente no Boot!
      // Garante que o PWA descubra a rota correta do Proxy (Raiz ou Cloudflare)
      // ANTES do usuário interagir com qualquer botão de rede.
      addDebugLog("info", "SYSTEM", "Iniciando Auto-Discovery de Rede...");
      await loadAllConfigs();

      await initProfileStore();
      
      // Se não tem perfil gerado, e a rota não for perfil, força a rota (Route Guard)
      if ((!profile.value || !profile.value.e2ePrivateKeyJwk) && activeView.value !== 'profile') {
        navigate('#profile');
      }

      await initContatosStore();
      await initMensagensStore();
      addDebugLog("info", "SYSTEM", "✅ Stores e Infraestrutura inicializados");
      setIsLoading(false);
    };
    init();
  }, []);

  if (isLoading) {
    return (
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    );
  }

  // Preparações para o Cabeçalho Responsivo (Header)
  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;
  const contatoDetalhesAtivo = contatosComHash.value.find(c => c.hash === contatoCompartilharHash.value)?.contato;

  const nomeContatoAtivo = contatoAtivo ? (contatoAtivo.name?.trim() || "Anônimo") : "";
  const nomeDetalhesAtivo = contatoDetalhesAtivo ? (contatoDetalhesAtivo.name?.trim() || "Anônimo") : "";

  const fecharAreaPrincipal = () => navigate('');
  
  // Lógica Dinâmica para Títulos e Ícones do Cabeçalho da Área Principal
  let headerTitle = "Loco PWA";
  let headerSubtitle = "";
  let headerIcon = "forum";

  if (activeView.value === 'profile') {
    headerTitle = profile.value ? "Meu Perfil" : "Configurar Conta";
    headerSubtitle = "Gerencie sua identidade local e chaves";
    headerIcon = "account_circle";
  } else if (activeView.value === 'logout') {
    headerTitle = "Sair do Sistema";
    headerSubtitle = "Apagar dados locais e chaves deste dispositivo";
    headerIcon = "logout";
  } else if (activeView.value === 'share') {
    headerTitle = "Adicionar Contato";
    headerSubtitle = "Escaneie o QR Code ou cole o convite";
    headerIcon = "person_add";
  } else if (activeView.value === 'advanced') {
    headerTitle = "Opções Avançadas";
    headerSubtitle = "Diagnóstico do sistema e logs de rede";
    headerIcon = "settings_suggest";
  } else if (activeView.value === 'settings') {
    headerTitle = "Configurações";
    headerSubtitle = "Configure o servidor Push Proxy e outras opções";
    headerIcon = "settings";
  } else if (activeView.value === 'detail') {
    headerTitle = `Cartão de ${nomeDetalhesAtivo}`;
    headerSubtitle = "Gerencie as informações e a confiança deste contato";
    headerIcon = "badge";
  } else if (activeView.value === 'chat') {
    headerTitle = contatoAtivo ? nomeContatoAtivo : "Selecione um contato";
    headerSubtitle = contatoAtivo ? (contatoAtivo.email || "Sem e-mail") : "";
    headerIcon = "account_circle";
  }

  // Protege a view: se não tiver perfil, força a tela de perfil independentemente da URL
  const viewToRender = (!profile.value && activeView.value !== 'profile') ? 'profile' : activeView.value;
  const RouteComponent = ViewMap[viewToRender] || ViewMap['home']!;

  return (
    <div id="app-root" class={`view-mode-${currentMobileView.value}`}>
      
      <aside class="app-sidebar">
        <header class="sidebar-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="position: relative;">
              <md-icon-button id="btn-menu" onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const menu: any = document.getElementById('main-menu');
                if(menu) menu.open = !menu.open;
              }}>
                <md-icon>menu</md-icon>
              </md-icon-button>
              
              <md-menu id="main-menu" anchor="btn-menu" positioning="popover">
                <md-menu-item onClick={() => { navigate('#settings'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Configurações</div>
                  <md-icon slot="start">settings</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => { navigate('#advanced'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Avançado</div>
                  <md-icon slot="start">settings_suggest</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => { navigate('#logout'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Sair do App (Logout)</div>
                  <md-icon slot="start">logout</md-icon>
                </md-menu-item>
              </md-menu>
            </div>
            <h1 style="margin: 0; font-size: 1.25rem;">Loco</h1>
          </div>
          
          <div style="display: flex; gap: 4px;">
            <md-icon-button onClick={() => navigate('#share')} title="Adicionar Contato">
              <md-icon>person_add</md-icon>
            </md-icon-button>
            <md-icon-button onClick={() => navigate('#profile')} title="Meu Perfil">
              <md-icon>account_circle</md-icon>
            </md-icon-button>
          </div>
        </header>
        
        <div class="sidebar-content" style="padding: 0;">
          <div style="padding: 16px; animation: fadeIn 0.3s ease;">
            {profile.value ? <ContatosSection/> : <p style="text-align: center; color: #888; margin-top: 40px;">Configure seu perfil primeiro.</p>}
          </div>
        </div>
      </aside>

      <main class="app-main">
        <header class="chat-header">
          <md-icon-button class="back-button" onClick={fecharAreaPrincipal}>
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          
          <div 
            onClick={() => { if (activeView.value === 'chat' && contatoSelecionado.value) navigate(`#detail=${contatoSelecionado.value}`); }}
            style={`display: flex; align-items: center; gap: 12px; ${activeView.value === 'chat' && contatoAtivo ? 'cursor: pointer;' : ''}`}
          >
            <md-icon style="font-size: 2rem; color: #555;">{headerIcon}</md-icon>
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; line-height: 1.2; display: flex; align-items: center; gap: 6px;">
                {headerTitle}
                
                {((activeView.value === 'detail' && contatoDetalhesAtivo?.trusted) || 
                  (activeView.value === 'chat' && contatoAtivo?.trusted)) && (
                  <md-icon title="Contato Confiável" style="color: var(--md-sys-color-primary); font-size: 1.2rem;">verified</md-icon>
                )}
              </h2>
              {headerSubtitle && <span style="font-size: 0.8rem; color: #666;">{headerSubtitle}</span>}
            </div>
          </div>
        </header>

        <RouteComponent/>

      </main>
      <ToastSnackbar/>
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App/>, root);
}
```

---

## Arquivo: `public/manifest.json`

```json
{
  "start_url": "./index.html",
  "scope": "./",
  "name": "loco",
  "short_name": "loco",
  "lang": "pt-BR",
  "icons": [
    {
      "src": "./android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "./android-chrome-512x512.png",
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

## Arquivo: `wrangler.toml`

```toml
#:schema node_modules/wrangler/config-schema.json

# wrangler.toml

# Nome do seu projeto na Cloudflare
name = "loco"

# Ponto de entrada do seu Worker (o bundle gerado pelo Deno)
main = "build/worker.js"

# Data de compatibilidade (recomenda-se manter atualizada)
compatibility_date = "2026-06-01"
# compatibility_flags = ["nodejs_compat"]
# routes = [{ pattern = "push.vanaware.com/*", custom_domain = true }]

[observability]
enabled = true

# Configuração moderna para servir arquivos estáticos junto com o Worker
[assets]
# Diretório onde estão os arquivos estáticos do PWA
directory = "build/dist"
binding = "ASSETS" 

# OPCIONAL: Variáveis de ambiente que seu proxy cego do FCM possa precisar
[vars]
SERVER_PUBLIC_KEY = '{"kty":"RSA","alg":"RSA-OAEP-256","n":"mCUI2Ol5JwQsPMOT5DyMRJSy5WBT2rWX-w8_2tMJgk4GmCfmX9Di2MeUBa-S4Z3YuzBjGfsi2ZQ1PiET7tlbWDY0_2sztcvTJKiCWwMuGjnW3drzrytTdY6KiE8yxdLV8SjBPM6lpgBmIPXm0meOa5Ucn3lVwhO5md3gasR14MjtVWq4-SdYPJw7wP9OyAv4Q06izfS2aiFSQSbeXuj10HM9kyXArT3JhN4-LIIDh_jB5vE58FHzOdjzUalq9tEQolmxZ9rxEAaBtqMBNobn1Pgbe1NA1XyHHdHjo7Y3feraieBCl0B21OUxCPr80aC-SnxhW9pPf7IMP7fDryFgBQ","e":"AQAB","key_ops":["encrypt"],"ext":true}'

```

---

## Arquivo: `main.ts`

```ts
/// <reference lib="deno.ns" />

import { serveDir } from "@std/http/file-server";
import workerHandler from "./worker.ts";

const env = Deno.env.toObject()
Deno.serve({ port: Number(env?.PORT || 8000) }, async (req) => {    
    const url = new URL(req.url);
    const ctx = {
        waitUntil: (p: Promise<any>) => { p.catch(console.error); },
        passThroughOnException: () => {}
    };

// 1. Tenta processar a requisição através do workerHandler (APIs e Proxy Push)
    const workerResponse = await workerHandler.fetch(req, env, ctx);

    // 2. Se o worker processou com sucesso ou retornou erro de API (ex: 400, 403, 500), retorna o resultado dele
    if (workerResponse.status !== 404) {
        return workerResponse;
    }

    // 3. Se o worker retornou 404 (Endpoint não encontrado), significa que não é uma API.
    // Deixamos o serveDir processar para entregar o arquivo estático correspondente (HTML, JS, CSS, Ícones) do ./dist.
    try {
        const staticResponse = await serveDir(req, {
            fsRoot: "./build/dist",
            showDirListing: false,
            quiet: true,
        });

        // Se o arquivo estático foi encontrado e servido com sucesso, retorna-o
        if (staticResponse.status !== 404) {
            return staticResponse;
        }
    } catch {
        // Silencia erros de IO do disco
    }

    // 4. Se nem a API nem o disco possuíam o recurso, retorna o 404 limpo do worker
    return workerResponse; 

});

```

---

## Arquivo: `build.ts`

```ts
/// <reference lib="deno.ns" />
import { ensureDir, copy, walk } from "@std/fs";
import { join } from "@std/path";

const DIST_DIR = "dist";
const BUILD_DIR = "build";
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

async function incrementVersion(): Promise<string> {
  const denoJsoncPath = "deno.jsonc";
  let content = await Deno.readTextFile(denoJsoncPath);
  let currentVersion = "0.0.0";
  
  const buildHash = Date.now().toString(36);

  content = content.replace(/"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)(?:-[a-zA-Z0-9]+)?"/, (_match, major, minor, patch) => {
    const nextPatch = parseInt(patch, 10) + 1;
    currentVersion = `${major}.${minor}.${nextPatch}-${buildHash}`;
    return `"version": "${currentVersion}"`;
  });

  await Deno.writeTextFile(denoJsoncPath, content);
  
  await ensureDir(join(SRC_DIR, "constants"));
  const versionTsContent = `// Arquivo gerado automaticamente pelo build.ts\nexport const APP_VERSION = "${currentVersion}";\n`;
  await Deno.writeTextFile(join(SRC_DIR, "constants", "version.ts"), versionTsContent);
  
  console.log(`📈 Versão incrementada para: v${currentVersion}`);
  return currentVersion;
}

async function clean() {
  try {
    await Deno.remove(BUILD_DIR, { recursive: true });
  } catch {
    // diretório não existe, ok
  }
  await ensureDir(join(BUILD_DIR,DIST_DIR));
  console.log("📁 Arquivos anteriores excluídos");
}

async function copyStaticAndSyncManifest(appVersion: string) {
  try {
    await copy(PUBLIC_DIR, join(BUILD_DIR,DIST_DIR), { overwrite: true });
    
    const manifestPath = join(BUILD_DIR, DIST_DIR, "manifest.json");
    try {
      const manifestText = await Deno.readTextFile(manifestPath);
      const manifestObj = JSON.parse(manifestText);
      manifestObj.version = appVersion;
      await Deno.writeTextFile(manifestPath, JSON.stringify(manifestObj, null, 2));
      console.log(`📱 Versão v${appVersion} injetada em dist/manifest.json`);
    } catch {
      console.log("⚠️ Não foi possível atualizar a versão dentro do manifest.json");
    }

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

function extrairCodigoDoBundle(result: BundleResult): string {
  if (!result.outputFiles || result.outputFiles.length === 0) return '';
  const file = result.outputFiles[0];
  if (!file || !file.contents) return '';
  return contentsToString(file.contents);
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
  
  console.log("🔐 Gerando novas chaves RSA do servidor (Formato Minificado Duplo)...");
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
  
  const compactPublicJwk = {
    n: publicJwk.n
  };

  const compactPrivateJwk = {
    d: privateJwk.d,
    p: privateJwk.p,
    q: privateJwk.q,
    dp: privateJwk.dp,
    dq: privateJwk.dq,
    qi: privateJwk.qi
  };

  const publicKeyStr = JSON.stringify(compactPublicJwk);
  const privateKeyStr = JSON.stringify(compactPrivateJwk);
  
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
}

async function listarAssetsParaCache(): Promise<string[]> {
  const assets: string[] = [];
  const exclude = new Set(['service-worker.js', 'service-worker.tmp.js']);
  
  for await (const entry of walk(join(BUILD_DIR,DIST_DIR), { includeDirs: false })) {
    if (!entry.name.endsWith(".map") && !exclude.has(entry.name)) {
      let webPath = entry.path.replace(join(BUILD_DIR,DIST_DIR), "").replace(/\\/g, "/");
      
      // 🔥 ARQUITETURA: Garante que os caminhos gerados para o cache sejam relativos.
      // Substitui "/index.html" por "./index.html" para rodar em subdiretórios.
      if (webPath.startsWith('/')) {
        webPath = '.' + webPath;
      } else {
        webPath = './' + webPath;
      }
      
      assets.push(webPath);
    }
  }
  return assets;
}

async function build() {
  console.log("\n🚀 Iniciando build Loco ...\n");
  const start = performance.now();

  const appVersion = await incrementVersion();
  await gerarOuCarregarChavesServidor();
  await clean();
  await copyStaticAndSyncManifest(appVersion);

  console.log("📦 Compilando página HTML ...");
  await runBundle("HTML", {
    entrypoints: [
      join(SRC_DIR, "index.html")
    ],
    outputDir: join(BUILD_DIR,DIST_DIR),
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

  console.log("📦 Compilando Cloudflare Worker ...");
  await runBundle("worker", {
    entrypoints: [
      "./worker.ts"
    ],
    outputDir: join(BUILD_DIR),
    platform: "browser",
    format: "esm",
    bundle: true,
    minify: false,
    write: true,
    sourcemap: "inline",
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

  const assets = await listarAssetsParaCache();
  const versionHash = `v${appVersion}`;

  swCode = swCode
    .replace(/VERSION_HASH/g, versionHash)
    .replace(/__GENERATED_ASSETS__/g, JSON.stringify(assets)); 

  await Deno.writeTextFile(join(BUILD_DIR, DIST_DIR, "service-worker.js"), swCode);

  console.log(`✨ Service Worker gerado com sucesso! (Cache ID: ${versionHash})`);
  console.log(`    📦 ${assets.length} assets em cache`);
  console.log(`    📄 Tamanho: ${(swCode.length / 1024).toFixed(2)} KB`);

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n✨ Build completo em ${elapsed}ms → ${BUILD_DIR}/\n`);
}

await build();
```

---

## Arquivo: `deno.jsonc`

```json
{
  // ============================================================================
  // 🚀 LOCO PWA - Manifesto do Deno
  // Mensageiro PWA Descentralizado, Offline-First & E2EE
  // ============================================================================

  // 📋 Metadados do Projeto
  "name": "@vanaware/loco",
  // A versão do projeto deve ser alterada aqui, pois o build.ts usa esta informação para gerar o arquivo dist/manifest.json
  "version": "0.2.94-msu738bx",
  "exports": "./main.ts",
  "description": "Mensageiro PWA focado em privacidade absoluta. Utiliza criptografia híbrida ponta-a-ponta e sincronização background (Offline-First).",
  "author": "Vanaware",
  "license": "MIT",
  
  "workspace": [
    "proto/_template",
    "proto/01-push-messaging"
  ],

  // ⚙️ Configurações Rigorosas do Compilador TypeScript (FASE 4)
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "esnext", "deno.ns"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "types": ["./src/types/material-web.d.ts"],
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  },

  // 📦 Gerenciamento de Dependências
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

  // 🛠️ Scripts de Automação
  "tasks": {
    "test": "deno test --allow-env --allow-net tests/",
    "check": "deno check main.ts worker.ts build.ts export.ts src/**/*.ts src/**/*.tsx",
    "build": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --unstable-bundle build.ts",
    "start": "deno run --allow-read --allow-write --allow-env --allow-net --env-file main.ts",
    "dev": "deno run --allow-read --allow-write --allow-env --allow-net --env-file --watch main.ts",
    "clean": "deno clean && rm -rf build && mkdir -p build/dist",
    "tests": "deno task check && deno task test",
    "export": "deno run --allow-read --allow-write export.ts"
  },
  "exclude": ["build/", "public/"]
}
```

---

## Arquivo: `worker.ts`

```ts
// worker.ts
/// <reference lib="deno.ns" />

import * as webpush from "@negrel/webpush";
import { deleteCookie } from "@std/http/cookie";

let serverPrivateKeyCache: CryptoKey | null = null;
let serverPublicKeyJwkCache: JsonWebKey | null = null;
let serverPublicKeyMinifiedCache: any | null = null; 

async function getOrInitServerKeys(env?: { SERVER_PUBLIC_KEY?: string; SERVER_PRIVATE_KEY?: string }) {
  if (serverPrivateKeyCache && serverPublicKeyJwkCache && serverPublicKeyMinifiedCache) {
    return { 
      serverPrivateKey: serverPrivateKeyCache, 
      serverPublicKeyJwk: serverPublicKeyJwkCache,
      serverPublicKeyMinified: serverPublicKeyMinifiedCache
    };
  }

  const publicKeyStr = env?.SERVER_PUBLIC_KEY;
  const privateKeyStr = env?.SERVER_PRIVATE_KEY;

  if (!publicKeyStr) {
    throw new Error("❌ Chave SERVER_PUBLIC_KEY não encontrada! Configure-a no arquivo wrangler.toml ou via dashboard da Cloudflare.");
  }
  
  if (!privateKeyStr) {
    throw new Error("❌ Chave SERVER_PRIVATE_KEY não encontrada! Configure-a como um Secret seguro na Cloudflare.");
  }

  try {
    const rawPublicKeyJwk = JSON.parse(publicKeyStr);
    let publicKeyJwk = { ...rawPublicKeyJwk };
    let privateKeyJwk = JSON.parse(privateKeyStr);

    const minifiedPublicKey = rawPublicKeyJwk.kty ? { n: rawPublicKeyJwk.n } : rawPublicKeyJwk;

    if (!publicKeyJwk.kty) {
      publicKeyJwk = {
        kty: "RSA",
        alg: "RSA-OAEP-256",
        n: publicKeyJwk.n,
        e: "AQAB",
        ext: true,
        key_ops: ["encrypt"]
      };
    }

    if (!privateKeyJwk.kty) {
      privateKeyJwk = {
        kty: "RSA",
        alg: "RSA-OAEP-256",
        e: publicKeyJwk.e,
        n: publicKeyJwk.n,
        ext: true,
        key_ops: ["decrypt"],
        d: privateKeyJwk.d,
        p: privateKeyJwk.p,
        q: privateKeyJwk.q,
        dp: privateKeyJwk.dp,
        dq: privateKeyJwk.dq,
        qi: privateKeyJwk.qi
      };
    }

    const serverPrivateKey = await crypto.subtle.importKey(
      "jwk" as any,
      privateKeyJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );

    serverPrivateKeyCache = serverPrivateKey;
    serverPublicKeyJwkCache = publicKeyJwk;
    serverPublicKeyMinifiedCache = minifiedPublicKey;

    console.log("🔐 Chaves RSA de Infraestrutura carregadas com sucesso na RAM!");
    return { 
      serverPrivateKey, 
      serverPublicKeyJwk: publicKeyJwk,
      serverPublicKeyMinified: minifiedPublicKey 
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Erro ao inicializar chaves do servidor: ${errorMsg}`);
  }
}

async function decryptWithServerKey(base64Envelope: string, serverPrivateKey: CryptoKey): Promise<any> {
  try {
    const envelopeText = atob(base64Envelope);
    const { iv, dadosCifrados, chaveAesCifrada } = JSON.parse(envelopeText);

    const fromHex = (hex: string) => new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    const ivBytes = fromHex(iv);
    const dadosBytes = fromHex(dadosCifrados);
    const chaveAesCifradaBytes = fromHex(chaveAesCifrada);

    const aesChaveCruaBuffer = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      serverPrivateKey,
      chaveAesCifradaBytes
    );

    const chaveSimetricaAes = await crypto.subtle.importKey(
      "raw",
      aesChaveCruaBuffer,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

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

function parseVapidKeysToJwk(publicKey: any, privateKey: any) {
  try {
    const pub = typeof publicKey === "string" ? JSON.parse(publicKey) : publicKey;
    const priv = typeof privateKey === "string" ? JSON.parse(privateKey) : privateKey;

    const expandedPub = pub.kty ? pub : {
      kty: "EC", crv: "P-256", x: pub.x, y: pub.y, ext: true, key_ops: ["verify"]
    };

    const expandedPriv = priv.kty ? priv : {
      kty: "EC", crv: "P-256", x: expandedPub.x, y: expandedPub.y, d: priv.d, ext: true, key_ops: ["sign"]
    };

    return { publicKey: expandedPub, privateKey: expandedPriv };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`As chaves enviadas não estão no formato JSON/JWK válido: ${errorMessage}`);
  }
}

function lerMetadadosJJWT(jwtString: string) {
  try {
    const parts = jwtString.split(".");
    if (parts.length !== 3) return null;

    const part1 = parts[1];
    if (!part1) return null;

    let base64Url = part1.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Url.length % 4) base64Url += "=";

    const jsonString = new TextDecoder().decode(
      new Uint8Array([...atob(base64Url)].map(c => c.charCodeAt(0)))
    );
    
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

function checkIsAllowedOrigin(origin: string, env: any): boolean {
  if (!origin) return false;

  const defaultPatterns = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*arvati\.workers\.dev$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*vanaware\.com$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*tap\.app\.br$/,
    /^https?:\/\/([a-zA-Z0-9-]+\.)*github\.io$/,
    /^https?:\/\/dash\.cloudflare\.com$/
  ];

  for (const pattern of defaultPatterns) {
    if (pattern.test(origin)) return true;
  }

  const envOrigins = env?.ALLOWED_ORIGINS;
  if (typeof envOrigins === "string" && envOrigins.trim() !== "") {
    const rules = envOrigins.split(",").map(s => s.trim());
    for (const rule of rules) {
      const escapedRule = rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, "([a-zA-Z0-9-]+\\.)*");

      const dynamicRegex = new RegExp(`^${escapedRule}$`, "i");
      if (dynamicRegex.test(origin)) {
        return true;
      }
    }
  }

  return false;
}

const workerHandler = {
  async fetch(request: Request, env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    let origin = request.headers.get("origin") || "";
    if (origin === "") {
      const host = request.headers.get("host") || "localhost";
      const protocolo = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      origin = `${protocolo}://${host}`;
    }

    const isAllowedOrigin = checkIsAllowedOrigin(origin, env);

    const corsHeaders = {
      "Access-Control-Allow-Origin": isAllowedOrigin ? origin : "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", 
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Crypto-Key, TTL, Urgency, X-Push-Payload",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const isPing = pathname.endsWith("/ping") || pathname.endsWith("/ping/");
    const isPublicKey = pathname.endsWith("/publickey") || pathname.endsWith("/publickey/");
    const isLogout = pathname.endsWith("/logout") || pathname.endsWith("/logout/");

    if (!isAllowedOrigin) {
      console.warn(`🛑 [CORS REJEITADO] Acesso bloqueado para a origem: "${origin}"`);
      return new Response(JSON.stringify({ error: "CORS: Origem não autorizada para esta API." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { serverPrivateKey, serverPublicKeyMinified } = await getOrInitServerKeys(env);

      if ((request.method === "POST" || request.method === "GET") && isPing) {
        return new Response(JSON.stringify({ 
          status: "ok", 
          service: "loco-proxy",
          timestamp: Date.now()
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && isPublicKey) {
        return new Response(JSON.stringify(serverPublicKeyMinified), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (request.method === "POST" && isLogout) {
        const headers = new Headers(corsHeaders);
        deleteCookie(headers, "session_token", { path: "/" });
        headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
        headers.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ disconnected: true }), {
          status: 200,
          headers,
        });
      }

      if (request.method === "POST" && !isPing && !isPublicKey && !isLogout) {
        console.log(`\n📥 [${new Date().toLocaleTimeString()}] Nova requisição proxy web push recebida!`);
        
        const body = await request.json();
        const { subscription, payloadText, vapid } = body;

        if (!subscription || !payloadText || !vapid) {
          return new Response(
            JSON.stringify({ success: false, error: "Parâmetros obrigatórios ausentes no body." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const jwtClaims = lerMetadadosJJWT(payloadText);
        if (jwtClaims) {
          console.log(`    - [AUDITORIA JWT] Emitido por: ${jwtClaims.nm || "Desconhecido"} <${jwtClaims.iss || "Sem e-mail"}>`);
        }

        const proxyserverDestino = jwtClaims?.proxyserver;
        if (proxyserverDestino) {
          const urlAtual = new URL(request.url);
          const origemAtual = `${urlAtual.host}${env.PROXY_PATH || ""}`;
          
          // 🔥 ARQUITETURA DE REDIRECIONAMENTO INTELIGENTE
          // Remove os protocolos HTTP/HTTPS apenas para a fase estrita de "Match" de Domínios.
          const destinoSemProtocolo = proxyserverDestino.replace(/^https?:\/\//, "").replace(/\/$/, "");
          const origemNormalizada = origemAtual.replace(/\/$/, "");
          
          if (origemNormalizada !== destinoSemProtocolo) {
            console.log(`    🔄 [REDIRECIONAMENTO] Proxy destino (${destinoSemProtocolo}) difere do atual (${origemNormalizada}). Reencaminhando...`);
            
            try {
              // Mantém a URL do proxy original intocada para o Fetch não quebrar mixed-content em testes locais (http vs https)
              const urlDestino = proxyserverDestino.endsWith('/') ? proxyserverDestino : `${proxyserverDestino}/`;
              
              const response = await fetch(urlDestino, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription, payloadText, vapid })
              });
              
              // Garante que o Worker avise falhas de gateway como 502/404 em vez de mascarar
              if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText}`);
              }
              
              console.log(`    ✅ [REDIRECIONAMENTO] Push reencaminhado com sucesso! Status: ${response.status}`);
              
              return new Response(JSON.stringify({ success: true, redirected: true, target: destinoSemProtocolo }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
              });
            } catch (redirectErr) {
              const errorMsg = redirectErr instanceof Error ? redirectErr.message : String(redirectErr);
              console.error(`    ❌ [REDIRECIONAMENTO] Falha ao reencaminhar: ${errorMsg}`);
              return new Response(
                JSON.stringify({ success: false, error: `Falha ao reencaminhar para proxy destino: ${errorMsg}` }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }

        let privateKeyFinal = vapid.privateKey;

        if (typeof privateKeyFinal === "string") {
          console.log("    - [SEGURANÇA] Descriptografando Chave Privada VAPID com a RSA do Servidor...");
          try {
            const decryptedPrivateKeyObj = await decryptWithServerKey(privateKeyFinal, serverPrivateKey);
            privateKeyFinal = decryptedPrivateKeyObj;
            console.log("    - [SEGURANÇA] ✅ Chave VAPID descriptografada com sucesso!");
          } catch (decryptErr) {
            console.error("    - [SEGURANÇA] ❌ Erro ao descriptografar chave VAPID:", decryptErr);
            return new Response(
              JSON.stringify({ success: false, error: "Falha ao descriptografar chave VAPID." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        let jwkKeys = parseVapidKeysToJwk(vapid.publicKey, privateKeyFinal);
        let vapidKeys = await webpush.importVapidKeys(jwkKeys);
        
        const contact = vapid.subject.startsWith("mailto:") ? vapid.subject : `mailto:${vapid.subject}`;
        const appServer = await webpush.ApplicationServer.new({
          contactInformation: contact,
          vapidKeys: vapidKeys,
        });

        const subscriber = appServer.subscribe(subscription);
        await subscriber.pushTextMessage(payloadText, {});
        
        console.log("    ✅ [SUCESSO] Push despachado com sucesso!");

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({ error: "Endpoint não encontrado no servidor proxy do Loco." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ Erro no Worker:", errorMessage);
      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
};

export default workerHandler;
```

---


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
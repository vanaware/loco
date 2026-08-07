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
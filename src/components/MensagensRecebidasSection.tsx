// src/components/MensagensRecebidasSection.tsx
import { mensagensRecebidas, marcarMensagemRecebidaComoLida, removerMensagemRecebidaPorId, carregarMensagensRecebidas } from '../stores/mensagensStore.ts';
import { contatosComHash } from '../stores/contatosStore.ts';
import { useEffect } from 'preact/hooks';
import { showToast, addDebugLog } from '../signals/state.ts';

export function MensagensRecebidasSection() {
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'PUSH_RECEIVED') {
        carregarMensagensRecebidas();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const removerLidas = async () => {
    if (!confirm('Remover todas as mensagens lidas?')) return;
    const lidas = mensagensRecebidas.value.filter(m => m.status === 'lida');
    for (const m of lidas) {
      await removerMensagemRecebidaPorId(m.id);
    }
    showToast(`✅ ${lidas.length} mensagens removidas.`, "success");
  };

  const getNome = (hash: string): string => {
    const item = contatosComHash.value.find(c => c.hash === hash);
    return item?.contato.nome || hash.substring(0, 16) + '...';
  };

  return (
    <div class="container container-receptor">
      <h2>📬 Mensagens Recebidas</h2>
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <md-outlined-button onClick={carregarMensagensRecebidas}>🔄 Atualizar</md-outlined-button>
        <md-outlined-button onClick={removerLidas}>🗑️ Remover Lidas</md-outlined-button>
      </div>
      <div>
        {mensagensRecebidas.value.length === 0 ? (
          <p style="color: #666;">Nenhuma mensagem recebida.</p>
        ) : (
          <md-list>
            {mensagensRecebidas.value.map(msg => {
              const nomeRemetente = getNome(msg.contatoPublicKeyVapid);
              return (
                <md-list-item key={msg.id}>
                  <span slot="headline">
                    {msg.status === 'nao_lida' && '🟡'}
                    {msg.status === 'notificada' && '🔔'}
                    {msg.status === 'lida' && '✅'}
                    {' '}
                    De: {nomeRemetente}
                  </span>
                  <span slot="supporting-text">
                    {msg.conteudo}
                    <br />
                    Recebido: {new Date(msg.recebidoEm).toLocaleString()}
                    <br />
                    Status: {msg.status}
                  </span>
                  <div slot="end" style="display: flex; gap: 8px;">
                    {(msg.status === 'nao_lida' || msg.status === 'notificada') && (
                      <md-outlined-button onClick={async () => {
                        await marcarMensagemRecebidaComoLida(msg.id);
                      }}>Marcar lida</md-outlined-button>
                    )}
                    <md-icon-button onClick={async () => {
                      if (confirm('Remover esta mensagem?')) {
                        await removerMensagemRecebidaPorId(msg.id);
                      }
                    }}>delete</md-icon-button>
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
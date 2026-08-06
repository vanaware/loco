// src/components/MensagensRecebidasSection.tsx
import { mensagensRecebidas, addDebugLog, showToast } from '../signals/state.ts';
import { listarMensagensRecebidas, atualizarStatusMensagemRecebida, removerMensagemRecebida, serializarPublicKeyVapid, listarContatos } from '../utils/db-helpers.ts';
import { useEffect, useState } from 'preact/hooks';

export function MensagensRecebidasSection() {
  const [nomesMap, setNomesMap] = useState<Map<string, string>>(new Map());

  const carregar = async () => {
    // Carrega mapa de contatos
    const contatosList = await listarContatos();
    const map = new Map<string, string>();
    for (const c of contatosList) {
      const hash = await serializarPublicKeyVapid(c.publicKeyVapid);
      map.set(hash, c.nome);
    }
    setNomesMap(map);

    // Carrega mensagens
    const lista = await listarMensagensRecebidas();
    lista.sort((a, b) => b.recebidoEm - a.recebidoEm);
    mensagensRecebidas.value = lista;
  };

  useEffect(() => {
    carregar();
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'PUSH_RECEIVED') {
        carregar();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const removerLidas = async () => {
    if (!confirm('Remover todas as mensagens lidas?')) return;
    const lidas = mensagensRecebidas.value.filter(m => m.status === 'lida');
    for (const m of lidas) {
      await removerMensagemRecebida(m.id);
    }
    await carregar();
    showToast(`✅ ${lidas.length} mensagens removidas.`, "success");
  };

  const getNome = (hash: string): string => {
    const nome = nomesMap.get(hash);
    if (nome) return nome;
    // Tenta tratar como JWK stringificado
    try {
      const jwk = JSON.parse(hash);
      // Não temos como buscar por JWK diretamente, então retorna hash encurtado
      return hash.substring(0, 16) + '...';
    } catch {
      return hash.substring(0, 16) + '...';
    }
  };

  return (
    <div class="container container-receptor">
      <h2>📬 Mensagens Recebidas</h2>
      <div style="display: flex; gap: 10px; margin-bottom: 10px;">
        <md-outlined-button onClick={carregar}>🔄 Atualizar</md-outlined-button>
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
                        await atualizarStatusMensagemRecebida(msg.id, 'lida');
                        await carregar();
                      }}>Marcar lida</md-outlined-button>
                    )}
                    <md-icon-button onClick={async () => {
                      if (confirm('Remover esta mensagem?')) {
                        await removerMensagemRecebida(msg.id);
                        await carregar();
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
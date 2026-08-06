// src/components/EnviarMensagemSection.tsx
import { contatoSelecionado, mensagemEnvio, contatos, mensagensEnviadas, addDebugLog, showToast } from '../signals/state.ts';
import { salvarMensagemEnviada, listarMensagensEnviadas, removerMensagemEnviada, buscarContatoPorChave, serializarPublicKeyVapid, listarContatos } from '../utils/db-helpers.ts';
import { gerarIdMensagem } from '../utils/id-utils.ts';
import { useEffect, useState } from 'preact/hooks';

export function EnviarMensagemSection() {
  const [nomesMap, setNomesMap] = useState<Map<string, string>>(new Map());

  const carregarContatosMap = async () => {
    const contatosList = await listarContatos();
    const map = new Map<string, string>();
    for (const c of contatosList) {
      const hash = await serializarPublicKeyVapid(c.publicKeyVapid);
      map.set(hash, c.nome);
    }
    setNomesMap(map);
    // Atualiza o signal contatos também
    contatos.value = contatosList;
  };

  const carregarEnviadas = async () => {
    const lista = await listarMensagensEnviadas();
    lista.sort((a, b) => b.createdAt - a.createdAt);
    mensagensEnviadas.value = lista;
  };

  const handleEnviar = async () => {
    const selectedKey = contatoSelecionado.value;
    if (!selectedKey) {
      showToast("Selecione um contato.", "error");
      return;
    }
    const conteudo = mensagemEnvio.value;
    if (!conteudo) {
      showToast("Digite uma mensagem.", "error");
      return;
    }
    try {
      const contato = await buscarContatoPorChave(selectedKey);
      if (!contato) {
        addDebugLog(`❌ Contato não encontrado para a chave: ${selectedKey}`);
        showToast("Contato não encontrado. Tente adicioná-lo novamente.", "error");
        return;
      }
      const msgId = gerarIdMensagem();
      const mensagem = {
        id: msgId,
        contatoHash: selectedKey,
        conteudo,
        status: 'pendente' as const,
        tentativas: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await salvarMensagemEnviada(mensagem);
      const reg = await navigator.serviceWorker.ready;
      reg.active?.postMessage({ type: 'PROCESSAR_FILA_ENVIO' });
      await carregarEnviadas();
      mensagemEnvio.value = '';
      showToast(`✅ Mensagem adicionada à fila para ${contato.nome}.`, "success");
      addDebugLog(`✅ Mensagem ${msgId} adicionada à fila.`);
    } catch (err: any) {
      showToast(`❌ ${err.message}`, "error");
      addDebugLog(`❌ Erro ao enviar: ${err.message}`);
    }
  };

  useEffect(() => {
    carregarContatosMap();
    carregarEnviadas();

    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'MENSAGEM_ENTREGUE') {
        carregarEnviadas();
        carregarContatosMap(); // atualiza nomes caso tenha mudado
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Função para obter nome a partir do hash
  const getNome = (hash: string): string => {
    const nome = nomesMap.get(hash);
    if (nome) return nome;
    return hash.substring(0, 16) + '...';
  };

  return (
    <div class="container container-emissor">
      <h2>📤 Enviar Mensagem</h2>
      <div class="row">
        <div class="col">
          <md-outlined-select
            label="Selecione o contato destino"
            value={contatoSelecionado.value}
            onInput={(e: any) => contatoSelecionado.value = e.target.value}
          >
            <md-select-option value="">-- Selecione --</md-select-option>
            {contatos.value.map(c => {
              // Gera o hash da chave pública para usar como valor
              const hash = serializarPublicKeyVapid(c.publicKeyVapid);
              return (
                <md-select-option key={c.email} value={hash}>
                  {c.nome} ({c.email})
                </md-select-option>
              );
            })}
          </md-outlined-select>
        </div>
      </div>
      <md-outlined-text-field
        label="Mensagem"
        value={mensagemEnvio.value}
        onInput={(e: any) => mensagemEnvio.value = e.target.value}
        rows="3"
        multiline
      ></md-outlined-text-field>
      <md-filled-button onClick={handleEnviar} style="width: 100%; margin-top: 10px;">
        🚀 Enviar Mensagem
      </md-filled-button>

      <div class="mt-10">
        <label>📤 Mensagens Enviadas:</label>
        <div style="max-height: 250px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
          {mensagensEnviadas.value.length === 0 ? (
            <p style="color: #666;">Nenhuma mensagem enviada.</p>
          ) : (
            <md-list>
              {mensagensEnviadas.value.map(msg => {
                const nomeDestino = getNome(msg.contatoHash);
                return (
                  <md-list-item key={msg.id}>
                    <span slot="headline">
                      {msg.status === 'pendente' && '⏳'}
                      {msg.status === 'enviando' && '🔄'}
                      {msg.status === 'enviada' && '✅'}
                      {msg.status === 'entregue' && '📬'}
                      {msg.status === 'falha' && '❌'}
                      {' '}
                      Para: {nomeDestino}
                    </span>
                    <span slot="supporting-text">
                      {msg.conteudo} <br />
                      Status: {msg.status} {msg.tentativas > 0 && `(tentativas: ${msg.tentativas})`}
                    </span>
                    {msg.status !== 'pendente' && msg.status !== 'enviando' && (
                      <md-icon-button slot="end" onClick={async () => {
                        if (confirm('Remover esta mensagem?')) {
                          await removerMensagemEnviada(msg.id);
                          await carregarEnviadas();
                        }
                      }}>delete</md-icon-button>
                    )}
                  </md-list-item>
                );
              })}
            </md-list>
          )}
        </div>
      </div>
    </div>
  );
}
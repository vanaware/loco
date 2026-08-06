// src/components/EnviarMensagemSection.tsx
import { contatoSelecionado, mensagemEnvio, addDebugLog, showToast } from '../signals/state.ts';
import { contatosComHash, mensagensEnviadas, adicionarMensagemEnviada, removerMensagemEnviadaPorId, carregarMensagensEnviadas } from '../stores/index.ts';
import { buscarContatoPorHash } from '../stores/contatosStore.ts';
import { gerarIdMensagem } from '../utils/id-utils.ts';
import { useEffect } from 'preact/hooks';

export function EnviarMensagemSection() {
  const handleEnviar = async () => {
    const selectedHash = contatoSelecionado.value;
    if (!selectedHash) {
      showToast("Selecione um contato.", "error");
      return;
    }
    const conteudo = mensagemEnvio.value;
    if (!conteudo) {
      showToast("Digite uma mensagem.", "error");
      return;
    }
    try {
      const contato = await buscarContatoPorHash(selectedHash);
      if (!contato) {
        showToast("Contato não encontrado.", "error");
        return;
      }
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
      mensagemEnvio.value = '';
      showToast(`✅ Mensagem adicionada à fila para ${contato.nome}.`, "success");
      addDebugLog(`✅ Mensagem ${msgId} adicionada à fila.`);
    } catch (err: any) {
      showToast(`❌ ${err.message}`, "error");
      addDebugLog(`❌ Erro ao enviar: ${err.message}`);
    }
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'MENSAGEM_ENTREGUE') {
        carregarMensagensEnviadas();
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

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
            {contatosComHash.value.map(({ contato, hash }) => (
              <md-select-option key={contato.email} value={hash}>
                {contato.nome} ({contato.email})
              </md-select-option>
            ))}
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
                const contatoComHash = contatosComHash.value.find(c => c.hash === msg.contatoHash);
                const nomeDestino = contatoComHash?.contato.nome || msg.contatoHash.substring(0,16)+'...';
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
                          await removerMensagemEnviadaPorId(msg.id);
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
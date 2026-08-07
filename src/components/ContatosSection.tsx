// src/components/ContatosSection.tsx
import { useEffect } from 'preact/hooks';
import { contatosComHash, removerContatoPorPublicKey, homologarContatoPorPublicKey } from '../stores/contatosStore.ts';
import { showToast, contatoSelecionado, contatoCompartilharHash, currentMobileView } from '../signals/state.ts';

export function ContatosSection() {
  useEffect(() => {
    // Stores inicializadas no App.tsx
  }, []);

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
            {contatosComHash.value.map(({ contato, hash }) => (
              <md-list-item 
                key={contato.email} 
                onClick={() => abrirChat(hash)}
                style="cursor: pointer;"
              >
                <md-icon slot="start">person</md-icon>
                <span slot="headline" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; display: block;">
                  <strong>{contato.nome}</strong>
                </span>
                <span slot="supporting-text">{contato.homologado ? '✅ Homologado' : '🔄 Não homologado'}</span>
                
                {/* 🔥 flex-shrink: 0 garante que o container de botões não seja espremido */}
                <div slot="end" style="display: flex; gap: 0px; align-items: center; flex-shrink: 0;">
                  <md-icon-button 
                    onClick={(e) => abrirDetalhesContato(e, hash)}
                    title={`Ver QR Code / Indicar ${contato.nome}`}
                  >
                    <md-icon>qr_code_2</md-icon>
                  </md-icon-button>

                  {!contato.homologado && (
                    <md-icon-button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        await homologarContatoPorPublicKey(contato.publicKeyVapid);
                        showToast("Contato homologado!", "success");
                      }}
                      title="Homologar contato"
                    >
                      <md-icon>verified</md-icon>
                    </md-icon-button>
                  )}

                  <md-icon-button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Remover ${contato.nome} dos contatos?`)) {
                        await removerContatoPorPublicKey(contato.publicKeyVapid);
                      }
                    }}
                    title="Excluir contato"
                  >
                    <md-icon>delete</md-icon>
                  </md-icon-button>
                </div>
              </md-list-item>
            ))}
          </md-list>
        )}
      </div>
    </div>
  );
}
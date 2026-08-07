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
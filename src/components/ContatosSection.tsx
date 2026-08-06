// src/components/ContatosSection.tsx
import { useEffect } from 'preact/hooks';
import { contatos, contatosComHash, adicionarContato, removerContatoPorPublicKey, homologarContatoPorPublicKey } from '../stores/contatosStore.ts';
import { profileInput, showToast, addDebugLog } from '../signals/state.ts';
import { verificarJWT } from '../utils/jwt-helpers.ts';
import type { Contato } from '../constants/db.ts';

export function ContatosSection() {
  // Os stores já carregam os dados, mas podemos garantir
  useEffect(() => {
    // Não precisa chamar nada, os stores já foram inicializados no App
  }, []);

  const handleAdicionar = async () => {
    const raw = profileInput.value.trim();
    if (!raw) {
      showToast("Cole o JWT do contato.", "error");
      return;
    }
    try {
      const { header, payload, valid } = await verificarJWT(raw);
      if (!valid) throw new Error("Assinatura inválida.");
      if (payload.sub !== "contact") throw new Error("JWT não é de contato.");
      
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
      profileInput.value = '';
      showToast(`✅ Contato "${novoContato.nome}" adicionado.`, "success");
      addDebugLog(`✅ Contato "${novoContato.nome}" adicionado.`);
    } catch (err: any) {
      showToast(`❌ ${err.message}`, "error");
      addDebugLog(`❌ Erro ao adicionar contato: ${err.message}`);
    }
  };

  return (
    <div class="container container-contatos">
      <h2>📇 Contatos</h2>
      <div class="row">
        <div class="col">
          <label>Cole aqui o perfil de outra pessoa (JWT):</label>
          <md-outlined-text-field
            label="JWT do contato"
            value={profileInput.value}
            onInput={(e: any) => profileInput.value = e.target.value}
            rows="4"
            multiline
          ></md-outlined-text-field>
          <md-filled-button onClick={handleAdicionar}>➕ Adicionar Contato</md-filled-button>
        </div>
      </div>
      <div class="mt-10">
        <label>📋 Meus Contatos:</label>
        <div style="max-height: 200px; overflow-y: auto; background: white; padding: 10px; border-radius: 4px; border: 1px solid #ddd;">
          {contatos.value.length === 0 ? (
            <p style="color: #666;">Nenhum contato adicionado ainda.</p>
          ) : (
            <md-list>
              {contatos.value.map(c => (
                <md-list-item key={c.email}>
                  <span slot="headline"><strong>{c.nome}</strong> &lt;{c.email}&gt;</span>
                  <span slot="supporting-text">{c.homologado ? '✅ Homologado' : '🔄 Não homologado'}</span>
                  <div slot="end" style="display: flex; gap: 8px;">
                    {!c.homologado && (
                      <md-outlined-button onClick={async () => {
                        await homologarContatoPorPublicKey(c.publicKeyVapid);
                        showToast("Contato homologado!", "success");
                      }}>Homologar</md-outlined-button>
                    )}
                    <md-icon-button onClick={async () => {
                      if (confirm('Remover este contato?')) {
                        await removerContatoPorPublicKey(c.publicKeyVapid);
                      }
                    }}>delete</md-icon-button>
                  </div>
                </md-list-item>
              ))}
            </md-list>
          )}
        </div>
      </div>
    </div>
  );
}
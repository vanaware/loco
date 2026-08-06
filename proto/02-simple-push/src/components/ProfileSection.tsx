// src/components/ProfileSection.tsx
import { profile, profileName, profileEmail, addDebugLog, showToast } from '../signals/state.ts';
import { gerarProfileCompleto } from '../utils/profile-utils.ts';
import { criarJWT } from '../utils/jwt-helpers.ts';
import { cifrarChaveVapid } from '../utils/push-utils.ts';
import { buscarProfile, salvarProfile } from '../utils/db-helpers.ts';

export function ProfileSection() {
  const handleGerar = async () => {
    try {
      const p = await gerarProfileCompleto(profileName.value, profileEmail.value);
      profile.value = p;
      showToast(`✅ Perfil de "${p.name}" gerado/atualizado!`, "success");
      addDebugLog(`✅ Perfil de "${p.name}" gerado/atualizado.`);
    } catch (err: any) {
      addDebugLog(`❌ Erro ao gerar perfil: ${err.message}`);
      showToast(`❌ Erro: ${err.message}`, "error");
    }
  };

  const handleCompartilhar = async () => {
    try {
      // Verifica se o perfil está carregado no signal
      let p = profile.value;
      if (!p) {
        // Tenta buscar do banco
        p = await buscarProfile();
        if (!p) {
          showToast("❌ Perfil não encontrado. Gere um perfil primeiro.", "error");
          addDebugLog("❌ Perfil não encontrado ao tentar compartilhar.");
          return;
        }
        profile.value = p;
      }

      // Recria envelope com chave pública atual do servidor
      const resServerKey = await fetch("/api/server-public-key");
      if (!resServerKey.ok) throw new Error("Erro ao buscar chave do servidor.");
      const serverPublicKeyJwk = await resServerKey.json();
      const novoEnvelope = await cifrarChaveVapid(p.vapidPrivateKeyJwk, serverPublicKeyJwk);
      p.vapidPrivateKeyEnvelope = novoEnvelope;
      p.updatedAt = Date.now();
      await salvarProfile(p);
      profile.value = { ...p };

      const payload = {
        iss: p.email,
        sub: "contact",
        nm: p.name,
        p: p.e2ePublicKey,
        s: {
          endpoint: p.subscription.endpoint,
          keys: p.subscription.keys,
          k: p.vapidPrivateKeyEnvelope
        },
        iat: Math.floor(Date.now() / 1000)
      };
      const jwt = await criarJWT(payload, p.vapidPrivateKeyJwk, { kid: p.vapidPublicKey });
      await navigator.clipboard.writeText(jwt);
      showToast("✅ JWT copiado para a área de transferência!", "success");
      addDebugLog("✅ JWT gerado e copiado.");
    } catch (err: any) {
      addDebugLog(`❌ Erro: ${err.message}`);
      showToast(`❌ ${err.message}`, "error");
    }
  };

  return (
    <div class="container" style="background: #f0f8f4;">
      <h2>👤 Meu Perfil</h2>
      <div class="row">
        <div class="col">
          <md-outlined-text-field
            label="Meu Nome"
            value={profileName.value}
            onInput={(e: any) => profileName.value = e.target.value}
          ></md-outlined-text-field>
        </div>
        <div class="col">
          <md-outlined-text-field
            label="Meu E-mail"
            value={profileEmail.value}
            onInput={(e: any) => profileEmail.value = e.target.value}
          ></md-outlined-text-field>
        </div>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <md-filled-button onClick={handleGerar}>📦 Gerar/Atualizar Perfil</md-filled-button>
        <md-outlined-button onClick={handleCompartilhar}>🔗 Compartilhar Perfil (JWT)</md-outlined-button>
      </div>
      <div class="mt-10">
        <label>📋 Meu Perfil (JSON):</label>
        <div class="profile-field" style="background: #e8f5e9; border-color: #006c4f; white-space: pre-wrap; word-break: break-all;">
          {profile.value ? JSON.stringify(profile.value, null, 2) : 'Clique em "Gerar/Atualizar Perfil"'}
        </div>
      </div>
    </div>
  );
}
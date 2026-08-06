// src/app.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { ProfileSection } from './components/ProfileSection.tsx';
import { ContatosSection } from './components/ContatosSection.tsx';
import { EnviarMensagemSection } from './components/EnviarMensagemSection.tsx';
import { MensagensRecebidasSection } from './components/MensagensRecebidasSection.tsx';
import { DebugPanel } from './components/DebugPanel.tsx';
import { profile, addDebugLog } from './signals/state.ts';
import { buscarProfile } from './utils/db-helpers.ts';

import "@material/web/all.js";
import './styles.css';

function App() {
  useEffect(() => {
    const carregarPerfil = async () => {
      try {
        const p = await buscarProfile();
        if (p) {
          profile.value = p;
          addDebugLog(`✅ Perfil carregado: ${p.name}`);
        } else {
          addDebugLog("ℹ️ Nenhum perfil encontrado. Gere um novo.");
        }
      } catch (err) {
        addDebugLog(`❌ Erro ao carregar perfil: ${err}`);
      }
    };
    carregarPerfil();
  }, []);

  return (
    <div id="app-root">
      <h1>📬 Web Push Descentralizado</h1>
      <p style="color: #666; margin-bottom: 20px;">Compartilhe seu perfil e receba mensagens de forma descentralizada.</p>
      <ProfileSection />
      <ContatosSection />
      <EnviarMensagemSection />
      <MensagensRecebidasSection />
      <DebugPanel />
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
} else {
  console.error("Elemento #app não encontrado.");
}
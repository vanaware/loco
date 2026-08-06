// src/app.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { ProfileSection } from './components/ProfileSection.tsx';
import { ContatosSection } from './components/ContatosSection.tsx';
import { EnviarMensagemSection } from './components/EnviarMensagemSection.tsx';
import { MensagensRecebidasSection } from './components/MensagensRecebidasSection.tsx';
import { DebugPanel } from './components/DebugPanel.tsx';
import { addDebugLog } from './signals/state.ts';
import { initProfileStore, initContatosStore, initMensagensStore } from './stores/index.ts';

import "@material/web/all.js";
import './styles.css';

function App() {
  useEffect(() => {
    const init = async () => {
      await initProfileStore();
      await initContatosStore();
      await initMensagensStore();
      addDebugLog("✅ Stores inicializados");
    };
    init();
  }, []);

  return (
    <div id="app-root">
      <h1>📬 Web Push Descentralizado</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>Compartilhe seu perfil e receba mensagens de forma descentralizada.</p>
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
// src/app.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { ContatosSection } from './components/ContatosSection.tsx';
import { ChatSection } from './components/ChatSection.tsx'; 
import { DebugPanel } from './components/DebugPanel.tsx';
import { addDebugLog, currentMobileView, contatoSelecionado } from './signals/state.ts';
import { profile, initProfileStore, initContatosStore, initMensagensStore, contatosComHash } from './stores/index.ts';

import "@material/web/all.js";
import './styles.css';

function App() {
  const isDebugOpen = useSignal<boolean>(false);

  useEffect(() => {
    const init = async () => {
      await initProfileStore();
      
      if (!profile.value || !profile.value.e2ePrivateKeyJwk || !profile.value.vapidPrivateKeyJwk) {
        window.location.href = '/profile.html';
        return;
      }

      await initContatosStore();
      await initMensagensStore();
      addDebugLog("✅ Stores inicializados");
    };
    init();
  }, []);

  if (!profile.value) {
    return (
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    );
  }

  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;

  const fecharChat = () => {
    currentMobileView.value = 'list';
    contatoSelecionado.value = '';
  };

  return (
    <div id="app-root" class={`view-mode-${currentMobileView.value}`}>
      
      <aside class="app-sidebar">
        <header class="sidebar-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="position: relative;">
              <md-icon-button id="btn-menu" onClick={() => {
                const menu: any = document.getElementById('main-menu');
                if(menu) menu.open = !menu.open;
              }}>
                <md-icon>menu</md-icon>
              </md-icon-button>
              
              {/* 🔥 MENU HAMBÚRGUER COM ABERTURA DO MODAL DE DEBUG */}
              <md-menu id="main-menu" anchor="btn-menu" positioning="popover">
                <md-menu-item onClick={() => isDebugOpen.value = true}>
                  <div slot="headline">Logs de Debug</div>
                  <md-icon slot="start">bug_report</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => window.location.href = '/logout.html'}>
                  <div slot="headline">Sair do App (Logout)</div>
                  <md-icon slot="start">logout</md-icon>
                </md-menu-item>
              </md-menu>
            </div>
            <h1 style="margin: 0; font-size: 1.25rem;">Loco</h1>
          </div>
          
          <md-icon-button onClick={() => window.location.href = '/profile.html'}>
            <md-icon>account_circle</md-icon>
          </md-icon-button>
        </header>
        
        <div class="sidebar-content" style="padding: 0;">
          <div style="padding: 16px; animation: fadeIn 0.3s ease;">
            <ContatosSection />
          </div>
        </div>
      </aside>

      <main class="app-main">
        <header class="chat-header">
          <md-icon-button class="back-button" onClick={fecharChat}>
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          
          <div style="display: flex; align-items: center; gap: 12px;">
            <md-icon style="font-size: 2rem; color: #555;">account_circle</md-icon>
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; line-height: 1.2;">
                {contatoAtivo ? contatoAtivo.nome : "Selecione um contato"}
              </h2>
              <span style="font-size: 0.8rem; color: #666;">
                {contatoAtivo ? contatoAtivo.email : "Inicie uma conversa na barra lateral"}
              </span>
            </div>
          </div>
        </header>

        {contatoSelecionado.value ? (
           <ChatSection /> 
        ) : (
          <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: #888;">
            <div style="text-align: center;">
              <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
              <p>Clique em um contato na barra lateral<br/>para iniciar uma conversa criptografada.</p>
            </div>
          </div>
        )}
      </main>

      {/* 🔥 MODAL DE DEBUG FLUTUANTE INTEGRADO NA INDEX */}
      <md-dialog open={isDebugOpen.value || undefined} onClose={() => isDebugOpen.value = false}>
        <div slot="headline" style="display: flex; align-items: center; gap: 8px;">
          <md-icon>bug_report</md-icon>
          Painel de Inspeção & Logs
        </div>
        <div slot="content" style="padding-top: 8px;">
          <DebugPanel />
        </div>
        <div slot="actions">
          <md-text-button onClick={() => isDebugOpen.value = false}>Fechar</md-text-button>
        </div>
      </md-dialog>

    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
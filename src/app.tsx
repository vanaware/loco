import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import type { ComponentType } from 'preact';

// Componentes da Interface
import { ContatosSection } from './components/ContatosSection.tsx';
import { ChatSection } from './components/ChatSection.tsx'; 
import { ContactDetailSection } from './components/ContactDetailSection.tsx';
import { AdvancedSection } from './components/AdvancedSection.tsx';
import { ProfileSection } from './components/ProfileSection.tsx';
import { LogoutSection } from './components/LogoutSection.tsx';
import { ShareSection } from './components/ShareSection.tsx';
import { SettingsSection } from './components/SettingsSection.tsx';
import { ToastSnackbar } from './components/ToastSnackbar.tsx';

// Signals e Lógica de Negócio
import { addDebugLog, currentMobileView, contatoSelecionado, contatoCompartilharHash, showAdvanced, appTheme, AppTheme } from './signals/state.ts';
import { profile, initProfileStore, initContatosStore, initMensagensStore, contatosComHash } from './stores/index.ts';
import { loadAllConfigs, getConfigValue } from './stores/config-store.ts';

// Roteador Reativo
import { activeView, navigate } from './utils/router.ts';

import "@material/web/all.js";
import './styles.css';

// 🔥 ARQUITETURA: Bind Reativo do Tema com o HTML Document
effect(() => {
  if (typeof document !== 'undefined') {
    const theme = appTheme.value;
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }
});

// Componente de Fallback/Home (Quando não há nada selecionado)
const HomePlaceholder = () => (
  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant);">
    <div style="text-align: center;">
      <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
      <p style="font-size: 0.9rem;">Clique em um contato na barra lateral<br/>para conversar ou ver seu cartão de indicação.</p>
    </div>
  </div>
);

// Dicionário de Rotas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ViewMap: Record<string, ComponentType<any>> = {
  'chat': ChatSection,
  'detail': ContactDetailSection,
  'advanced': AdvancedSection,
  'profile': () => <div style="padding: 16px; display: flex; justify-content: center; overflow-y: auto;"><div style="max-width: 600px; width: 100%;"><ProfileSection/></div></div>,
  'logout': LogoutSection,
  'share': ShareSection,
  'settings': () => <div style="padding: 16px; display: flex; justify-content: center; overflow-y: auto;"><div style="max-width: 600px; width: 100%;"><SettingsSection/></div></div>,
  'home': HomePlaceholder,
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

  // Inicialização assíncrona dos Stores locais e Infraestrutura
  useEffect(() => {
    const init = async () => {
      // Carrega Tema salvo
      const savedTheme = await getConfigValue('APP_THEME');
      if (savedTheme) {
        appTheme.value = savedTheme as AppTheme;
      }

      addDebugLog("info", "SYSTEM", "Verificando roteamento de rede...");
      await loadAllConfigs();

      await initProfileStore();
      
      // Se não tem perfil gerado, e a rota não for perfil, força a rota (Route Guard)
      if ((!profile.value || !profile.value.e2ePrivateKeyJwk) && activeView.value !== 'profile') {
        navigate('#profile');
      }

      await initContatosStore();
      await initMensagensStore();
      addDebugLog("info", "SYSTEM", "✅ Stores e Infraestrutura inicializados");
      setIsLoading(false);
    };
    init();
  }, []);

  if (isLoading) {
    return (
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    );
  }

  // Preparações para o Cabeçalho Responsivo (Header)
  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;
  const contatoDetalhesAtivo = contatosComHash.value.find(c => c.hash === contatoCompartilharHash.value)?.contato;

  const nomeContatoAtivo = contatoAtivo ? (contatoAtivo.name?.trim() || "Anônimo") : "";
  const nomeDetalhesAtivo = contatoDetalhesAtivo ? (contatoDetalhesAtivo.name?.trim() || "Anônimo") : "";

  const fecharAreaPrincipal = () => navigate('');
  
  // Lógica Dinâmica para Títulos e Ícones do Cabeçalho da Área Principal
  let headerTitle = "Loco PWA";
  let headerSubtitle = "";
  let headerIcon = "forum";

  if (activeView.value === 'profile') {
    headerTitle = profile.value ? "Meu Perfil" : "Configurar Conta";
    headerSubtitle = "Gerencie sua identidade local";
    headerIcon = "account_circle";
  } else if (activeView.value === 'logout') {
    headerTitle = "Sair do Sistema";
    headerSubtitle = "Apagar dados locais e chaves";
    headerIcon = "logout";
  } else if (activeView.value === 'share') {
    headerTitle = "Adicionar Contato";
    headerSubtitle = "QR Code ou link";
    headerIcon = "person_add";
  } else if (activeView.value === 'advanced') {
    headerTitle = "Avançado";
    headerSubtitle = "Diagnóstico e Logs";
    headerIcon = "settings_suggest";
  } else if (activeView.value === 'settings') {
    headerTitle = "Configurações";
    headerSubtitle = "Ajustes de Rede e Interface";
    headerIcon = "settings";
  } else if (activeView.value === 'detail') {
    headerTitle = nomeDetalhesAtivo;
    headerSubtitle = "Cartão de Contato";
    headerIcon = "badge";
  } else if (activeView.value === 'chat') {
    headerTitle = contatoAtivo ? nomeContatoAtivo : "Selecione um contato";
    headerSubtitle = contatoAtivo ? (contatoAtivo.email || "Sem e-mail") : "";
    headerIcon = "account_circle";
  }

  const viewToRender = (!profile.value && activeView.value !== 'profile') ? 'profile' : activeView.value;
  const RouteComponent = ViewMap[viewToRender] || ViewMap['home']!;

  return (
    <div id="app-root" class={`view-mode-${currentMobileView.value}`}>
      
      <aside class="app-sidebar">
        <header class="sidebar-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="position: relative;">
              <md-icon-button id="btn-menu" onClick={() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const menu: any = document.getElementById('main-menu');
                if(menu) menu.open = !menu.open;
              }}>
                <md-icon>menu</md-icon>
              </md-icon-button>
              
              <md-menu id="main-menu" anchor="btn-menu" positioning="popover">
                <md-menu-item onClick={() => { navigate('#settings'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Configurações</div>
                  <md-icon slot="start">settings</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => { navigate('#advanced'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Avançado</div>
                  <md-icon slot="start">settings_suggest</md-icon>
                </md-menu-item>
                <md-menu-item onClick={() => { navigate('#logout'); document.getElementById('main-menu')?.removeAttribute('open'); }}>
                  <div slot="headline">Sair do App (Logout)</div>
                  <md-icon slot="start">logout</md-icon>
                </md-menu-item>
              </md-menu>
            </div>
            <h1 style="margin: 0; font-size: 1.25rem;">Loco</h1>
          </div>
          
          <div style="display: flex; gap: 4px;">
            <md-icon-button onClick={() => navigate('#profile')} title="Meu Perfil">
              <md-icon>account_circle</md-icon>
            </md-icon-button>
          </div>
        </header>
        
        <div class="sidebar-content" style="padding: 0;">
          <div style="padding: 12px; animation: fadeIn 0.3s ease;">
            {profile.value ? <ContatosSection/> : <p style="text-align: center; color: var(--md-sys-color-on-surface-variant); margin-top: 40px;">Configure seu perfil primeiro.</p>}
          </div>
        </div>
      </aside>

      <main class="app-main">
        <header class="chat-header">
          <md-icon-button class="back-button" onClick={fecharAreaPrincipal}>
            <md-icon>arrow_back</md-icon>
          </md-icon-button>
          
          <div 
            onClick={() => { if (activeView.value === 'chat' && contatoSelecionado.value) navigate(`#detail=${contatoSelecionado.value}`); }}
            style={`display: flex; align-items: center; gap: 12px; ${activeView.value === 'chat' && contatoAtivo ? 'cursor: pointer;' : ''}`}
          >
            <md-icon style="font-size: 2rem; color: var(--md-sys-color-on-surface-variant);">{headerIcon}</md-icon>
            <div>
              <h2 style="margin: 0; font-size: 1.1rem; line-height: 1.2; display: flex; align-items: center; gap: 6px;">
                {headerTitle}
                
                {((activeView.value === 'detail' && contatoDetalhesAtivo?.trusted) || 
                  (activeView.value === 'chat' && contatoAtivo?.trusted)) && (
                  <md-icon title="Contato Confiável" style="color: var(--md-sys-color-primary); font-size: 1.1rem;">verified</md-icon>
                )}
              </h2>
              {headerSubtitle && <span style="font-size: 0.75rem; color: var(--md-sys-color-on-surface-variant);">{headerSubtitle}</span>}
            </div>
          </div>
        </header>

        <RouteComponent/>

      </main>
      <ToastSnackbar/>
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App/>, root);
}
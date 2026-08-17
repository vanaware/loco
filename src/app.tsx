// src/app.tsx
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
import { isCarregandoContatos } from './stores/contatosStore.ts';
import { loadAllConfigs, getConfigValue } from './stores/config-store.ts';

// Roteador Reativo
import { activeView, navigate } from './utils/router.ts';

import "@material/web";
import './styles.css';

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

const HomePlaceholder = () => (
  <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant);">
    <div style="text-align: center;">
      <md-icon style="font-size: 4rem; opacity: 0.3;">forum</md-icon>
      <p style="font-size: 0.9rem;">Clique em um contato na barra lateral<br/>para conversar ou ver seu cartão de indicação.</p>
    </div>
  </div>
);

// 🔥 ARQUITETURA: Banner não-bloqueante para falhas de rede/push
const PushAlertBanner = () => {
  const p = profile.value;
  const currentView = activeView.value; // 🔥 Truque reativo: Força a re-avaliação do componente ao mudar de tela
  
  // Se o perfil não existe ou não tem nome, não exibe
  if (!p || !p.name) return null;

  const hasEndpoint = !!(p.subscription && p.subscription.endpoint);
  const hasPermission = 'Notification' in window && Notification.permission === 'granted';

  // Se a permissão foi revogada no navegador OU se não tem endpoint salvo, o banner deve aparecer
  if (hasEndpoint && hasPermission) return null;

  return (
    <div style="background: var(--md-sys-color-error-container); color: var(--md-sys-color-on-error-container); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.85rem; z-index: 50; flex-shrink: 0; border-bottom: 1px solid var(--md-sys-color-error);">
      <div style="display: flex; align-items: center; gap: 8px;">
        <md-icon style="color: var(--md-sys-color-error);">notifications_off</md-icon>
        <span><strong>Rede Incompleta:</strong> Você não pode receber notificações ou mensagens diretas.</span>
      </div>
      <md-outlined-button onClick={() => navigate('#advanced')} style="flex-shrink: 0; --md-sys-color-outline: var(--md-sys-color-on-error-container); color: var(--md-sys-color-on-error-container);">
        Corrigir
      </md-outlined-button>
    </div>
  );
};

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

  useEffect(() => {
    const init = async () => {
      const savedTheme = await getConfigValue('APP_THEME');
      if (savedTheme) {
        appTheme.value = savedTheme as AppTheme;
      }

      addDebugLog("info", "SYSTEM", "Verificando roteamento de rede...");
      await loadAllConfigs();

      await initProfileStore();
      
      // 🔥 RECLASSIFICAÇÃO DE IDENTIDADE: Para navegar, basta ter as Chaves VAPID/E2E e o Nome.
      const isIdentityValid = !!(profile.value && profile.value.e2ePrivateKeyJwk && profile.value.name);
      const isRouteAllowedWithoutProfile = ['profile', 'advanced', 'settings', 'logout'].includes(activeView.value);
      
      if (!isIdentityValid && !isRouteAllowedWithoutProfile) {
        navigate('#profile');
      }

      await initContatosStore();
      await initMensagensStore();
      addDebugLog("info", "SYSTEM", "✅ Stores e Infraestrutura inicializados");
      setIsLoading(false);
    };
    init();
  }, []);

  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;
  const contatoDetalhesAtivo = contatosComHash.value.find(c => c.hash === contatoCompartilharHash.value)?.contato;

  useEffect(() => {
    if (!isLoading && !isCarregandoContatos.value && (activeView.value === 'chat' || activeView.value === 'detail')) {
       const hashAlvo = activeView.value === 'chat' ? contatoSelecionado.value : contatoCompartilharHash.value;
       
       if (hashAlvo) {
         const contatoExiste = contatosComHash.value.some(c => c.hash === hashAlvo);
         if (!contatoExiste) {
           addDebugLog("warn", "ROUTER", "Tentativa de acesso a contato inexistente/excluído. Redirecionando para Home.");
           navigate(''); 
         }
       }
    }
  }, [isLoading, isCarregandoContatos.value, activeView.value, contatoSelecionado.value, contatoCompartilharHash.value, contatosComHash.value]);

  if (isLoading) {
    return (
      <div style="display: flex; height: 100vh; justify-content: center; align-items: center;">
        <md-circular-progress indeterminate></md-circular-progress>
      </div>
    );
  }

  const nomeContatoAtivo = contatoAtivo ? (contatoAtivo.name?.trim() || "Anônimo") : "";
  const nomeDetalhesAtivo = contatoDetalhesAtivo ? (contatoDetalhesAtivo.name?.trim() || "Anônimo") : "";

  const fecharAreaPrincipal = () => navigate('');
  
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

  // Permite navegação se a identidade existir, ignorando a falta do endpoint
  const isIdentityValid = !!(profile.value && profile.value.e2ePrivateKeyJwk && profile.value.name);
  const isRouteAllowedWithoutProfile = ['profile', 'advanced', 'settings', 'logout'].includes(activeView.value);
  const viewToRender = (!isIdentityValid && !isRouteAllowedWithoutProfile) ? 'profile' : activeView.value;
  
  const isOrphanChat = (activeView.value === 'chat' && !contatoAtivo) || (activeView.value === 'detail' && !contatoDetalhesAtivo);
  const RouteComponent = isOrphanChat ? ViewMap['home']! : (ViewMap[viewToRender] || ViewMap['home']!);

  return (
    // NOVO WRAPPER: Controla a tela inteira em formato de coluna
    <div style="display: flex; flex-direction: column; height: 100vh; height: 100dvh; width: 100vw; overflow: hidden;">
      
      {/* 🔥 BANNER GLOBAL NO TOPO ABSOLUTO (Ocupa 100% da largura da tela) */}
      <PushAlertBanner />

      <div id="app-root" class={`view-mode-${currentMobileView.value}`} style="flex-grow: 1; display: flex; position: relative; min-height: 0;">
        
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
              {isIdentityValid ? <ContatosSection/> : <p style="text-align: center; color: var(--md-sys-color-on-surface-variant); margin-top: 40px;">Configure seu perfil primeiro.</p>}
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
    </div>
  );

}

const root = document.getElementById('app');
if (root) {
  render(<App/>, root);
}
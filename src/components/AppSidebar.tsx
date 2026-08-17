import { navigate } from '../utils/router.ts';
import { ContatosSection } from './ContatosSection.tsx';

interface AppSidebarProps {
  isIdentityValid: boolean;
}

export function AppSidebar({ isIdentityValid }: AppSidebarProps) {
  return (
    <aside class="app-sidebar">
      <header class="sidebar-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="position: relative;">
            <md-icon-button id="btn-menu" onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const menu: any = document.getElementById('main-menu');
              if (menu) menu.open = !menu.open;
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
  );
}
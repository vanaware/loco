// src/profile.tsx
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { profile, carregarProfile } from './stores/profileStore.ts';
import { ProfileSection } from './components/ProfileSection.tsx';
import { ToastSnackbar } from './components/ToastSnackbar.tsx';

import "@material/web/all.js";
import './styles.css';

function ProfileApp() {
  useEffect(() => {
    carregarProfile();
  }, []);

  const isExistingUser = profile.value !== null;

  return (
    <div style="display: flex; flex-direction: column; align-items: center; min-height: 100vh; height: 100%; overflow-y: auto; padding-bottom: 40px; box-sizing: border-box;">
      
      <header class="sidebar-header" style="width: 100%; max-width: 600px; background: transparent; border: none; padding-top: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          {isExistingUser && (
            <md-icon-button onClick={() => window.location.href = '/'}>
              <md-icon>arrow_back</md-icon>
            </md-icon-button>
          )}
          <h1 style="margin: 0; font-size: 1.5rem; color: var(--md-sys-color-primary);">
            {isExistingUser ? "Meu Perfil" : "Configurar Conta"}
          </h1>
        </div>
      </header>

      <div style="width: 100%; max-width: 600px; padding: 16px; box-sizing: border-box;">
        <ProfileSection />
      </div>

      {/* Exibição não-bloqueante de alertas */}
      <ToastSnackbar />

    </div>
  );
}

const root = document.getElementById('app-profile');
if (root) {
  render(<ProfileApp />, root);
}
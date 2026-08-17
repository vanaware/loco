import { activeView, navigate } from '../utils/router.ts';
import { contatoSelecionado, contatoCompartilharHash } from '../signals/state.ts';
import { profile, contatosComHash } from '../stores/index.ts';

export function MainHeader() {
  const contatoAtivo = contatosComHash.value.find(c => c.hash === contatoSelecionado.value)?.contato;
  const contatoDetalhesAtivo = contatosComHash.value.find(c => c.hash === contatoCompartilharHash.value)?.contato;

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

  return (
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
  );
}
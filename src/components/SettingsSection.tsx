import { useSignal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { loadAllConfigs, saveConfig, resetConfig, CONFIG_KEYS } from '../stores/config-store.ts';
import { showToast } from '../signals/state.ts';
import { navigate } from '../utils/router.ts';
import { buildProxyUrl } from '../constants/config.ts';

export function SettingsSection() {
  const proxyPath = useSignal('');
  const isSaving = useSignal(false);
  const hasChanges = useSignal(false);
  const previewUrls = useSignal({ endpoint: '', publicKey: '', logout: '' });
  
  // Carrega a configuração atual quando o componente monta
  useEffect(() => {
    const load = async () => {
      const config = await loadAllConfigs();
      proxyPath.value = config.proxy_path || '';
      // Atualiza preview das URLs
      previewUrls.value = {
        endpoint: await buildProxyUrl('/'),
        publicKey: await buildProxyUrl('/publickey'),
        logout: await buildProxyUrl('/logout')
      };
    };
    load();
  }, []);
  
  // Atualiza preview quando proxyPath muda
  useEffect(() => {
    const updatePreview = async () => {
      previewUrls.value = {
        endpoint: await buildProxyUrl('/'),
        publicKey: await buildProxyUrl('/publickey'),
        logout: await buildProxyUrl('/logout')
      };
    };
    updatePreview();
  }, [proxyPath.value]);
  
  // Detecta mudanças no campo
  const handleProxyPathChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    proxyPath.value = target.value;
    hasChanges.value = true;
  };
  
  // Valida se a URL é válida
  const validateProxyPath = (path: string): boolean => {
    if (!path || path.trim() === '') return true; // Vazio é válido (usa raiz relativa)
    
    // URLs absolutas devem começar com http:// ou https://
    if (path.startsWith('http://') || path.startsWith('https://')) {
      try {
        new URL(path);
        return true;
      } catch {
        return false;
      }
    }
    
    // Caminhos relativos podem começar com ./ ou ../
    if (path.startsWith('./') || path.startsWith('../')) {
      return true;
    }
    
    // Caminhos absolutos começam com /
    if (path.startsWith('/')) {
      return true;
    }
    
    return false;
  };
  
  const handleSalvar = async () => {
    const path = proxyPath.value.trim();
    
    if (!validateProxyPath(path)) {
      showToast('❌ Formato de Proxy Path inválido. Use URL completa (https://...), caminho absoluto (/...) ou relativo (./...)', 'error');
      return;
    }
    
    isSaving.value = true;
    
    try {
      await saveConfig('PROXY_PATH', path);
      
      // Testa a URL construída
      const testUrl = await buildProxyUrl('/test');
      console.log('✅ Proxy configurado:', path);
      console.log('📍 URL de teste gerada:', testUrl);
      
      showToast(`✅ Configuração salva!${path ? ` Proxy: ${path}` : ' (usando raiz relativa)'}`, 'success');
      hasChanges.value = false;
      
      // Recarrega diagnósticos se estiver na tela de avançado
      window.dispatchEvent(new CustomEvent('config-updated'));
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      showToast('❌ Erro ao salvar configuração. Verifique o console.', 'error');
    } finally {
      isSaving.value = false;
    }
  };
  
  const handleReset = async () => {
    if (!confirm('Tem certeza que deseja resetar todas as configurações para o padrão?')) {
      return;
    }
    
    try {
      await resetConfig();
      proxyPath.value = '';
      hasChanges.value = false;
      showToast('✅ Configurações resetadas para o padrão', 'success');
      window.dispatchEvent(new CustomEvent('config-updated'));
    } catch (error) {
      console.error('Erro ao resetar configuração:', error);
      showToast('❌ Erro ao resetar configuração', 'error');
    }
  };
  
  const handleCancelar = () => {
    // Recarrega o valor original
    loadAllConfigs().then(config => {
      proxyPath.value = config.proxy_path || '';
      hasChanges.value = false;
      showToast('Alterações descartadas', 'info');
    });
  };
  
  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 600px; width: 100%;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 1rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <md-icon>settings</md-icon> Configurações
            </span>
            <span style="font-size: 0.75rem; color: #888; margin-left: 30px;">
              Configure o servidor Push Proxy
            </span>
          </div>
          <md-icon-button onClick={() => navigate('')} title="Fechar Configurações">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          
          {/* Campo Proxy Path */}
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="proxy-path" style="font-size: 0.9rem; font-weight: 600; color: var(--md-sys-color-on-surface);">
              Proxy Path
            </label>
            <md-outlined-text-field
              id="proxy-path"
              value={proxyPath.value}
              onInput={handleProxyPathChange}
              placeholder="Ex: https://push.vanaware.com ou ./api"
              style="width: 100%;"
              disabled={isSaving.value}
            >
              <md-icon slot="leading-icon">link</md-icon>
            </md-outlined-text-field>
            <span style="font-size: 0.75rem; color: #666;">
              Define o endpoint do servidor push. Pode ser uma URL completa, caminho absoluto ou relativo.
            </span>
          </div>
          
          {/* Preview da URL gerada */}
          <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--md-sys-color-secondary);">
              🔍 Preview das URLs geradas:
            </span>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem;">
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 100px;">Endpoint:</span>
                <code style="color: #444;">{previewUrls.value.endpoint}</code>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 100px;">Public Key:</span>
                <code style="color: #444;">{previewUrls.value.publicKey}</code>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 100px;">Logout:</span>
                <code style="color: #444;">{previewUrls.value.logout}</code>
              </div>
            </div>
          </div>
          
          {/* Ações */}
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
            <md-outlined-button 
              onClick={handleCancelar} 
              disabled={!hasChanges.value || isSaving.value}
            >
              Cancelar
            </md-outlined-button>
            
            <md-outlined-button 
              onClick={handleReset} 
              disabled={isSaving.value}
              style="color: var(--md-sys-color-error);"
            >
              Resetar Padrão
            </md-outlined-button>
            
            <md-filled-button 
              onClick={handleSalvar} 
              disabled={!hasChanges.value || isSaving.value}
            >
              {isSaving.value ? (
                <md-circular-progress indeterminate style="width: 20px; height: 20px;"></md-circular-progress>
              ) : (
                <>
                  <md-icon slot="icon">save</md-icon>
                  Salvar
                </>
              )}
            </md-filled-button>
          </div>
          
        </div>
      </div>
    </div>
  );
}

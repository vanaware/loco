import { useSignal, computed } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { loadAllConfigs, saveConfig, resetConfig } from '../stores/config-store.ts';
import { showToast } from '../signals/state.ts';
import { navigate } from '../utils/router.ts';
import { buildProxyUrl, pingProxy } from '../constants/config.ts';

export function SettingsSection() {
  const proxyPath = useSignal('');
  const isSaving = useSignal(false);
  const isTesting = useSignal(false);
  const hasChanges = useSignal(false);
  const serverStatus = useSignal<'unknown' | 'ok' | 'error'>('unknown');
  const previewUrls = useSignal({ endpoint: '', publicKey: '', logout: '' });
  
  useEffect(() => {
    const load = async () => {
      const config = await loadAllConfigs();
      proxyPath.value = config.proxy_path || '';
      await updatePreview(config.proxy_path || '');
    };
    load();
  }, []);
  
  const updatePreview = async (path: string) => {
    previewUrls.value = {
      endpoint: await buildProxyUrl('/', path),
      publicKey: await buildProxyUrl('/publickey', path),
      logout: await buildProxyUrl('/logout', path)
    };
    serverStatus.value = 'unknown'; // reseta status visual ao digitar
  };

  const handleProxyPathChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    proxyPath.value = target.value;
    hasChanges.value = true;
    updatePreview(target.value);
  };
  
  const handleTestarConexao = async () => {
    isTesting.value = true;
    const path = proxyPath.value.trim() === '' ? '/' : proxyPath.value.trim();
    
    try {
      const isAlive = await pingProxy(path);
      if (isAlive) {
        serverStatus.value = 'ok';
        showToast('✅ Servidor detectado com sucesso!', 'success');
      } else {
        serverStatus.value = 'error';
        showToast('❌ Servidor não respondeu ou não é um Loco Proxy.', 'error');
      }
    } catch {
      serverStatus.value = 'error';
      showToast('❌ Falha na conexão de rede.', 'error');
    } finally {
      isTesting.value = false;
    }
  };

  const handleSalvar = async () => {
    const path = proxyPath.value.trim() === '' ? '/' : proxyPath.value.trim();
    isSaving.value = true;
    
    try {
      // Opcional: Impedir salvar se o ping falhar, mas vamos ser permissivos
      // e só avisar, vai que o usuário está offline na hora.
      await saveConfig('PROXY_PATH', path);
      showToast(`✅ Configuração salva: ${path}`, 'success');
      hasChanges.value = false;
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
      const config = await loadAllConfigs(); // engatilha auto-discovery
      proxyPath.value = config.proxy_path || '/';
      hasChanges.value = false;
      serverStatus.value = 'unknown';
      showToast('✅ Auto-Discovery resetado', 'success');
      window.dispatchEvent(new CustomEvent('config-updated'));
    } catch (error) {
      showToast('❌ Erro ao resetar', 'error');
    }
  };
  
  const handleCancelar = () => {
    loadAllConfigs().then(config => {
      proxyPath.value = config.proxy_path || '';
      hasChanges.value = false;
      serverStatus.value = 'unknown';
      showToast('Alterações descartadas', 'info');
    });
  };
  
  return (
    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 24px; overflow-y: auto;">
      <div class="container" style="background: var(--md-sys-color-surface); max-width: 600px; width: 100%;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; flex-direction: column;">
            <span style="font-size: 1rem; color: var(--md-sys-color-primary); font-weight: 600; display: flex; align-items: center; gap: 6px;">
              <md-icon>settings</md-icon> Configurações de Rede
            </span>
            <span style="font-size: 0.75rem; color: #888; margin-left: 30px;">
              Ajuste o Roteamento de Mensagens
            </span>
          </div>
          <md-icon-button onClick={() => navigate('')} title="Fechar Configurações">
            <md-icon>close</md-icon>
          </md-icon-button>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 16px;">
          
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="proxy-path" style="font-size: 0.9rem; font-weight: 600; color: var(--md-sys-color-on-surface); display: flex; justify-content: space-between; align-items: center;">
              Servidor Proxy
              {serverStatus.value === 'ok' && <span style="color: green; font-size: 0.75rem; font-weight: bold;">(Online)</span>}
              {serverStatus.value === 'error' && <span style="color: red; font-size: 0.75rem; font-weight: bold;">(Offline)</span>}
            </label>
            <div style="display: flex; gap: 8px;">
              <md-outlined-text-field
                id="proxy-path"
                value={proxyPath.value}
                onInput={handleProxyPathChange}
                placeholder="Ex: /, /api ou https://push.com"
                style="flex-grow: 1;"
                disabled={isSaving.value || isTesting.value}
              >
                <md-icon slot="leading-icon">dns</md-icon>
              </md-outlined-text-field>
              
              <md-filled-tonal-button onClick={handleTestarConexao} disabled={isTesting.value || isSaving.value} style="height: 56px;">
                 {isTesting.value ? '...' : 'Testar'}
              </md-filled-tonal-button>
            </div>
            <span style="font-size: 0.75rem; color: #666;">
              Se o PWA foi instalado via GitHub Pages ou IPFS e não possui um servidor nativo, informe a URL absoluta de um Worker ativo do Loco.
            </span>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px; background: rgba(0,0,0,0.03); border-radius: 8px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--md-sys-color-secondary);">
              🔍 Resolução Dinâmica (Preview):
            </span>
            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.75rem;">
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 80px;">Push URL:</span>
                <code style="color: #444;">{previewUrls.value.endpoint}</code>
              </div>
              <div style="display: flex; gap: 8px;">
                <span style="color: #666; min-width: 80px;">Ping Test:</span>
                <code style="color: #444;">{previewUrls.value.endpoint}/ping</code>
              </div>
            </div>
          </div>
          
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;">
            <md-outlined-button onClick={handleCancelar} disabled={!hasChanges.value || isSaving.value || isTesting.value}>
              Cancelar
            </md-outlined-button>
            
            <md-outlined-button onClick={handleReset} disabled={isSaving.value || isTesting.value} style="color: var(--md-sys-color-error);">
              Auto-Discovery
            </md-outlined-button>
            
            <md-filled-button onClick={handleSalvar} disabled={!hasChanges.value || isSaving.value || isTesting.value}>
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
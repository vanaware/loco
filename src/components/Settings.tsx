import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import {
  appConfig, updateConfig, contacts, updateContactSettings,
  hasBiometricSupport, storage,
} from "../store.ts";
import { createBackup, restoreBackup, type BackupOptions } from "../utils/backup.ts";
import { formatBytes } from "../utils/storage.ts";
import { detectCapabilities } from "../utils/capabilities.ts";

export function Settings() {
  const selectedContact = signal<string | null>(null);
  const backupOptions = signal<BackupOptions>({
    profile: true,
    config: true,
    contacts: true,
    conversations: true,
    files: false,
  });
  const isProcessing = signal(false);

  const contactsMap = contacts.value;
  const config = appConfig.value;
  const caps = detectCapabilities();
  const storageStatus = storage.value;

  const handleEncryptToggle = (checked: boolean) => {
    if (checked && !hasBiometricSupport.value) {
      alert("Dispositivo não suporta criptografia biométrica.");
      return;
    }
    updateConfig({ encryptMessages: checked });
  };

  const handleCreateBackup = async () => {
    isProcessing.value = true;
    try {
      const blob = await createBackup(backupOptions.value);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loco-backup-${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Erro: " + e);
    } finally {
      isProcessing.value = false;
    }
  };

  const handleRestoreBackup = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !confirm("⚠️ Substituir TODOS os dados?")) return;
    isProcessing.value = true;
    try {
      const manifest = await restoreBackup(file);
      alert(`✅ Restaurado! Versão: ${manifest.version}. Recarregue a página.`);
    } catch (e) {
      alert("Erro: " + e);
    } finally {
      isProcessing.value = false;
    }
  };

  return (
    <div class="settings-section">
      {/* Proteção de Armazenamento */}
      <md-elevated-card>
        <div class="settings-card">
          <h3>🛡️ Proteção de Armazenamento</h3>
          <div class="storage-status">
            <md-icon style={`color: ${storageStatus.persisted ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)"}`}>
              {storageStatus.persisted ? "verified" : "warning"}
            </md-icon>
            <div>
              <div style="font:var(--md-sys-typescale-title-medium);">
                {storageStatus.persisted ? "Protegido" : "Não Protegido"}
              </div>
              <div style="font-size:0.75rem; color:var(--md-sys-color-on-surface-variant);">
                Modo: {storageStatus.mode}
              </div>
            </div>
          </div>

          <div style="margin-top:1rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
              <span style="font:var(--md-sys-typescale-body-medium);">
                {formatBytes(storageStatus.usage)} usado
              </span>
              <span style="font:var(--md-sys-typescale-body-medium);">
                {formatBytes(storageStatus.quota)} disponível
              </span>
            </div>
            <md-linear-progress value={storageStatus.percentUsed} />
            <div style="text-align:right; font-size:0.75rem; margin-top:0.25rem;">
              {(storageStatus.percentUsed * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </md-elevated-card>

      {/* Configurações Gerais */}
      <md-elevated-card>
        <div class="settings-card">
          <h3>⚙️ Configurações Gerais</h3>
          <div class="toggle-row">
            <span class="toggle-label">🔕 Não Perturbe</span>
            <md-switch
              selected={config.doNotDisturb}
              onClick={() => updateConfig({ doNotDisturb: !config.doNotDisturb })}
            />
          </div>
          <div class="toggle-row">
            <span class="toggle-label">📍 Compartilhar localização</span>
            <md-switch
              selected={config.globalLocationSharing}
              onClick={() => updateConfig({ globalLocationSharing: !config.globalLocationSharing })}
            />
          </div>
          <div class="toggle-row">
            <span class="toggle-label">🔒 Criptografar mensagens</span>
            <md-switch
              selected={config.encryptMessages}
              onClick={() => handleEncryptToggle(!config.encryptMessages)}
            />
          </div>
        </div>
      </md-elevated-card>

      {/* Capacidades PWA */}
      <md-elevated-card>
        <div class="settings-card">
          <h3>🧪 Capacidades PWA</h3>
          <md-list>
            {Object.entries(caps).map(([key, supported]) => (
              <md-list-item>
                <md-icon slot="start" style={`color:${supported ? "var(--md-sys-color-primary)" : "var(--md-sys-color-error)"}`}>
                  {supported ? "check_circle" : "cancel"}
                </md-icon>
                <div slot="headline">{formatCapName(key)}</div>
                <div slot="supporting-text">{supported ? "Disponível" : "Não disponível"}</div>
              </md-list-item>
            ))}
          </md-list>
        </div>
      </md-elevated-card>

      {/* Backup */}
      <md-elevated-card>
        <div class="settings-card">
          <h3>💾 Backup e Restauração</h3>
          <md-list>
            {(["profile", "config", "contacts", "conversations", "files"] as const).map((key) => (
              <md-list-item>
                <md-checkbox
                  slot="start"
                  checked={backupOptions.value[key]}
                  onClick={() =>
                    (backupOptions.value = { ...backupOptions.value, [key]: !backupOptions.value[key] })
                  }
                />
                <div slot="headline">{backupLabel(key)}</div>
              </md-list-item>
            ))}
          </md-list>
          <div style="display:flex; gap:0.5rem; margin-top:1rem;">
            <md-filled-button onClick={handleCreateBackup} style="flex:1;">
              {isProcessing.value ? "Processando..." : "📥 Criar Backup"}
            </md-filled-button>
            <md-outlined-button
              onClick={() => document.getElementById("restoreInput")?.click()}
              style="flex:1;"
            >
              📤 Restaurar
            </md-outlined-button>
            <input
              id="restoreInput"
              type="file"
              accept=".zip"
              style="display:none"
              onChange={handleRestoreBackup}
            />
          </div>
        </div>
      </md-elevated-card>

      {/* Por Contato */}
      <md-elevated-card>
        <div class="settings-card">
          <h3>👥 Configurações por Contato</h3>
          <md-filled-text-field
            label="Selecione um contato"
            style="width:100%;"
          />
          {contactsMap.size > 0 && (
            <md-list style="margin-top:1rem;">
              {[...contactsMap.entries()].map(([id, c]) => (
                <md-list-item onClick={() => (selectedContact.value = id)}>
                  <div slot="headline">{c.displayName}</div>
                  <div slot="supporting-text">
                    {selectedContact.value === id ? "Selecionado" : "Clique para selecionar"}
                  </div>
                </md-list-item>
              ))}
            </md-list>
          )}

          {selectedContact.value && (
            <md-list>
              <md-list-item>
                <md-checkbox
                  slot="start"
                  checked={contactsMap.get(selectedContact.value)?.allowLocation || false}
                  onClick={() =>
                    updateContactSettings(selectedContact.value!, {
                      allowLocation: !contactsMap.get(selectedContact.value)?.allowLocation,
                    })
                  }
                />
                <div slot="headline">📍 Permitir localização</div>
              </md-list-item>
              <md-list-item>
                <md-checkbox
                  slot="start"
                  checked={contactsMap.get(selectedContact.value)?.encryptMessages || false}
                  onClick={() =>
                    updateContactSettings(selectedContact.value!, {
                      encryptMessages: !contactsMap.get(selectedContact.value)?.encryptMessages,
                    })
                  }
                />
                <div slot="headline">🔒 Criptografar mensagens</div>
              </md-list-item>
            </md-list>
          )}
        </div>
      </md-elevated-card>
    </div>
  );
}

function formatCapName(key: string): string {
  const names: Record<string, string> = {
    opfs: "📁 OPFS",
    fileSystemAccess: "💾 File System Access",
    shareTarget: "📤 Share Target",
    contactPicker: "👥 Contact Picker",
    barcodeDetector: "📷 Barcode Detection",
    declarativePush: "🔔 Declarative Push",
    appBadging: "🔢 App Badging",
    screenWakeLock: "☀️ Wake Lock",
    viewTransitions: "✨ View Transitions",
    webCodecs: "🎬 WebCodecs",
    pipVideo: "📺 Video PiP",
    pipDocument: "🖥️ Document PiP",
    appShortcuts: "⚡ App Shortcuts",
    virtualKeyboard: "⌨️ Virtual Keyboard",
    backgroundSync: "🔄 Background Sync",
    windowControlsOverlay: "🪟 Window Controls",
    storagePersist: "🛡️ Storage Persist",
  };
  return names[key] || key;
}

function backupLabel(key: string): string {
  const labels: Record<string, string> = {
    profile: "👤 Perfil e Identidade",
    config: "⚙️ Configurações",
    contacts: "👥 Contatos",
    conversations: "💬 Conversas",
    files: "📎 Arquivos (aumenta tamanho)",
  };
  return labels[key] || key;
}

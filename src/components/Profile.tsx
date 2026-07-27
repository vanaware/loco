import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import {
  appConfig,
  generateQRCode,
  getShareLink,
  myDisplayName,
  qrCodeDataUrl,
  renewIdentity,
  uploadProfilePhoto,
} from "../store.ts";
import { detectCapabilities } from "../utils/capabilities.ts";

export function Profile() {
  const nameInput = signal(myDisplayName.value);

  useEffect(() => {
    generateQRCode();
  }, []);

  const handlePhotoUpload = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      await uploadProfilePhoto(file);
    } catch {
      alert("Erro ao processar foto.");
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: "Meu ID P2P", url: getShareLink() });
    } else {
      navigator.clipboard.writeText(getShareLink());
      alert("Link copiado!");
    }
  };

  const caps = detectCapabilities();

  return (
    <div class="profile-section">
      <md-elevated-card>
        <div class="profile-card">
          <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1.5rem;">
            👤 Seu Perfil
          </h3>
          <div class="profile-photo">
            {appConfig.value.profilePhoto
              ? <img src={appConfig.value.profilePhoto} alt="Foto" />
              : <div class="photo-placeholder">📷</div>}
            <div style="margin-top:1rem;">
              <md-filled-tonal-button
                onClick={() => document.getElementById("photoUpload")?.click()}
              >
                <md-icon slot="icon">photo_camera</md-icon>
                Alterar Foto
              </md-filled-tonal-button>
              <input
                id="photoUpload"
                type="file"
                accept="image/*"
                style="display:none"
                onChange={handlePhotoUpload}
              />
            </div>
          </div>
          <md-filled-text-field
            label="Nome"
            value={nameInput.value}
            onInput={(e: InputEvent) => {
              const value = (e.target as HTMLInputElement).value;
              nameInput.value = value;
              myDisplayName.value = value;
              generateQRCode();
            }}
            style="width:100%;"
          />
        </div>
      </md-elevated-card>

      <md-elevated-card>
        <div class="profile-card" style="text-align:center;">
          <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1rem;">
            📲 Adicionar Contato
          </h3>
          {qrCodeDataUrl.value
            ? (
              <img
                src={qrCodeDataUrl.value}
                alt="QR Code"
                style="border-radius:1rem; margin:1rem 0;"
              />
            )
            : <md-circular-progress indeterminate />}
          <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
            <md-filled-button onClick={handleShare}>
              <md-icon slot="icon">share</md-icon>
              Compartilhar Link
            </md-filled-button>
          </div>
        </div>
      </md-elevated-card>

      {caps.barcodeDetector && (
        <md-elevated-card>
          <div class="profile-card">
            <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1rem;">
              📷 Escanear QR Code
            </h3>
            <p style="color:var(--md-sys-color-on-surface-variant);">
              Barcode Detection API disponível neste navegador.
            </p>
          </div>
        </md-elevated-card>
      )}

      <md-elevated-card>
        <div class="profile-card" style="border: 1px solid var(--md-sys-color-error);">
          <h3 style="font:var(--md-sys-typescale-title-large); margin-bottom:1rem; color:var(--md-sys-color-error);">
            ⚠️ Renovar Identidade
          </h3>
          <p style="color:var(--md-sys-color-on-surface-variant); margin-bottom:1rem;">
            Isso irá gerar um novo ID, novas chaves VAPID, limpar todos os contatos, conversas e arquivos, e re-registrar o Service Worker.
            <strong>Esta ação não pode ser desfeita.</strong>
          </p>
          <md-filled-button
            onClick={async () => {
              if (confirm("Tem certeza que deseja renovar sua identidade? Todos os dados serão perdidos.")) {
                await renewIdentity();
              }
            }}
            style="--md-sys-color-primary: var(--md-sys-color-error);"
          >
            <md-icon slot="icon">refresh</md-icon>
            Renovar Identidade
          </md-filled-button>
        </div>
      </md-elevated-card>
    </div>
  );
}

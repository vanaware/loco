export function About() {
  return (
    <div class="settings-section">
      <md-elevated-card>
        <div class="settings-card">
          <h3 style="font:var(--md-sys-typescale-headline-medium); margin-bottom:1rem;">
            ℹ️ Sobre o Push P2P Chat
          </h3>

          <div style="font:var(--md-sys-typescale-body-large); line-height:1.6;">
            <p><strong>Versão:</strong> 1.0.0</p>
            <p style="margin-top:1rem;">
              Um mensageiro descentralizado que usa Web Push e WebRTC para comunicação
              direta entre navegadores, sem servidores intermediários.
            </p>

            <h4 style="font:var(--md-sys-typescale-title-medium); margin-top:1.5rem; margin-bottom:0.5rem;">
              Recursos:
            </h4>
            <md-list>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Mensagens de texto criptografadas</div>
              </md-list-item>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Transferência P2P de arquivos (WebTorrent)</div>
              </md-list-item>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Compartilhamento de localização</div>
              </md-list-item>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Armazenamento OPFS persistente</div>
              </md-list-item>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Backup e restauração completa</div>
              </md-list-item>
              <md-list-item>
                <md-icon slot="start">check</md-icon>
                <div slot="headline">Exclusão granular de arquivos</div>
              </md-list-item>
            </md-list>

            <h4 style="font:var(--md-sys-typescale-title-medium); margin-top:1.5rem; margin-bottom:0.5rem;">
              Privacidade:
            </h4>
            <p>
              Todas as mensagens são criptografadas localmente. Nenhum dado passa por
              servidores externos. Armazenamento protegido contra evicção automática.
            </p>
          </div>
        </div>
      </md-elevated-card>
    </div>
  );
}

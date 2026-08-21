import {
  themeModeSignal,
  themeColorSignal,
  setThemeMode,
  setThemeColor,
  PRESET_COLORS,
} from "../store/themeStore.ts";

export function SettingsView() {
  const currentTheme = themeModeSignal.value;
  const currentColor = themeColorSignal.value;

  return (
    <>
        <header className="margin-bottom">
          <h4 className="bold margin-none">Ajustes e Segurança</h4>
          <p className="text-secondary">
            Gerenciamento de tema, paleta dinamicamente injetada, par de chaves ECDH e armazenamento local.
          </p>
        </header>

        {/* MODO DE ILUMINAÇÃO */}
        <article className="small-round padding border">
          <div className="row">
            <i>contrast</i>
            <div className="max">
              <h6>Modo de Exibição</h6>
              <p className="small-text text-secondary">
                Controle a iluminação da interface ou sincronize com o sistema.
              </p>
            </div>
          </div>

          <nav className="group connected">
            <button
              className={currentTheme === "light" ? "active" : ""}
              onClick={() => setThemeMode("light")}
            >
              <i>light_mode</i>
              <span>Claro</span>
            </button>

            <button
              className={currentTheme === "dark" ? "active" : ""}
              onClick={() => setThemeMode("dark")}
            >
              <i>dark_mode</i>
              <span>Escuro</span>
            </button>

            <button
              className={currentTheme === "auto" ? "active" : ""}
              onClick={() => setThemeMode("auto")}
            >
              <i>settings_brightness</i>
              <span>Sistema</span>
            </button>
          </nav>
        </article>

        {/* PALETA MATERIAL YOU */}
        <article className="small-round padding border">
          <div className="row">
            <i>palette</i>
            <div className="max">
              <h6>Cor de Destaque (Material You)</h6>
              <p className="small-text text-secondary">
                Gere toda a paleta tonal da interface dinamicamente via BeerCSS.
              </p>
            </div>
          </div>

          <nav className="group connected">
            {PRESET_COLORS.map((preset) => {
              const isSelected = currentColor === preset.hex;
              return (
                <button
                  key={preset.hex}
                  className={`chip ${isSelected ? "fill" : "border"}`}
                  onClick={() => setThemeColor(preset.hex)}
                >
                  <span
                    className="circle tiny margin-right-small"
                    style={{ backgroundColor: preset.hex }}
                  ></span>
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </nav>
        </article>

        {/* CRIPTOGRAFIA */}
        <article className="small-round padding border">
          <div className="row">
            <i>key</i>
            <div className="max">
              <h6>Par de Chaves E2EE</h6>
              <p className="small-text">
                Algoritmo ECDH (P-256) gerado localmente via WebCrypto API.
              </p>
            </div>
            <button className="border round">Renovar Chaves</button>
          </div>
        </article>

        {/* ARMAZENAMENTO LOCAL */}

        <article className="small-round padding border">
          <div className="row">
            <i>database</i>
            <div className="max">
              <h6>Armazenamento Local</h6>
              <p className="small-text">
                Sincronização assíncrona via IndexedDB &amp; Service Worker.
              </p>
            </div>
            <button className="border small-round">Limpar Cache</button>
          </div>
        </article>

    </>
  );
}
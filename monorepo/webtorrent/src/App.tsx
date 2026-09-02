// Arquivo: monorepo/webtorrent/src/App.tsx
import { useEffect } from "preact/hooks";
import {
  localId,
  swarmStatus,
  peers,
  logs,
  contactKey,
  monitoring,
  swStatus,
  init,
  registerSW,
  startSwarm,
  stopSwarm,
  monitorContact,
  stopMonitoring,
  regenerate,
} from "./store.ts";

export function App() {
  useEffect(() => {
    init();
    registerSW();
  }, []);

  const statusIcon = swarmStatus.value === "on"
    ? "check_circle"
    : swarmStatus.value === "connecting"
    ? "hourglass_empty"
    : "cancel";

  const swReady = swStatus.value === "activated";

  return (
    <main className="responsive">
      <nav className="left l">
        <h5 className="max padding">🧪 WebTorrent</h5>
        <a className="active">
          <i>science</i>
          <div>Teste de Presença</div>
        </a>
      </nav>
      <nav className="bottom s">
        <a className="active">
          <i>science</i>
          <div>Teste</div>
        </a>
      </nav>
      <article className="surface-container-low padding max">
        <header>
          <h3 className="bold">Teste de Presença WebTorrent</h3>
          <p className="text-secondary">
            Validação de mecanismo P2P para detecção de presença online
          </p>
        </header>

        {/* Status do Service Worker */}
        <section className="padding">
          <h5>1. Infraestrutura (Service Worker)</h5>
          <div className={`chip margin-top ${swReady ? "success" : "warning"}`}>
            <i>{swReady ? "check_circle" : "hourglass_empty"}</i>
            <span>SW Status: {swStatus.value}</span>
          </div>
          {!swReady && (
            <p className="small-text text-secondary margin-top">
              O Service Worker é obrigatório para o servidor interno do WebTorrent interceptar requisições e gerenciar os streams P2P.
            </p>
          )}
        </section>

        {/* Identidade Local */}
        <section className="padding">
          <h5>2. Identidade Local</h5>
          {localId.value ? (
            <>
              <div className="field prefix round border">
                <i>fingerprint</i>
                <div className="max">
                  <label>Chave Pública</label>
                  <pre className="small-text">{localId.value.publicKey}</pre>
                </div>
              </div>
              <div className="field prefix round border">
                <i>tag</i>
                <div className="max">
                  <label>InfoHash (Swarm)</label>
                  <pre className="small-text">{localId.value.infoHash}</pre>
                </div>
              </div>
            </>
          ) : (
            <progress className="circle large" />
          )}
          <nav className="row margin-top">
            <button className="button border round" onClick={regenerate}>
              <i>refresh</i>
              <span>Nova Identidade</span>
            </button>
            {swarmStatus.value === "off" ? (
              <button className="button fill round" onClick={startSwarm} disabled={!swReady}>
                <i>play_arrow</i>
                <span>Entrar no Swarm</span>
              </button>
            ) : (
              <button className="button border round" onClick={stopSwarm}>
                <i>stop</i>
                <span>Sair do Swarm</span>
              </button>
            )}
          </nav>
          <div className="chip margin-top">
            <i className={swarmStatus.value === "on" ? "success" : swarmStatus.value === "connecting" ? "warning" : "error"}>
              {statusIcon}
            </i>
            <span>
              {swarmStatus.value === "on"
                ? "Conectado"
                : swarmStatus.value === "connecting"
                ? "Conectando..."
                : "Desconectado"}
            </span>
          </div>
        </section>

        {/* Monitorar Contato */}
        <section className="padding">
          <h5>3. Monitorar Contato</h5>
          <div className="field prefix round fill">
            <i>person_search</i>
            <input
              type="text"
              placeholder="Cole a chave pública do contato aqui..."
              value={contactKey.value}
              onInput={(e) => {
                contactKey.value = (e.target as HTMLInputElement).value.trim();
              }}
            />
          </div>
          <nav className="row margin-top">
            {!monitoring.value ? (
              <button
                className="button fill round"
                onClick={monitorContact}
                disabled={contactKey.value.length < 40 || swarmStatus.value === "off" || !swReady}
              >
                <i>visibility</i>
                <span>Monitorar</span>
              </button>
            ) : (
              <button className="button border round" onClick={stopMonitoring}>
                <i>visibility_off</i>
                <span>Parar</span>
              </button>
            )}
          </nav>
        </section>

        {/* Peers Detectados */}
        <section className="padding">
          <h5>4. Peers Detectados ({peers.value.length})</h5>
          {peers.value.length === 0 ? (
            <p className="text-secondary">Nenhum peer detectado ainda.</p>
          ) : (
            <ul className="list">
              {peers.value.map((peer) => (
                <li key={peer.id} className="row middle-align padding">
                  <i className={peer.status === "online" ? "success" : "error"}>
                    {peer.status === "online" ? "circle" : "cancel"}
                  </i>
                  <div className="max margin-left">
                    <div className="bold">{peer.id.slice(0, 20)}...</div>
                    <div className="small-text text-secondary">
                      {peer.status === "online"
                        ? `Online há ${Math.round((Date.now() - peer.joinedAt) / 1000)}s`
                        : `Offline`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Logs */}
        <section className="padding">
          <h5>5. Logs</h5>
          <div className="card surface-container-high padding">
            <div className="scroll" style={{ maxHeight: "300px" }}>
              {logs.value.length === 0 ? (
                <p className="text-secondary">Aguardando eventos...</p>
              ) : (
                <pre className="small-text">
                  {logs.value.map((log, i) => (
                    <div key={i} className={log.startsWith("❌") ? "error" : ""}>
                      {log}
                    </div>
                  ))}
                </pre>
              )}
            </div>
            <button
              className="button border round margin-top"
              onClick={() => { logs.value = []; }}
            >
              <i>delete</i>
              <span>Limpar</span>
            </button>
          </div>
        </section>
      </article>
    </main>
  );
}
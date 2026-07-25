import { transferState, cancelTransfer } from "../store.ts";
import { formatBytes } from "../utils/storage.ts";

export function TransferDock() {
  const state = transferState.value;

  if (!state.isActive && state.status === "idle") return null;

  const isComplete = state.status === "completed";
  const isError = state.status === "error";

  return (
    <div
      style={`
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--md-sys-color-surface);
      border-top: 1px solid var(--md-sys-color-outline-variant);
      padding: 1rem; z-index: 1000;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.1);
      transition: transform 0.3s ease;
    `}
    >
      <div style="display:flex; align-items:center; gap:1rem;">
        <md-circular-progress
          value={state.progress / 100}
          style={`width:40px; height:40px; --md-circular-progress-active-color: ${isError ? "red" : "var(--md-sys-color-primary)"}`}
        />

        <div style="flex:1;">
          <div style="font:var(--md-sys-typescale-title-medium);">{state.fileName}</div>
          <div style="font:var(--md-sys-typescale-body-small); color:var(--md-sys-color-on-surface-variant);">
            {isComplete
              ? "Concluído"
              : isError
              ? "Erro na transferência"
              : `${state.progress.toFixed(1)}% • ${formatBytes(state.speed)}/s`}
          </div>
        </div>

        {!isComplete && !isError && (
          <md-icon-button onClick={cancelTransfer}>
            <md-icon>close</md-icon>
          </md-icon-button>
        )}

        {isComplete && (
          <md-icon-button
            onClick={() =>
              (transferState.value = {
                ...transferState.value,
                isActive: false,
                status: "idle",
              })
            }
          >
            <md-icon>check</md-icon>
          </md-icon-button>
        )}
      </div>
    </div>
  );
}

// src/components/DebugPanel.tsx
import { debugLogs, clearDebugLogs } from '../signals/state.ts';

export function DebugPanel() {
  // Acessa o valor atual do signal para reatividade
  const logs = debugLogs.value;

  return (
    <div class="container" style="background: #f5f5f5; border: 2px dashed #999; margin-top: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2 style="margin: 0;">🔍 Debug Logs</h2>
        <md-outlined-button onClick={clearDebugLogs}>🗑️ Limpar Logs</md-outlined-button>
      </div>
      <div id="debugPanel" style="background: #000; color: #0f0; font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; border-radius: 4px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;">
        {logs.length === 0 ? (
          <div>Aguardando logs...</div>
        ) : (
          logs.map((log, index) => <div key={index}>{log}</div>)
        )}
      </div>
    </div>
  );
}
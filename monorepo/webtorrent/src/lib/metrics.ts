/**
 * Coleta e cálculo de métricas de presença e latência.
 */

export interface MetricsData {
  swarmJoinMs: number | null;
  peerDetections: number[];
  peerLeaves: number[];
  pingRTTs: number[];
  reconnections: number;
  trackerErrors: number;
  uptimeStart: number | null;
}

export function createMetrics(): MetricsData {
  return {
    swarmJoinMs: null,
    peerDetections: [],
    peerLeaves: [],
    pingRTTs: [],
    reconnections: 0,
    trackerErrors: 0,
    uptimeStart: null,
  };
}

export function avg(arr: number[]): string {
  if (arr.length === 0) return "—";
  const v = arr.reduce((a, b) => a + b, 0) / arr.length;
  return `${Math.round(v)}ms`;
}

export function uptime(start: number | null): string {
  if (!start) return "—";
  const s = Math.floor((Date.now() - start) / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}
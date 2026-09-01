/**
 * Ping/Pong via conexão WebRTC subjacente ao WebTorrent.
 *
 * Estratégia de envio (tentativas em cascata):
 *   1. wire._pe.send()  → data channel do simple-peer (hacky mas funcional)
 *   2. wire.extended()  → protocolo de extensão BitTorrent
 *   3. Fallback: não suportado
 *
 * O pong inclui a chave pública do peer para validação de identidade.
 */

export interface PingMessage {
  type: "ping" | "pong";
  ts: number;
  from: string;
  origTs?: number;
}

export interface PingResult {
  rtt: number;
  from: string;
  valid: boolean;
  ts: number;
  method: string;
}

/**
 * Envia ping via wire do WebTorrent.
 * Retorna true se conseguiu enviar, false se não suportado.
 */
export function sendPingViaWire(
  wire: any,
  myPubKey: string,
): boolean {
  const msg: PingMessage = { type: "ping", ts: Date.now(), from: myPubKey };
  const json = JSON.stringify(msg);

  // Tentativa 1: simple-peer data channel (acesso direto ao WebRTC)
  try {
    if (wire?._pe?.send) {
      wire._pe.send(json);
      return true;
    }
  } catch {
    // Falha silenciosa, tenta próximo método
  }

  // Tentativa 2: extended protocol do BitTorrent
  try {
    if (typeof wire?.extended === "function") {
      const encoded = new TextEncoder().encode(json);
      wire.extended("loco_ping", encoded);
      return true;
    }
  } catch {
    // Falha silenciosa
  }

  return false;
}

/**
 * Tenta responder a um ping recebido.
 */
export function sendPongViaWire(
  wire: any,
  myPubKey: string,
  originalTs: number,
): void {
  const msg: PingMessage = {
    type: "pong",
    ts: Date.now(),
    from: myPubKey,
    origTs: originalTs,
  };
  const json = JSON.stringify(msg);

  try {
    if (wire?._pe?.send) {
      wire._pe.send(json);
      return;
    }
  } catch { /* ignore */ }

  try {
    if (typeof wire?.extended === "function") {
      wire.extended("loco_ping", new TextEncoder().encode(json));
    }
  } catch { /* ignore */ }
}

/**
 * Processa mensagem recebida via wire.
 * Retorna PingResult se for pong, null se for ping (já respondeu) ou inválida.
 */
export function processWireMessage(
  data: any,
  myPubKey: string,
  expectedPeerKey: string,
  wire: any,
): PingResult | null {
  try {
    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
      text = new TextDecoder().decode(data);
    } else if (Buffer && typeof data === "object") {
      text = data.toString("utf-8");
    } else {
      return null;
    }

    const msg: PingMessage = JSON.parse(text);

    if (msg.type === "ping") {
      sendPongViaWire(wire, myPubKey, msg.ts);
      return null;
    }

    if (msg.type === "pong") {
      const rtt = Date.now() - (msg.origTs || 0);
      return {
        rtt,
        from: msg.from,
        valid: msg.from === expectedPeerKey,
        ts: Date.now(),
        method: "wire",
      };
    }
  } catch {
    // Não é JSON válido ou formato desconhecido
  }
  return null;
}
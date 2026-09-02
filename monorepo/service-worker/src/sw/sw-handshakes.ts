// src/sw/sw-handshakes.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { gunzipSync } from "fflate";
import { Handshake } from "@loco/utils/interfaces";
import { MAX_TENTATIVAS } from "@loco/utils/config";
import { base64UrlToBuffer, criarJWT } from "@loco/utils/crypto";
import {
  salvarHandshake,
  buscarHandshake,
  listarHandshakes,
  removerHandshake,
  buscarContatoPorChave,
  buscarProfile,
  buscarChaveDecript,
  salvarProfile,
  serializarPublicKeyVapid, 
  normalizarChaveContato,
  removerContatoPorHash,
  gerarId
} from "@loco/utils/db";
import { cifrarPayloadObj, enviarParaProxy, cifrarChaveVapid } from "@loco/utils/proxy";
import { extrairDadosCompactos } from "@loco/utils/db";
import { addDebugLog } from "@loco/utils/debug";
import { Processar as ProcessarProfile } from "../handshakes/hand-profile.ts";
import { Processar as ProcessarContato } from "../handshakes/hand-contato.ts";
import { Processar as ProcessarMensagem } from "../handshakes/hand-mensagem.ts";

// ... (MANTENHA TODO O CÓDIGO INTERNO DE processarHandshakeRecebido, processarFilaHandshake, etc. EXATAMENTE COMO ESTAVA) ...

// 🔥 NOVAS FUNÇÕES EXPORTÁVEIS PARA O ORQUESTRADOR

export function handleSync(event: any) {
  if (event.tag === 'sync-envio-handshakes') {
    event.waitUntil(processarFilaHandshake());
  }
}

export function handleOnline(event: any) {
  if ('waitUntil' in event) {
    (event as ExtendableEvent).waitUntil(processarFilaHandshake());
  } else {
    processarFilaHandshake();
  }
}
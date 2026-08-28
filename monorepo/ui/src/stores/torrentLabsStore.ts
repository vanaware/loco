// src/stores/torrentLabsStore.ts
import { signal } from "@preact/signals";
import { zipSync } from "fflate";
import { addDebugLog, showToast } from "./state.ts";
import { salvarNoOPFS, lerDoOPFS, excluirDoOPFS } from "../utils/opfs-utils.ts";
import { gerarId } from "../../../worker-db/src/utils/id.ts";
import { 
  salvarPastaMetadata, 
  listarTodasAsPastas, 
  buscarPastaMetadata,
  removerPastaMetadata
} from "../../../utils/src/db/mod.ts";
import type { PastaMetadata, FileMetadata } from "../../../utils/src/interfaces/db.ts";

export const isMotorLigar = signal<boolean>(false);
export const pastasAtivas = signal<PastaMetadata[]>([]);
export const progressoMap = signal<Record<string, { progress: number, speed: number, peers: number }>>({});

let client: any = null;

const RELIABLE_TRACKERS = [
  "wss://tracker.webtorrent.dev:443",
  "wss://tracker.openwebtorrent.com:443",
  "wss://open.ftorrent.com:443"
];

function getClient(): any {
  if (!client) {
    const WebTorrentEngine = (globalThis as any).WebTorrent;
    if (!WebTorrentEngine) {
      addDebugLog("error", "TORRENT_LAB", "Motor WebTorrent não foi carregado pelo index.html.");
      throw new Error("Falha no carregamento do WebTorrent.");
    }
    client = new WebTorrentEngine();
    client.on('error', (err: any) => addDebugLog("error", "TORRENT_LAB", `Erro fatal: ${err.message}`));
  }
  return client;
}

export async function carregarPastasDoBanco() {
  const todas = await listarTodasAsPastas();
  pastasAtivas.value = todas.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

// 🔥 ARQUITETURA: Função de inicialização chamada no Boot do App
export async function initTorrentLabsStore() {
  await carregarPastasDoBanco();
}

export async function alternarMotor() {
  if (isMotorLigar.value) {
    if (client) {
      client.destroy();
      client = null;
    }
    isMotorLigar.value = false;
    progressoMap.value = {};
    addDebugLog("info", "TORRENT_LAB", "Motor WebTorrent desligado.");
  } else {
    isMotorLigar.value = true;
    addDebugLog("info", "TORRENT_LAB", "Motor WebTorrent ligado. Iniciando resumos...");
    await carregarPastasDoBanco();
    for (const pasta of pastasAtivas.value) {
      if (pasta.status !== 'standby') {
        reseedPasta(pasta.id); // Força a reconstrução a partir do OPFS
      }
    }
  }
}

// 🔥 ARQUITETURA: Manifesto Enxuto. Apenas identidade viaja pela rede.
export async function criarNovaPastaOffline(
  nomePasta: string, 
  arquivosInput: FileList | File[], 
  permissao: 'public' | 'listed' | 'trusted' = 'trusted'
) {
  const id = gerarId();
  const agora = Date.now();
  const fileArray = Array.from(arquivosInput);

  const fileMetadatas: FileMetadata[] = [];
  for (const f of fileArray) {
    await salvarNoOPFS(id, f.name, f);
    fileMetadatas.push({ name: f.name, size: f.size, type: f.type, createdAt: agora, modifiedAt: agora });
  }

  const novaPasta: PastaMetadata = {
    id, name: nomePasta, status: 'standby', complete: 100,
    permission: permissao, contatos: [], files: fileMetadatas,
    createdAt: agora, modifiedAt: agora
  };

  await salvarPastaMetadata(novaPasta);
  await carregarPastasDoBanco();
  
  addDebugLog("success", "TORRENT_LAB", `Pasta '${nomePasta}' criada Offline no OPFS.`);
  
  if (isMotorLigar.value) {
    novaPasta.status = 'seeding';
    await salvarPastaMetadata(novaPasta);
    await reseedPasta(id);
  }
}

export async function reseedPasta(pastaId: string) {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta || pasta.status === 'downloading' || pasta.status === 'standby' || !isMotorLigar.value) return;

  const wt = getClient();
  const torrentId = pasta.infoHash || pasta.magnetURI;
  if (torrentId) {
    const t = wt.get(torrentId);
    if (t) t.destroy(); // Apaga o torrent velho da memória
  }

  // 1. Recria o Manifesto JSON enxuto (apenas ID e Nome)
  const manifesto = { id: pasta.id, name: pasta.name };
  const manifestBlob = new Blob([JSON.stringify(manifesto, null, 2)], { type: 'application/json' });
  await salvarNoOPFS(pasta.id, '.loco-manifest.json', manifestBlob);

  // 2. Puxa todos os arquivos do OPFS
  const filesToSeed: File[] = [];
  for (const f of pasta.files) {
    const file = await lerDoOPFS(pasta.id, f.name);
    if (file) filesToSeed.push(file);
  }
  const manifestFile = await lerDoOPFS(pasta.id, '.loco-manifest.json');
  if (manifestFile) filesToSeed.push(manifestFile);

  // 3. Injeta na Rede (Isso vai gerar um Magnet URI inteiramente novo se o conteúdo mudou)
  wt.seed(filesToSeed, { announce: RELIABLE_TRACKERS, name: pasta.name }, (torrent: any) => {
    pasta.magnetURI = torrent.magnetURI;
    pasta.infoHash = torrent.infoHash;
    pasta.status = 'seeding';
    salvarPastaMetadata(pasta).then(() => carregarPastasDoBanco());
    _anexarEventosTorrent(torrent, pasta.id);
    addDebugLog("info", "TORRENT_LAB", `Seed da pasta '${pasta.name}' reconstruído.`);
  });
}

// 🔥 ARQUITETURA: Travas de Segurança para Mutação
export async function adicionarArquivosPasta(pastaId: string, novosArquivos: FileList | File[]) {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta) return;

  if (pasta.status !== 'standby') {
    showToast("Coloque a pasta em Standby para adicionar arquivos.", "error");
    return;
  }

  const agora = Date.now();
  const fileArray = Array.from(novosArquivos);

  for (const f of fileArray) {
    await salvarNoOPFS(pasta.id, f.name, f);
    const existIndex = pasta.files.findIndex(x => x.name === f.name);
    const meta: FileMetadata = { name: f.name, size: f.size, type: f.type, createdAt: agora, modifiedAt: agora };
    if (existIndex >= 0) pasta.files[existIndex] = meta;
    else pasta.files.push(meta);
  }

  pasta.modifiedAt = agora;
  // Limpa o Magnet antigo, pois ele não é mais válido para o novo conjunto de arquivos
  pasta.magnetURI = undefined; 
  pasta.infoHash = undefined;

  await salvarPastaMetadata(pasta);
  await carregarPastasDoBanco();
  showToast("Arquivos anexados. Ative a pasta para gerar o novo Seed.", "success");
}

export async function removerArquivoPasta(pastaId: string, fileName: string) {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta) return;

  if (pasta.status !== 'standby') {
    showToast("Coloque a pasta em Standby para excluir arquivos.", "error");
    return;
  }

  await excluirDoOPFS(pasta.id, fileName);
  pasta.files = pasta.files.filter(f => f.name !== fileName);
  pasta.modifiedAt = Date.now();
  pasta.magnetURI = undefined;
  pasta.infoHash = undefined;
  
  await salvarPastaMetadata(pasta);
  await carregarPastasDoBanco();
  showToast("Arquivo removido. Ative a pasta para gerar o novo Seed.", "info");
}

export async function atualizarPermissaoPasta(pastaId: string, novaPermissao: 'public' | 'listed' | 'trusted') {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta) return;

  pasta.permission = novaPermissao;
  pasta.modifiedAt = Date.now();
  await salvarPastaMetadata(pasta);
  await carregarPastasDoBanco();
  
  // 🔥 ARQUITETURA: Mudar permissão não exige reseed, pois não muda o conteúdo do torrent!
  showToast("Permissão de acesso atualizada internamente.", "success");
}

export async function baixarArquivoOpfs(pastaId: string, fileName: string) {
  const file = await lerDoOPFS(pastaId, fileName);
  if (!file) {
    showToast("Arquivo não encontrado no disco local.", "error");
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function baixarZipPasta(pastaId: string) {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta || pasta.files.length === 0) return showToast("A pasta está vazia.", "error");

  showToast("Compactando pasta em ZIP. Aguarde...", "info");
  
  try {
    const zipObj: Record<string, Uint8Array> = {};
    for (const f of pasta.files) {
      const file = await lerDoOPFS(pasta.id, f.name);
      if (file) {
        zipObj[f.name] = new Uint8Array(await file.arrayBuffer());
      }
    }
    
    const zipped = zipSync(zipObj);
    const blob = new Blob([new Uint8Array(zipped)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pasta.name}_P2P.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Download do ZIP concluído!", "success");
  } catch (e: any) {
    addDebugLog("error", "OPFS", "Falha ao gerar ZIP", e.message);
    showToast("Erro ao compactar arquivos.", "error");
  }
}

export async function adicionarMagnetDownload(magnetURI: string) {
  if (!isMotorLigar.value) return;

  const wt = getClient();
  const torrent = wt.add(magnetURI, { announce: RELIABLE_TRACKERS });

  torrent.on('metadata', () => {
    const manifestTorrentFile = torrent.files.find((f: any) => f.name === '.loco-manifest.json');
    if (manifestTorrentFile) {
      manifestTorrentFile.getBuffer(async (err: any, buffer: Uint8Array) => {
        if (err || !buffer) return;
        try {
          const manifestStr = new TextDecoder().decode(buffer);
          const manifestJson = JSON.parse(manifestStr);
          const realId = manifestJson.id;
          const agora = Date.now();

          const existe = await buscarPastaMetadata(realId);
          if (existe) {
            torrent.destroy();
            showToast("Você já possui esta pasta.", "info");
            return;
          }

          const fileMetadatas: FileMetadata[] = torrent.files
            .filter((f: any) => f.name !== '.loco-manifest.json')
            .map((f: any) => ({
              name: f.name, size: f.length, type: 'application/octet-stream', 
              createdAt: agora, modifiedAt: agora
            }));

          const novaPasta: PastaMetadata = {
            id: realId, name: manifestJson.name || torrent.name,
            magnetURI: torrent.magnetURI, infoHash: torrent.infoHash,
            status: 'downloading', complete: 0,
            permission: 'trusted', contatos: [], // Padrões locais seguros
            files: fileMetadatas, createdAt: agora, modifiedAt: agora
          };

          await salvarPastaMetadata(novaPasta);
          await carregarPastasDoBanco();
          _anexarEventosTorrent(torrent, realId);

        } catch (parseErr: any) {
          addDebugLog("error", "TORRENT_LAB", `Erro de Parse: ${parseErr.message}`);
        }
      });
    }
  });
}

export async function alternarStatusPasta(pastaId: string) {
  const pasta = await buscarPastaMetadata(pastaId);
  if (!pasta) return;

  if (pasta.status === 'standby') {
    pasta.status = pasta.complete === 100 ? 'seeding' : 'downloading';
    await salvarPastaMetadata(pasta);
    await carregarPastasDoBanco();
    if (isMotorLigar.value) {
      if (pasta.status === 'seeding') await reseedPasta(pasta.id);
      else if (pasta.magnetURI) {
        const wt = getClient();
        _anexarEventosTorrent(wt.add(pasta.magnetURI, { announce: RELIABLE_TRACKERS }), pasta.id);
      }
    }
  } else {
    pasta.status = 'standby';
    if (client) {
      const torrentId = pasta.infoHash || pasta.magnetURI;
      if (torrentId) {
        const torrentObj = client.get(torrentId);
        if (torrentObj) torrentObj.destroy();
      }
    }
    const novoMapa = { ...progressoMap.value };
    delete novoMapa[pastaId];
    progressoMap.value = novoMapa;
    
    await salvarPastaMetadata(pasta);
    await carregarPastasDoBanco();
  }
}

function _anexarEventosTorrent(torrent: any, pastaId: string) {
  torrent.on('download', () => {
    progressoMap.value = {
      ...progressoMap.value,
      [pastaId]: {
        progress: Math.round(torrent.progress * 100),
        speed: torrent.downloadSpeed,
        peers: torrent.numPeers
      }
    };
  });

  torrent.on('done', async () => {
    progressoMap.value = { ...progressoMap.value, [pastaId]: { progress: 100, speed: 0, peers: torrent.numPeers } };

    const pasta = await buscarPastaMetadata(pastaId);
    if (pasta) {
      pasta.complete = 100;
      pasta.status = 'seeding';
      await salvarPastaMetadata(pasta);
      await carregarPastasDoBanco();
    }

    for (const file of torrent.files) {
      if (file.name === '.loco-manifest.json') continue;
      file.getBlob(async (err: any, blob: Blob | undefined) => {
        if (!err && blob) await salvarNoOPFS(pastaId, file.name, blob);
      });
    }
  });
}
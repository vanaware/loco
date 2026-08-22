export interface OpfsResolveOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

// Resolve o nome do arquivo dinamicamente (ex: db_LOJA_produtos_PROD__meu_backup.json)
export function resolveOpfsFileName(type: "db" | "ls", fileName: string, opts?: OpfsResolveOptions): string {
  const parts: string[] = [type]; // CORREÇÃO: tipagem explícita adicionada aqui
  if (type === "db") {
    if (opts?.dbName) parts.push(opts.dbName);
    if (opts?.storeName) parts.push(opts.storeName);
  }
  if (opts?.prefix) parts.push(opts.prefix);
  
  parts.push(fileName);
  return parts.join("_");
}

export async function writeJsonToOpfs(fileName: string, data: any): Promise<string> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
  return fileName;
}

export async function readJsonFromOpfs(fileName: string): Promise<any> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteFromOpfs(fileName: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(fileName);
}

export async function getFileFromOpfs(fileName: string): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName);
  return await fileHandle.getFile();
}

export async function listOpfsFiles(): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const files: string[] = [];
  // @ts-ignore: async iterator support
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === "file") files.push(name);
  }
  return files;
}

// Dispara o download nativo do arquivo no navegador (Apenas Main Thread)
export async function downloadOpfsFile(fileName: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("downloadOpfsFile só pode ser executado na Main Thread (onde 'document' existe).");
  }
  const file = await getFileFromOpfs(fileName);
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
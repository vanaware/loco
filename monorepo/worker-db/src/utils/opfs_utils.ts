export interface OpfsResolveOptions {
  dbName?: string;
  storeName?: string;
  prefix?: string;
}

// Resolve o nome do arquivo dinamicamente
export function resolveOpfsFileName(type: "db" | "ls", fileName: string, opts?: OpfsResolveOptions): string {
  const parts: string[] = [type]; 
  if (type === "db") {
    if (opts?.dbName) parts.push(opts.dbName);
    if (opts?.storeName) parts.push(opts.storeName);
  }
  if (opts?.prefix) parts.push(opts.prefix);
  
  parts.push(fileName);
  return parts.join("_");
}

// Utilitário interno para garantir que sempre operemos na pasta 'backup'
async function getBackupDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle("backup", { create: true });
}

export async function writeJsonToOpfs(fileName: string, data: any): Promise<string> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
  return fileName;
}

export async function readJsonFromOpfs(fileName: string): Promise<any> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const text = await file.text();
  return JSON.parse(text);
}

export async function deleteFromOpfs(fileName: string): Promise<void> {
  const backupDir = await getBackupDir();
  await backupDir.removeEntry(fileName);
}

export async function getFileFromOpfs(fileName: string): Promise<File> {
  const backupDir = await getBackupDir();
  const fileHandle = await backupDir.getFileHandle(fileName);
  return await fileHandle.getFile();
}

export async function listOpfsFiles(): Promise<string[]> {
  const backupDir = await getBackupDir();
  const files: string[] = [];
  // @ts-ignore: async iterator support
  for await (const [name, handle] of backupDir.entries()) {
    if (handle.kind === "file") files.push(name);
  }
  return files;
}

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
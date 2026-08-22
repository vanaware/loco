export class FakeOPFSFileHandle {
  public kind: "file" | "directory" = "file";

  constructor(
    private name: string,
    private storage: Map<string, string>
  ) {}

  async createWritable() {
    const self = this;
    let content = "";
    return {
      async write(data: string) {
        content = data;
      },
      async close() {
        self.storage.set(self.name, content);
      }
    };
  }

  async getFile() {
    const content = this.storage.get(this.name);
    if (content === undefined) {
      throw new Error(`File ${this.name} not found in Fake OPFS`);
    }
    return {
      async text() {
        return content;
      }
    };
  }
}

export class FakeOPFSDirectory {
  private static sharedStorage = new Map<string, string>();

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!options?.create && !FakeOPFSDirectory.sharedStorage.has(name)) {
      throw new Error(`File ${name} not found in Fake OPFS`);
    }
    return new FakeOPFSFileHandle(name, FakeOPFSDirectory.sharedStorage);
  }

  async removeEntry(name: string) {
    FakeOPFSDirectory.sharedStorage.delete(name);
  }

  // Iterador apenas das chaves (nomes dos arquivos)
  async *keys() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      yield key;
    }
  }

  // Iterador completo devolvendo [nome, handle] (Espelha a API Nativa)
  async *entries() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      yield [key, new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage)] as const;
    }
  }

  // Iterador devolvendo apenas as instâncias (handles)
  async *values() {
    for (const key of FakeOPFSDirectory.sharedStorage.keys()) {
      yield new FakeOPFSFileHandle(key, FakeOPFSDirectory.sharedStorage);
    }
  }

  static clear() {
    FakeOPFSDirectory.sharedStorage.clear();
  }
}
export type WithId<T> = T & { _id: string };

export function gerarId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export function gerarIdComPrefixo(prefix: string): string {
  return `${prefix}${gerarId()}`;
}

export function validarId(id: string): boolean {
  return typeof id === "string" && id.length > 0;
}

// Injeta dinamicamente o '_id' sem o prefixo ao LER do banco/localStorage
export function formatDbItem(key: IDBValidKey, val: any, prefix = ""): any {
  if (!val || typeof val !== "object" || Array.isArray(val)) return val;
  const keyStr = String(key);
  const _id = prefix && keyStr.startsWith(prefix) ? keyStr.slice(prefix.length) : keyStr;
  return { _id, ...val };
}

// Prepara a chave final e limpa o '_id' do objeto gravado
export function prepareForSave(key: string | undefined | null, val: any, prefix = ""): { key: string; cleanVal: any } {
  let rawId = val && typeof val === "object" ? val._id : undefined;
  
  if (rawId === "auto") {
    rawId = gerarId();
  }

  let finalKey = key || "";

  if (rawId) {
    if (prefix && rawId.startsWith(prefix)) {
      finalKey = rawId;
    } else {
      finalKey = prefix ? `${prefix}${rawId}` : rawId;
    }
  } else if (key) {
    if (prefix && key.startsWith(prefix)) {
      finalKey = key;
    } else {
      finalKey = prefix ? `${prefix}${key}` : key;
    }
  }

  if (!finalKey) {
    throw new Error("Uma chave (key) ou um atributo '_id' no objeto deve ser fornecido.");
  }

  if (val && typeof val === "object" && !Array.isArray(val) && "_id" in val) {
    const { _id: _, ...cleanVal } = val;
    return { key: finalKey, cleanVal };
  }

  return { key: finalKey, cleanVal: val };
}
// monorepo/router/src/adapters/cloudflare-types.ts
// Declarações de tipo para o ambiente Cloudflare Workers
export interface R2Bucket {
  get(key: string): Promise<any>;
}
export interface KVNamespace {
  get(key: string, type: string): Promise<any>;
}
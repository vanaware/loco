// src/utils/self-contact-utils.ts
import type { ProfileConfig, Contato } from '../interfaces/mod.ts';

/**
 * Função interna para serializar chave pública VAPID em hash SHA-256.
 * Implementação própria para evitar dependência do IndexedDB em testes.
 */
async function serializarPublicKeyVapidInterna(jwk: JsonWebKey): Promise<string> {
  if (!jwk) throw new Error("Chave VAPID ausente ao tentar serializar.");
  const raw = `${jwk.kty?.toLowerCase() || ''}|${jwk.crv?.toLowerCase() || ''}|${jwk.x?.toLowerCase() || ''}|${jwk.y?.toLowerCase() || ''}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(raw));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Gera um objeto Contato baseado no ProfileConfig do próprio usuário.
 * Este contato especial usa o hash da chave pública VAPID do profile como ID,
 * permitindo que o sistema identifique quando o usuário está enviando mensagem para si mesmo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns Um objeto Contato representando o próprio usuário, ou null se profile for inválido
 */
export async function gerarContatoProprio(profile: ProfileConfig): Promise<Contato | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }
  try {
    const id = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    const contatoProprio: Contato = {
      id,
      email: profile.email,
      name: `${profile.name} (Eu)`,
      vapidPublicKey: profile.vapidPublicKey,
      e2ePublicKey: profile.e2ePublicKey,
      subscription: profile.subscription,
      vapidPrivateKeyEnvelope: profile.vapidPrivateKeyEnvelope,
      trusted: true,
      me: 'trusted', // 🔥 Marca especial indicando que é o próprio usuário
      createdAt: profile.createdAt,
      updatedAt: Date.now()
    };
    return contatoProprio;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao gerar contato próprio:', error);
    return null;
  }
}

/**
 * Verifica se um determinado contato é o próprio usuário.
 * Compara o hash do contato com o hash da chave pública VAPID do profile.
 * 
 * @param contatoHash - O hash/ID do contato a verificar
 * @param profile - O ProfileConfig do usuário atual
 * @returns true se o contato for o próprio usuário, false caso contrário
 */
export async function ehContatoProprio(
  contatoHash: string, 
  profile: ProfileConfig | null
): Promise<boolean> {
  if (!profile || !profile.vapidPublicKey) {
    return false;
  }
  try {
    const meuHash = await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
    return contatoHash === meuHash;
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao verificar se é contato próprio:', error);
    return false;
  }
}

/**
 * Obtém o hash do próprio usuário a partir do profile.
 * Útil para comparações rápidas sem precisar gerar o objeto Contato completo.
 * 
 * @param profile - O ProfileConfig do usuário
 * @returns O hash da chave pública VAPID do usuário, ou null se profile for inválido
 */
export async function obterHashProprio(profile: ProfileConfig | null): Promise<string | null> {
  if (!profile || !profile.vapidPublicKey) {
    return null;
  }
  try {
    return await serializarPublicKeyVapidInterna(profile.vapidPublicKey);
  } catch (error) {
    console.error('[SELF-CONTACT] Erro ao obter hash próprio:', error);
    return null;
  }
}
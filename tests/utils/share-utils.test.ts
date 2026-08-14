// tests/utils/share-utils.test.ts
/// <reference lib="deno.ns" />
import { assert, assertEquals, assertRejects } from "@std/assert";
import { gerarLinkConviteWeb, processarQualquerConvite, extrairDadosCompactos, expandirDadosCompactos } from "../../src/utils/share-utils.ts";
import { generateVAPIDKeys, generateE2EEKeys, exportKeyToJWK } from "../../src/utils/crypto-utils.ts";
import type { ProfileConfig, Contato } from "../../src/constants/db.ts";

// Mock simples para as funções de DB que não podemos usar em testes unitários puros
const mockContatos = new Map<string, Contato>();

async function salvarContatoMock(contato: Contato): Promise<void> {
  mockContatos.set(contato.id, contato);
}

async function buscarContatoPorChaveMock(hash: string): Promise<Contato | null> {
  return mockContatos.get(hash) || null;
}

async function serializarPublicKeyVapidMock(key: JsonWebKey): Promise<string> {
  const data = `${key.x}:${key.y}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.test("Share Utils - Geração e Importação de cJWT para Profile e Contato", async () => {
  // Setup: Criar dois perfis simulando dois usuários
  const userA: ProfileConfig = {
    name: "Usuário A",
    email: "usuario.a@teste.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-a",
      keys: { p256dh: "p256dh-a", auth: "auth-a" }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const userB: ProfileConfig = {
    name: "Usuário B",
    email: "usuario.b@teste.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint-b",
      keys: { p256dh: "p256dh-b", auth: "auth-b" }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Gerar chaves criptográficas reais para ambos os usuários
  const [vapidKeysA, e2eKeysA, vapidKeysB, e2eKeysB] = await Promise.all([
    generateVAPIDKeys(),
    generateE2EEKeys(),
    generateVAPIDKeys(),
    generateE2EEKeys()
  ]);

  userA.vapidPublicKey = await exportKeyToJWK(vapidKeysA.publicKey);
  userA.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysA.privateKey);
  userA.e2ePublicKey = e2eKeysA.publicEncrypt;
  userA.e2ePrivateKeyJwk = e2eKeysA.privateDecryptJwk;

  userB.vapidPublicKey = await exportKeyToJWK(vapidKeysB.publicKey);
  userB.vapidPrivateKeyJwk = await exportKeyToJWK(vapidKeysB.privateKey);
  userB.e2ePublicKey = e2eKeysB.publicEncrypt;
  userB.e2ePrivateKeyJwk = e2eKeysB.privateDecryptJwk;

  // Teste 1: Extrair dados compactos do Profile A
  console.log("📦 Teste 1: Extraindo dados compactos do Profile A (Static Schema Compression)");
  const compactDataA = extrairDadosCompactos(userA);
  assertEquals(compactDataA.nm, "Usuário A", "Nome deve ser extraído corretamente");
  assertEquals(compactDataA.em, "usuario.a@teste.com", "Email deve ser extraído corretamente");
  
  // 🔥 ARQUITETURA: Testando as novas propriedades minificadas 'vp' e 'ep'
  assertEquals(compactDataA.vp.x, userA.vapidPublicKey.x, "Chave VAPID X deve ser extraída no bloco VP");
  assertEquals(compactDataA.vp.y, userA.vapidPublicKey.y, "Chave VAPID Y deve ser extraída no bloco VP");
  assert(compactDataA.ep.n !== undefined, "Módulo 'n' da Chave E2E deve ser extraído no bloco EP");

  // Teste 2: Expandir dados compactos de volta para formato Contato
  console.log("🔄 Teste 2: Expandindo dados compactos para formato Contato");
  const expandedData = expandirDadosCompactos(compactDataA);
  assertEquals(expandedData.name, "Usuário A", "Nome deve ser expandido corretamente");
  assertEquals(expandedData.email, "usuario.a@teste.com", "Email deve ser expandido corretamente");
  assert(expandedData.vapidPublicKey !== undefined, "Chave VAPID deve ser expandida");
  assert(expandedData.e2ePublicKey !== undefined, "Chave E2E deve ser expandida");

  // Teste 3: Gerar cJWT de convite (simulando exportação do profile)
  console.log("🔐 Teste 3: Gerando cJWT de convite com Profile A");
  const cjwtUrl = await gerarLinkConviteWeb(userA, userA.vapidPrivateKeyJwk, userA.vapidPublicKey, 'http://test.localhost');
  assert(cjwtUrl.includes("#share="), "URL deve conter parâmetro share");
  
  // Extrair apenas o token cJWT da URL (parte após #share=)
  const cjwtToken = cjwtUrl.split("#share=")[1];
  assert(cjwtToken && cjwtToken.length > 0, "cJWT deve ser gerado");
  console.log(`   cJWT gerado: ${cjwtToken.substring(0, 50)}...`);

  // Teste 4: Processar cJWT para importar como contato (simulando importação pelo Usuário B)
  console.log("📥 Teste 4: Processando cJWT para importar como contato");
  // Passar apenas o token, não a URL completa
  const importedContato = await processarQualquerConvite(cjwtToken);
  
  assertEquals(importedContato.name, "Usuário A", "Nome do contato importado deve bater");
  assertEquals(importedContato.email, "usuario.a@teste.com", "Email do contato importado deve bater");
  assert(importedContato.vapidPublicKey !== undefined, "Chave VAPID deve estar presente");
  assert(importedContato.e2ePublicKey !== undefined, "Chave E2E deve estar presente");
  assert(importedContato.subscription !== undefined, "Subscription deve estar presente");
  assertEquals(importedContato.subscription.endpoint, "https://fcm.googleapis.com/fcm/send/test-endpoint-a", "Endpoint deve bater");

  // Teste 5: Verificar integridade das chaves após importação
  console.log("✅ Teste 5: Verificando integridade das chaves após importação");
  assertEquals(
    (importedContato.vapidPublicKey as JsonWebKey).x,
    userA.vapidPublicKey.x,
    "Chave VAPID X deve ser idêntica após importação"
  );
  assertEquals(
    (importedContato.vapidPublicKey as JsonWebKey).y,
    userA.vapidPublicKey.y,
    "Chave VAPID Y deve ser idêntica após importação"
  );
  assertEquals(
    (importedContato.e2ePublicKey as JsonWebKey).n,
    userA.e2ePublicKey.n,
    "Chave E2E N deve ser idêntica após importação"
  );

  // Teste 6: Simular salvamento do contato importado no banco de dados
  console.log("💾 Teste 6: Salvando contato importado no banco de dados (mock)");
  const contatoHash = await serializarPublicKeyVapidMock(userA.vapidPublicKey);
  const novoContato: Contato = {
    id: contatoHash,
    name: importedContato.name!,
    email: importedContato.email!,
    vapidPublicKey: importedContato.vapidPublicKey!,
    e2ePublicKey: importedContato.e2ePublicKey!,
    subscription: importedContato.subscription!,
    vapidPrivateKeyEnvelope: importedContato.vapidPrivateKeyEnvelope!,
    trusted: false,
    me: 'saved',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  await salvarContatoMock(novoContato);
  const contatoSalvo = await buscarContatoPorChaveMock(contatoHash);
  assert(contatoSalvo !== null, "Contato deve ser salvo no banco (mock)");
  assertEquals(contatoSalvo!.name, "Usuário A", "Nome do contato salvo deve bater");

  // Teste 7: Testar cJWT direto (sem URL wrapper)
  console.log("🧪 Teste 7: Processando cJWT direto (string pura)");
  const contatoDireto = await processarQualquerConvite(cjwtToken);
  assertEquals(contatoDireto.name, "Usuário A", "cJWT direto deve funcionar");

  // Teste 8: Testar formato QR Code compacto (cqr)
  console.log("📱 Teste 8: Testando formato QR Code compacto");
  const cqrData = extrairDadosCompactos(userA);
  const cqrJson = JSON.stringify(cqrData);
  const cqrBytes = new TextEncoder().encode(cqrJson);
  
  const { gzipSync } = await import('fflate');
  const compressed = gzipSync(cqrBytes);
  const { arrayBufferToBase64Url } = await import('../../src/utils/jwt-helpers.ts');
  const cqrToken = arrayBufferToBase64Url(compressed.buffer as ArrayBuffer);
  
  const contatoCqr = await processarQualquerConvite(cqrToken);
  assertEquals(contatoCqr.name, "Usuário A", "QR Code compacto deve funcionar");

  // Teste 9: Testar JWT não-compresso
  console.log("📝 Teste 9: Testando JWT não-compresso");
  const { criarJWT } = await import('../../src/utils/jwt-helpers.ts');
  const jwtPayload = {
    sub: "contact",
    ...extrairDadosCompactos(userA),
    iat: Math.floor(Date.now() / 1000)
  };
  const jwtToken = await criarJWT(jwtPayload, userA.vapidPrivateKeyJwk, { kid: userA.vapidPublicKey });
  
  const contatoJwt = await processarQualquerConvite(jwtToken);
  assertEquals(contatoJwt.name, "Usuário A", "JWT não-compresso deve funcionar");

  // Teste 10: Testar erro com token inválido
  console.log("❌ Teste 10: Testando erro com token inválido");
  await assertRejects(
    async () => await processarQualquerConvite("token-invalido-abc123"),
    Error,
    "Formato de convite ou QR Code inválido"
  );

  console.log("✅ Todos os testes de cJWT passaram!");
});

Deno.test("Share Utils - Reciprocidade na troca de contatos via cJWT", async () => {
  // Setup: Dois usuários completos
  const userX: ProfileConfig = {
    name: "Alice",
    email: "alice@example.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com/alice",
      keys: { p256dh: "alice-p256dh", auth: "alice-auth" }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const userY: ProfileConfig = {
    name: "Bob",
    email: "bob@example.com",
    vapidPublicKey: {} as JsonWebKey,
    vapidPrivateKeyJwk: {} as JsonWebKey,
    vapidPrivateKeyEnvelope: "",
    e2ePublicKey: {} as JsonWebKey,
    e2ePrivateKeyJwk: {} as JsonWebKey,
    subscription: {
      endpoint: "https://example.com/bob",
      keys: { p256dh: "bob-p256dh", auth: "bob-auth" }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Gerar chaves para ambos
  const [vapidX, e2eX, vapidY, e2eY] = await Promise.all([
    generateVAPIDKeys(),
    generateE2EEKeys(),
    generateVAPIDKeys(),
    generateE2EEKeys()
  ]);

  userX.vapidPublicKey = await exportKeyToJWK(vapidX.publicKey);
  userX.vapidPrivateKeyJwk = await exportKeyToJWK(vapidX.privateKey);
  userX.e2ePublicKey = e2eX.publicEncrypt;
  userX.e2ePrivateKeyJwk = e2eX.privateDecryptJwk;

  userY.vapidPublicKey = await exportKeyToJWK(vapidY.publicKey);
  userY.vapidPrivateKeyJwk = await exportKeyToJWK(vapidY.privateKey);
  userY.e2ePublicKey = e2eY.publicEncrypt;
  userY.e2ePrivateKeyJwk = e2eY.privateDecryptJwk;

  // Alice gera convite e Bob importa
  const aliceInviteUrl = await gerarLinkConviteWeb(userX, userX.vapidPrivateKeyJwk, userX.vapidPublicKey, 'http://test.localhost');
  const aliceCjwt = aliceInviteUrl.split("#share=")[1]!;
  const bobImportouAlice = await processarQualquerConvite(aliceCjwt);
  
  assertEquals(bobImportouAlice.name, "Alice", "Bob deve importar Alice corretamente");
  assertEquals(bobImportouAlice.email, "alice@example.com", "Email deve bater");

  // Bob gera convite e Alice importa
  const bobInviteUrl = await gerarLinkConviteWeb(userY, userY.vapidPrivateKeyJwk, userY.vapidPublicKey, 'http://test.localhost');
  const bobCjwt = bobInviteUrl.split("#share=")[1]!;
  const aliceImportouBob = await processarQualquerConvite(bobCjwt);
  
  assertEquals(aliceImportouBob.name, "Bob", "Alice deve importar Bob corretamente");
  assertEquals(aliceImportouBob.email, "bob@example.com", "Email deve bater");

  // Verificar reciprocidade: ambos devem ter dados válidos do outro
  assert(
    (bobImportouAlice.vapidPublicKey as JsonWebKey).x === userX.vapidPublicKey.x,
    "Bob deve ter a chave pública correta de Alice"
  );
  assert(
    (aliceImportouBob.vapidPublicKey as JsonWebKey).x === userY.vapidPublicKey.x,
    "Alice deve ter a chave pública correta de Bob"
  );

  console.log("✅ Teste de reciprocidade passou!");
});
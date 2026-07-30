# Loco Proto 02 — Sistema de Web Push Inteligente, E2EE com Identidade JWT, Filas Offline e Persistência Total

Este protótipo demonstra a implementação completa de um pipeline de **Web Push Notifications** moderno, resiliente e de segurança máxima (*Zero-Trust*) utilizando o ecossistema **Deno 2.0+**.

O projeto resolve os principais desafios arquiteturais de privacidade e rede em PWAs:

1. **Identidade Digital Federada via JWT (RFC 7519):** Remetentes assinam mensagens gerando tokens JWT estruturados com metadados dinâmicos (Nome/E-mail) usando chaves RSA-PSS permanentes e inexportáveis.
2. **Criptografia de Aplicação de Ponta a Ponta (E2EE):** O texto trafega totalmente ilegível (*cipherText*) para intermediários (Deno e Google/Apple), sendo aberto apenas na RAM do destinatário utilizando RSA-OAEP.
3. **Mascaramento RSA-OAEP de Infraestrutura:** A chave privada VAPID gerada no navegador viaja e reside na tela protegida por criptografia híbrida (AES-GCM + RSA-OAEP), sendo decodificada unicamente na RAM do servidor Deno no milissegundo do disparo.
4. **Resiliência de Rede (Background Sync API + IndexedDB):** Mensagens enviadas em modo offline são enfileiradas localmente de forma transacional e disparadas sozinhas assim que a conexão é restaurada.
5. **Persistência Total com IndexedDB:** Todas as chaves, inscrições, bundles e mensagens são persistentes entre sessões. Não há perda de dados ao recarregar a página ou fechar o navegador.

---

## 🏗️ Arquitetura do Sistema e Fluxo Criptográfico

### 🔐 Tipos de Chaves e Suas Funções

| Tipo de Chave | Algoritmo | Onde é Gerada | Onde é Armazenada | Função |
|---------------|-----------|---------------|-------------------|--------|
| Chave de Identidade do Emissor (Browser A) | RSA-PSS (2048) | Browser A | IndexedDB (BrowserA_Identidade_DB) | Assinar JWT |
| Chave Pública do Emissor (Browser A) | RSA-PSS (2048) | Browser A (exportada) | IndexedDB + Textarea | Verificar assinatura |
| Chave E2E do Receptor (Browser B) | RSA-OAEP (2048) | Browser B | IndexedDB (BrowserB_E2E_Chaves_DB) | Cifrar/decifrar conteúdo |
| Chave VAPID do Receptor (Browser B) | ECDSA (P-256) | Browser B | IndexedDB + Bundle cifrado | Autenticar push |
| Chave de Infraestrutura do Servidor | RSA-OAEP (2048) | build.ts | .env + Deno.env | Cifrar chave VAPID |
| Chave de Decodificação do SW | RSA-OAEP (2048) | Browser B | IndexedDB (BrowserB_E2E_Chaves_DB) | Decifrar conteúdo |

### 🔄 Fluxo Completo

BROWSER A (Emissor)
  │
  ├─ 1. Carrega identidade do IndexedDB
  ├─ 2. Carrega bundle do receptor
  ├─ 3. Cifra mensagem com Chave Pública RSA-OAEP do Browser B
  ├─ 4. Assina envelope com Chave Privada RSA-PSS
  ├─ 5. Constrói JWT (header.payload.signature)
  ├─ 6. Salva mensagem (status: pendente)
  └─ 7. Envia para Service Worker
  │
  ├─ [Online] → Service Worker → fetch POST
  └─ [Offline] → IndexedDB → Background Sync
  │
  ▼
SERVIDOR DENO (Proxy Stateless)
  │
  ├─ 1. Auditoria cega do JWT
  ├─ 2. Descriptografa Chave VAPID na RAM
  └─ 3. Despacha para FCM/APNs
  │
  ▼
BROWSER B (Receptor)
  │
  ├─ 1. Intercepta Push
  ├─ 2. Valida assinatura RSA-PSS
  ├─ 3. Descriptografa com Chave Privada RSA-OAEP
  ├─ 4. Salva mensagem (status: nao_lida)
  ├─ 5. Processa fila de notificações
  └─ 6. Dispara notificação na tela

---

## 🧠 Conceitos Avançados

### 1. Zero-Trust e Isolamento de Chaves
Nenhuma chave privada trafega pela rede. Usando Web Crypto API com extractable: false, as chaves ficam no cofre de hardware/IndexedDB.

### 2. Persistência Total com IndexedDB

| Banco | Conteúdo | Persistência |
|-------|----------|--------------|
| BrowserA_Identidade_DB | Nome, Email, Chave Privada | ✅ |
| BrowserA_Bundles_DB | Bundles ativo + histórico | ✅ |
| BrowserA_MensagensEnvio_DB | Mensagens com status | ✅ |
| BrowserB_E2E_Chaves_DB | Chaves E2E | ✅ |
| BrowserB_Vapid_DB | Chaves VAPID | ✅ |
| BrowserB_Subscription_DB | Inscrição push | ✅ |
| BrowserB_ListaBranca_DB | Emissores autorizados | ✅ |
| BrowserB_MensagensRecebidas_DB | Mensagens recebidas | ✅ |

### 3. Sistema de Filas com Estado

Browser A (Envio): pendente → enviando → enviada → falha
Browser B (Recepção): nao_lida → notificada → lida

### 4. Criptografia Híbrida da Chave VAPID
1. AES-GCM cifra a chave VAPID
2. RSA-OAEP (chave pública do servidor) cifra a chave AES
3. Envelope em Base64 no bundle
4. Servidor descriptografa no momento do disparo

### 5. Interface de Mensagens Recebidas
- 📬 Lista todas as mensagens
- 🟡 Destaque para não lidas
- 🔔 Marcador para notificadas
- ✅ Marcar como lida
- 🗑️ Remover individual ou todas lidas

---

## 🤖 IA Replication Guide

### 🔑 Padrões de Chaves

| Chave | Formato | Algoritmo | Parâmetros |
|-------|---------|-----------|------------|
| Assinatura JWT | JWK | RSA-PSS | 2048, saltLength:32, SHA-256 |
| Criptografia E2E | JWK | RSA-OAEP | 2048, [1,0,1], SHA-256 |
| Chave VAPID | JWK | ECDSA | P-256 |
| Chave Servidor | JWK | RSA-OAEP | 2048, [1,0,1], SHA-256 |

### 📦 Bundle Unificado

subscription: { endpoint, keys: { p256dh, auth } }
vapid: { subject, publicKey, privateKey: base64(envelope) }
isVapidEncrypted: true
e2e: { ownerName, ownerEmail, browserB_PublicKeyEncrypt, browserB_PublicKeyVerify }
payloadText: jwt.token.string

### 📨 JWT

Header: { alg: PS256, typ: JWT }
Payload: { iss, sub, name, iat, cipherText: hex... }
Signature: RSA-PSS

### 🗄️ IndexedDB

Browser A:
- BrowserA_Identidade_DB → identidade_a
- BrowserA_Bundles_DB → bundle_ativo, bundle_historico
- BrowserA_MensagensEnvio_DB → msg_*

Browser B:
- BrowserB_E2E_Chaves_DB → chaves_e2e_b
- BrowserB_Vapid_DB → chaves_vapid_b
- BrowserB_Subscription_DB → subscription_b
- BrowserB_ListaBranca_DB → email@exemplo.com
- BrowserB_MensagensRecebidas_DB → msg_*

### 🔧 Padrões Obrigatórios

- Assinatura JWT: RSA-PSS SHA-256, saltLength:32, header {alg:PS256,typ:JWT}
- Cifragem E2E: RSA-OAEP SHA-256, output em Hex
- Base64 URL-Safe: Recalcular padding (=)
- Evento Push: Usar event.data.text() antes de qualquer parse

### 🔐 Chaves do Servidor

1. Geração: deno task build → .env
2. Ignorado pelo Git (.gitignore)
3. Carregamento: Deno.env com flag --env

---

## 🛠️ Instalação

### Pré-requisitos
- Deno 2.0+
- Navegador com Service Workers e Push API

### Comandos

deno task build    # Compila e gera chaves
deno task start    # Inicia servidor
deno task dev      # Modo watch
deno task clean    # Remove dist/

### HTTPS (Obrigatório para Push)
ngrok http 8000

---

## 🧪 Roteiro de Testes

### Teste 1: Configuração Inicial
1. browser-a.html → Gerar Minha Chave de Identidade
2. browser-b.html → colar JSON → Autorizar e Salvar Emissor

### Teste 2: Carga Unificada
1. browser-b.html → Gerar Carga Unificada com Perfil
2. Copiar JSON
3. Recarregar página → carga persiste

### Teste 3: Envio
1. browser-a.html → colar carga → mensagem → enviar
2. Notificação aparece no Browser B
3. Recarregar → campos persistem

### Teste 4: Mensagens Recebidas
1. browser-b.html → 📬 Mensagens Recebidas
2. Carregar Mensagens
3. Marcar como lida / Remover

### Teste 5: Bloqueio de Ataque
1. Adulterar token JWT
2. Sistema bloqueia: ⚠️ Bloqueio de Segurança

### Teste 6: Offline
1. Desativar rede
2. Enviar mensagem → fila
3. Restaurar rede → envio automático

### Teste 7: Persistência
1. Fechar navegador
2. Abrir novamente → dados permanecem

---

## 📊 Resumo das Funcionalidades

| Funcionalidade | Status | Descrição |
|----------------|--------|-----------|
| Identidade Digital | ✅ | RSA-PSS no IndexedDB |
| Criptografia E2E | ✅ | RSA-OAEP com Hex |
| Assinatura JWT | ✅ | PS256 (RSA-PSS SHA-256) |
| Homologação | ✅ | Lista branca |
| Chaves VAPID | ✅ | IndexedDB |
| Chaves E2E | ✅ | IndexedDB |
| Subscription | ✅ | IndexedDB |
| Mensagens Envio | ✅ | Filas com status |
| Mensagens Recebidas | ✅ | Filas com status |
| Persistência Total | ✅ | Entre sessões |
| Interface Mensagens | ✅ | Listagem, marcar, remover |
| Offline First | ✅ | Background Sync |
| Chaves Servidor | ✅ | .env com Deno.env |
| CORS | ✅ | *.vanaware.com, localhost |

---

## 📁 Estrutura

proto/02-simple-push/
├── main.ts
├── build.ts
├── deno.json
├── .env (ignorado)
├── public/
│   └── manifest.json
├── src/
│   ├── browser-a.html
│   ├── browser-a.tsx
│   ├── browser-b.html
│   ├── browser-b.tsx
│   ├── service-worker.js
│   ├── constants/
│   │   └── db.ts
│   ├── utils/
│   │   └── db-helpers.ts
│   └── sw/
│       ├── cache.js
│       ├── push.js
│       ├── sync.js
│       ├── click.js
│       └── sw-mensagens.js
└── dist/

---

**Desenvolvido com ❤️ pela equipe Loco** 🚀

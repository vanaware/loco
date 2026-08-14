# 🔒 Criptografia no Loco — Especificação Técnica

O **Loco** adota um modelo de **Criptografia Híbrida Ponto a Ponto (End-to-End Encryption - E2E)** combinada com assinaturas digitais de identidade. Todo o tráfego de mensagens, dados de perfil e atualizações de contato é cifrado antes de sair do dispositivo do emissor e só pode ser decifrado pelo destinatário pretendido.

O servidor backend (Deno) atua estritamente como um **proxy cego**, sem capacidade técnica de ler os conteúdos das mensagens ou armazenar histórico de conversas.

## 1. Modelo de Chaves e Identidade

Cada dispositivo (nó) gera localmente dois pares de chaves assimétricas via Web Crypto API na primeira inicialização:

### A. Par de Chaves de Identidade VAPID (`ECDSA P-256`)

* **Finalidade:** Assinatura digital dos pacotes JWT (`alg: "ES256"`), garantindo a autenticidade do remetente e autorização do serviço Web Push (FCM).

* **Chave Pública (`vapidPublicKey`):** Compartilhada via convite (QR Code ou link `cjwt`). Serve como identificador e chave de verificação de assinatura (`kid`).

* **Chave Privada (`vapidPrivateKeyJwk`):** Armazenada no IndexedDB local (`AppConfig_DB`).

### B. Par de Chaves Criptográficas E2E (`RSA-OAEP-2048`)

* **Finalidade:** Cifragem/Decifragem assimétrica da chave simétrica temporária do envelope E2E.

* **Chave Pública (`e2ePublicKey`):** Módulo N e Expoente E compartilhados no cartão de visitas (`CompactContact`).

* **Chave Privada (`e2ePrivateKeyJwk`):** Mantida no dispositivo local para decifrar pacotes recebidos.

## 2. Compressão por Esquema Estático (Static Schema Compression)

Para garantir máxima eficiência no armazenamento de banco de dados (IndexedDB) e respeitar o rigoroso limite de 4.096 bytes de payload do Google FCM (Web Push), o Loco implementa o conceito de **Compressão por Esquema Estático**.

As chaves criptográficas geradas pela WebCrypto API no formato JWK possuem redundância estrutural fixa (`kty`, `alg`, `ext`, `key_ops`, `e`). O Loco remove essas redundâncias nas fronteiras de I/O (Disco e Rede) e as injeta de volta apenas no momento da execução na memória RAM.

| Tipo de Chave | O que é Armazenado/Enviado (Minificado) | O que é Removido (Estático) |
| --- | --- | --- |
| **VAPID Pública** | Coordenadas `x` e `y` | `kty`, `crv`, `ext`, `key_ops` |
| **VAPID Privada** | Escalar privado `d` | `kty`, `crv`, `ext`, `key_ops`, `x`, `y` |
| **E2E Pública** | Módulo `n` | `kty`, `alg`, `ext`, `key_ops`, `e` ("AQAB") |
| **E2E Privada** | Fatores primos (`d`, `p`, `q`, `dp`, `dq`, `qi`) | `kty`, `alg`, `ext`, `key_ops`, `e`, `n` |

*Nota Arquitetural: Graças a esta técnica, o `vapidPrivateKeyEnvelope` que blinda a chave privada do usuário para o proxy Server tem o seu tamanho reduzido drasticamente, pois cifra estritamente a variável escalar `d`.*

## 3. Estrutura do Envelope Cifrado e JWT

Todas as comunicações na rede viajam envelopadas em um token JWT assinado contendo um payload cifrado (`ct`):


```

+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor   |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - i: Vetor de Inicialização (IV AES-GCM 12 bytes - Base64)       |  |
|  |   - d: Dados Cifrados (Rotas/Mensagem + GZIP via fflate - Base64)  |  |
|  |   - k: Chave AES Cifrada com RSA-OAEP do Destinatário (Base64)    |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

## 4. Fluxo de Criptografia e Envio (Emissor)

Quando o usuário envia uma mensagem ou aciona um handshake (`src/utils/push-utils.ts` & `src/sw/sw-handshakes.ts`):


```

Objeto do Handshake (ex: { mensagem: { enviada, conteudo } })
|
v

1. Serialização em string JSON
|
v
2. Compressão de dados com GZIP (fflate) -> Redução de payload
|
v
3. Gera chave simétrica temporária AES-GCM-256 + IV aleatório de 12 bytes
|
v
4. Cifra os bytes comprimidos com AES-GCM-256 -> (d)
|
v
5. Cifra a chave AES com a e2ePublicKey (RSA-OAEP-2048) do destinatário -> (k)
|
v
6. Monta o envelope ct: { i, d, k }
|
v
7. Empacota no JWT: { sub: "hand", aud: destinatarioHash, jti: handshakeId, ct }
|
v
8. Assina o JWT com a vapidPrivateKeyJwk (ECDSA ES256) do remetente
|
v
9. Envia ao Servidor Proxy (Deno) para despacho via Web Push

```

## 5. Fluxo de Descriptografia e Recebimento (Receptor)

Quando uma notificação Push chega ao Service Worker (`src/sw/push.ts` & `src/sw/sw-handshakes.ts`):


```

Notificação Push recebida no Service Worker (JWT)
|
v

1. Valida a assinatura ECDSA (ES256) do JWT usando o 'kid' (VAPID Public Key)
|
v
2. Extrai o envelope ct: { i, d, k }
|
v
3. Decifra (k) com a e2ePrivateKey (RSA-OAEP) local -> Obtém a chave AES
|
v
4. Decifra (d) com a chave AES + IV (i) -> Obtém os bytes comprimidos
|
v
5. Descomprime GZIP (fflate) -> Converte JSON de volta para Objeto de Rotas
|
v
6. Encaminha para o módulo especializado (hand-mensagem.ts / hand-contato.ts)

```

## 6. Blindagem do Servidor Proxy (`vapidPrivateKeyEnvelope`)

Para enviar notificações Push sem expor a chave privada VAPID do usuário no servidor backend nem necessitar de um servidor de banco de dados centralizado:

1. O servidor Proxy possui um par de chaves RSA de infraestrutura estático.

2. O cliente cifra a versão minificada de sua `vapidPrivateKeyJwk` com a chave pública do servidor Deno, criando um `vapidPrivateKeyEnvelope`.

3. Ao solicitar a entrega de um Push (`/`), o cliente envia o envelope cifrado.

4. O servidor Deno decifra o envelope **exclusivamente na memória RAM** durante a requisição, assina o protocolo HTTP Web Push para o Google FCM / Apple APNs, e **descarta a chave imediatamente**.

5. O servidor Proxy executa apenas uma "auditoria cega" nas claims do JWT (`sub`, `aud`, `jti`), sem acesso aos dados da mensagem (`ct`).

## 7. Tabela Comparativa: Especificação Antiga vs. Implementação Atual

| Recurso | Especificação Legada (Documento Anterior) | Implementação Atual do Loco |
| --- | --- | --- |
| **Criptografia E2E** | ❌ Não suportada (apenas local) | ✅ **Nativa e Obrigatória (RSA-OAEP + AES-GCM)** |
| **Minificação de Chaves** | ❌ Chaves inteiras armazenadas | ✅ **Static Schema Compression (Redução drástica de Payload)** |
| **Troca de Chaves** | ❌ Inexistente | ✅ **Automatizada via QR Code e Links `CompactContact`** |
| **Assinatura de Identidade** | ⚠️ VAPID básica local | ✅ **Assinatura ECDSA P-256 (ES256) em cada JWT** |
| **Compressão de Dados** | ❌ Ausente | ✅ **Compressão GZIP (`fflate`) em todos os handshakes** |
| **Proteção de Dados em Repouso** | ⚠️ `masterKey` local | ✅ **Isolamento de Origem no IndexedDB e OPFS + `persist()`** |
| **Função do Servidor** | ❌ Desconhecida / Transparente | ✅ **Proxy Cego com Envelope VAPID em RAM** |

## 8. Proteção contra Ameaças

| Cenário de Ameaça | Proteção Implementada | Mecanismo |
| --- | --- | --- |
| **Interceptação na Rede (Man-in-the-Middle)** | ✅ **Protegido** | Criptografia E2E com RSA-OAEP-2048 + AES-GCM-256. |
| **Servidor Proxy / FCM Malicioso** | ✅ **Protegido** | O payload `ct` viaja cifrado. O servidor não possui a chave RSA privada do receptor nem a chave AES temporária. |
| **Acesso Físico ao Dispositivo** | ✅ **Protegido** | Dados isolados no IndexedDB com permissão `storage.persist()` e limpos no Logout. |
| **Falsificação de Remetente** | ✅ **Protegido** | Validação estrita da assinatura ECDSA P-256 no cabeçalho JWT (`kid`). |

## 9. Melhorias Futuras

1. **Forward Secrecy (Double Ratchet / Signal Protocol):** Evolução do handshake para gerar chaves efêmeras a cada mensagem trocada.

2. **WebAuthn / Biometria:** Bloqueio de acesso ao aplicativo exigindo impressão digital ou biometria facial antes de renderizar os sinais da UI.

3. **Verificação de Fingerprint Criptográfico:** Exibição do código de segurança visual (hash de chaves públicas) para confirmação presencial entre contatos.


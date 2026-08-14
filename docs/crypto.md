# 🔒 Criptografia no Loco — Especificação Técnica

O **Loco** adota um modelo de **Criptografia Híbrida Ponto a Ponto (End-to-End Encryption - E2E)** combinada com assinaturas digitais de identidade. Todo o tráfego de mensagens, dados de perfil e atualizações de contato é cifrado antes de sair do dispositivo do emissor e só pode ser decifrado pelo destinatário pretendido.

O servidor backend (Deno) atua estritamente como um **proxy cego**, sem capacidade técnica de ler os conteúdos das mensagens ou armazenar histórico de conversas.

## 1. Modelo de Chaves e Identidade

Cada dispositivo (nó) gera localmente dois pares de chaves assimétricas via Web Crypto API na primeira inicialização:

### A. Par de Chaves de Identidade VAPID (`ECDSA P-256`)
* **Finalidade:** Assinatura digital dos pacotes JWT (`alg: "ES256"`), garantindo a autenticidade do remetente e autorização do serviço Web Push (FCM).
* **Chave Pública (`vapidPublicKey`):** Compartilhada via convite. Serve como identificador de nó e chave de verificação de assinatura (`kid`).
* **Chave Privada (`vapidPrivateKeyJwk`):** Armazenada de forma persistente e isolada no IndexedDB local (`AppConfig_DB`).

### B. Par de Chaves Criptográficas E2E (`RSA-OAEP-2048`)
* **Finalidade:** Cifragem/Decifragem assimétrica da chave simétrica temporária (AES) embutida no envelope E2E.
* **Chave Pública (`e2ePublicKey`):** Módulo N e Expoente E compartilhados no cartão de visitas (`CompactContact`).
* **Chave Privada (`e2ePrivateKeyJwk`):** Mantida estritamente no dispositivo local para decifrar os pacotes P2P recebidos.

## 2. Compressão por Esquema Estático (Static Schema Compression)

Para garantir máxima eficiência no armazenamento de banco de dados (IndexedDB) e respeitar o rigoroso limite de 4.096 bytes de payload do Google FCM (Web Push), o Loco implementa o conceito de **Compressão por Esquema Estático**.

As chaves criptográficas geradas pela WebCrypto API no formato JWK possuem redundância estrutural fixa (`kty`, `alg`, `ext`, `key_ops`, `e`). O Loco remove essas redundâncias nas fronteiras de I/O (Disco e Rede) e as injeta de volta de forma defensiva ("reidratação") apenas no momento da execução na memória RAM.

| Tipo de Chave | O que é Armazenado/Enviado (Minificado) | O que é Removido (Estático) |
| --- | --- | --- |
| **VAPID Pública** | Coordenadas `x` e `y` | `kty`, `crv`, `ext`, `key_ops` |
| **VAPID Privada** | Escalar privado `d` | `kty`, `crv`, `ext`, `key_ops`, `x`, `y` |
| **E2E Pública** | Módulo `n` | `kty`, `alg`, `ext`, `key_ops`, `e` ("AQAB") |
| **E2E Privada** | Fatores primos (`d`, `p`, `q`, `dp`, `dq`, `qi`) | `kty`, `alg`, `ext`, `key_ops`, `e`, `n` |

## 3. Estrutura do Envelope Cifrado e JWT

Todas as comunicações na rede viajam envelopadas em um token JWT assinado contendo um payload cifrado (`ct`):

```text
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

## 4. Blindagem do Servidor Proxy (`vapidPrivateKeyEnvelope`)

Para enviar notificações Push sem expor a chave privada VAPID do usuário no servidor backend nem necessitar de um servidor de banco de dados centralizado:

1. O servidor Deno possui um par de chaves RSA de infraestrutura estático.
2. O cliente cifra a versão minificada de sua `vapidPrivateKeyJwk` com a chave pública do servidor Deno, criando um `vapidPrivateKeyEnvelope`.
3. Ao solicitar a entrega de um Push (`/api/proxy-push`), o cliente envia o envelope cifrado.
4. O servidor Deno decifra o envelope **exclusivamente na memória RAM**, assina o protocolo HTTP Web Push para o Google FCM, e **descarta a chave imediatamente**.

### 4.1 Invalidação Criptográfica de Cache (Server Key)

Para maximizar a performance (Offline-First), o PWA armazena a `SERVER_PUBLIC_KEY` no IndexedDB. Contudo, se a URL de Proxy (rota do servidor) for modificada, o cache é **invalidado agressivamente e deletado**. Isso garante que o app jamais crie um envelope VAPID usando uma chave RSA antiga que o novo servidor Edge da Cloudflare seria incapaz de decifrar.

## 5. Proteção contra Ameaças

| Cenário de Ameaça | Proteção Implementada | Mecanismo |
| --- | --- | --- |
| **Interceptação na Rede (MITM)** | ✅ **Protegido** | Criptografia E2E obrigatória (RSA-OAEP-2048 + AES-GCM-256). |
| **Servidor Proxy Malicioso** | ✅ **Protegido** | O payload E2E (`ct`) não compartilha a chave AES e o servidor não possui a chave RSA privada do receptor. |
| **Acesso Físico ao Dispositivo** | ✅ **Protegido** | Dados isolados no IndexedDB e OPFS, destruídos em cascata no Logout. |
| **Injeção de Caracteres (Base64)** | ✅ **Protegido** | Sanitização agressiva via Expressões Regulares (`/[^A-Za-z0-9\+\/]/g`) no interpretador JWT para mitigar falhas fatais do algoritmo `atob` durante copia/cola. |

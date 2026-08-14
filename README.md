# 📡 Loco — Mensageiro PWA Descentralizado

O **Loco** é um Progressive Web App (PWA) de mensagens instantâneas descentralizado, focado em privacidade absoluta, criptografia ponto a ponto (E2EE) e arquitetura *offline-first*. A aplicação opera sem um banco de dados centralizado de mensagens ou contatos, utilizando comunicação híbrida (**Web Push via FCM** e **WebRTC P2P**).

---

## 1. Visão Geral e Filosofia

No Loco, **cada navegador é um nó autônomo** que mantém seu próprio histórico local e suas próprias chaves criptográficas.

* **Sem Servidor de Mensagens:** O servidor backend (Deno 2.x) atua exclusivamente como um *proxy cego* de entrega de notificações Web Push e provedor de infraestrutura de chaves temporárias para envelopes VAPID.
* **Privacidade e Anonimato por Design:** A criação do perfil exige apenas um Nome ou pseudônimo (o E-mail é estritamente opcional). O servidor não armazena logs de conversas, listas de contatos, metadados ou conteúdo de mensagens.
* **Resistência à Evicção:** Os dados do usuário residem unicamente no dispositivo local através do IndexedDB e Origin Private File System (OPFS), protegidos por solicitações de Armazenamento Persistente.

```text
+------------------+         +-------------------+         +------------------+
|  Nó A (Emissor)  |         |   Servidor Proxy  |         |  Nó B (Receptor) |
|  (IndexedDB/SW)  |         |   Deno + WebPush  |         |  (IndexedDB/SW)  |
+--------+---------+         +---------+---------+         +--------+---------+
         |                             |                            |
         | --- 1. Envia JWT Cifrado -> |                            |
         |    (com VAPID Envelope)     | --- 2. Repassa via FCM ->  |
         |    (sub: "hand")            |    (Gateway WebPush)       |
         |                             |                            | --- 3. Recebe Push
         |                             |                            |      e Decifra E2E
         |                             |                            |
         | <--- 4. Handshake de Resposta (Auto-Ack) via Proxy ----- |

```

---

## 2. A Máquina de Estados (O Roteador de Handshakes)

Na arquitetura do Loco, **toda e qualquer comunicação na rede é um Handshake** de sincronização de estados. Não existem fluxos isolados para mensagens de texto ou comandos de sistema.

O Roteador (`sw-handshakes.ts`) funciona como uma "Máquina de Estados" assíncrona baseada na arquitetura *Offline-First*, operando via IndexedDB (`Handshake_DB`):

* **`FluxoIn` (Entrada):** Pacotes recebidos, descriptografados pelo Service Worker e enfileirados para processamento local por módulos especializados.
* **`FluxoOut` (Saída):** Pacotes preparados pela UI/SW, enfileirados, comprimidos e cifrados para envio à rede (com controle de até 3 tentativas e fallback em restabelecimento de conexão).

### 2.1. Módulos Especializados (As Rotas)

O Roteador distribui os payloads descodificados para módulos especialistas localizados em `src/handshakes/`:

* 💬 **Rota Mensagem (`hand-mensagem.ts`):** Tráfego bidirecional de mensagens e recibos de entrega (Auto-Ack instantâneo sinalizando status de entrega `✓✓` e notificações do SO).
* 👤 **Rota Profile (`hand-profile.ts`):** Troca sob demanda de atributos de perfil (nome, e-mail, chaves públicas e endpoint de subscrição).
* 🛡️ **Rota Contato (`hand-contato.ts`):** Gestão de saúde criptográfica e ciclo de confiança mútua (`me` e `trusted`).

### 2.2. Injeção de Carona (Piggybacking)

Para garantir resiliência extrema em redes instáveis ou quando contatos atualizam suas subscrições Push, o Roteador utiliza *Piggybacking*. Se um nó tenta enviar uma mensagem para um destinatário que não possui seu perfil atualizado (status `me: 'none'` ou `me: 'wrong'`), o Roteador **injeta automaticamente seu Cartão de Visitas no mesmo pacote da mensagem**. O dispositivo receptor ajusta a chave e o endpoint antes mesmo de exibir o balão da conversa.

---

## 3. Padrões e Regras de Desenvolvimento

### 3.1. Diretrizes Principais

1. **Runtime Único (Deno 2.x):** Proibido o uso de Node.js, `npm` tradicional ou pacotes com dependências C++ nativas.
2. **Zero `localStorage`:** É terminantemente proibido utilizar `localStorage` devido a bloqueios síncronos da I/O thread do navegador. Todo o estado persistente utiliza a camada IndexedDB (`src/utils/db-helpers.ts`) via `idb-keyval`.
3. **Isolamento de Processamento:** Operações síncronas pesadas (compressão GZIP com `fflate`, geração de chaves RSA/ECDSA com WebCrypto, parsing de QR Code, Minificação de Chaves) são executadas em segundo plano ou no Service Worker para manter a UI fluída em 60 FPS.
4. **Interface Reativa:** Construída com **Preact**, gerenciamento de estado via **Signals** (`@preact/signals`) e componentes visuais do **Material Design 3** (`@material/web`).

---

## 4. Arquitetura de Segurança e Criptografia

O Loco utiliza um modelo de criptografia Híbrida (Assimétrica + Simétrica) em múltiplas camadas:

```text
+-------------------------------------------------------------------------+
|                        JWT PAYLOAD (Max 4096 bytes)                     |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Assinatura Externa: ECDSA (VAPID P-256) - Autenticidade do Emissor   |  |
|  +-------------------------------------------------------------------+  |
|  | Envelope Cifrado (ct):                                            |  |
|  |   - Dados Cifrados: AES-GCM-256 (Rotas + Payload + GZIP)           |  |
|  |   - Chave AES Cifrada: RSA-OAEP-2048 (Chave Pública do Receptor)   |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+

```

1. **Identidade / Assinatura (VAPID):** (ECDSA P-256) Usado para assinar os tokens JWT (`alg: "ES256"`), identificando o remetente através da chave pública (`kid`).
2. **Criptografia Ponto a Ponto (E2E):** (RSA-OAEP-2048 + AES-GCM-256) O conteúdo do handshake é comprimido com GZIP (`fflate`) e cifrado com uma chave AES gerada no momento. Essa chave AES é então cifrada com a chave pública RSA do destinatário.
3. **Blindagem do Servidor Proxy (VAPID Envelope):** O servidor proxy possui um par de chaves RSA estático. O cliente cifra a versão minificada de sua chave privada VAPID em um envelope criptográfico. O servidor proxy abre esse envelope temporariamente na memória RAM apenas para assinar o cabeçalho HTTP VAPID exigido pelo gateway do Web Push (FCM), descartando-a imediatamente após o envio.

---

## 5. Estrutura de Convites e Sincronização Compacta (Static Schema Compression)

Para respeitar o limite rigoroso de **4.096 bytes** impostos pelos provedores Push (FCM) e manter o QR Code legível pela câmera em matrizes compactas, o Loco implementa a interface `CompactContact` (`src/utils/share-utils.ts`) e o conceito de *Static Schema Compression* nas chaves.

Objetos JWK extensos são reduzidos, eliminando a redundância da WebCrypto API, e mapeados em atributos compactos de duas letras. Endpoints de servidores de push são tokenizados:

| **Atributo Original** | **Atributo Compacto (CompactContact)** | **Descrição** |
| --- | --- | --- |
| `email` | `em` | E-mail do contato (Opcional) |
| `name` | `nm` | Nome do contato |
| `vapidPublicKey` | `vp` | Chave VAPID Pública Minificada (Apenas coordenadas X e Y) |
| `e2ePublicKey` | `ep` | Chave RSA Pública E2E Minificada (Apenas módulo N) |
| `subscription.endpoint` | `se` | Endpoint Push (prefixo `1:` substitui a URL do FCM) |
| `subscription.keys.p256dh` | `sp` | Chave p256dh da subscrição Push |
| `subscription.keys.auth` | `sa` | Chave de autorização Push |
| `vapidPrivateKeyEnvelope` | `ve` | Envelope da chave VAPID cifrada |
| `subscription.proxyserver` | `ps` | Endereço estrito do Servidor Proxy (Auto-Discovery) |
| `trusted` | `tr` | Indicador de contato confiável |
| `request` | `req` | Flag de solicitação de resposta |

Formatos de transporte suportados:

* **QR Code Binário Compacto (`cqr`):** String Base64Url contendo o JSON comprimido via GZIP.
* **Link Web Comprimido (`cjwt`):** URL para compartilhamento em redes externas (`/share.html?cjwt=...`).

---

## 6. Ciclo de Confiança Mútua dos Contatos

Cada contato armazenado possui dois indicadores de estado que descrevem a saúde da relação criptográfica:

1. **`trusted` (boolean):** Definido localmente pelo usuário ao escanear o QR Code ou homologar manualmente o contato.
2. **`me` (MeStatus):** Indica como o dispositivo do contato enxerga o seu perfil local:
* `'trusted'`: O contato confirmou que você é um contato confiável no dispositivo dele.
* `'saved'`: O contato tem o seu perfil salvo, mas ainda não o marcou como confiável.
* `'wrong'`: Os dados do seu perfil no dispositivo do contato estão desatualizados (ex: alteração de subscrição Push).
* `'none'`: O contato ainda não possui seus dados salvos.



---

## 7. Armazenamento Local (IndexedDB)

Os dados são divididos em bancos de dados isolados utilizando a biblioteca `idb-keyval`:

| **Nome do Banco (DB_NAMES)** | **Chave Primária** | **Tipo de Dado** | **Finalidade** |
| --- | --- | --- | --- |
| `AppConfig_DB` | `"profile"` | `ProfileConfig` | Perfil do usuário local, chaves, configurações de rede, envelope VAPID e subscrição Push. |
| `BrowserB_Contatos_DB` | Hash SHA-256 (`vapidPublicKey`) | `Contato` | Agenda de contatos, chaves E2E e estado de confiança (`me` / `trusted`). |
| `Chat_DB` | ID da Mensagem | `Chat` | Histórico de mensagens unificado (recebidas/enviadas) com indexação virtual. |
| `Handshake_DB` | ID do Handshake (`jti`) | `Handshake` | Fila assíncrona da Máquina de Estados (fluxos `in` e `out`). |

---

## 8. Diagnóstico e Resolução de Problemas

* **Erro "The string to be decoded is not correctly encoded" ao importar contato:**
* *Causa:* Quebras de linha ou espaços invisíveis ao colar a string do token.
* *Solução (Já Implementada):* A camada `jwt-helpers.ts` possui sanitização defensiva via Expressão Regular (`/[^A-Za-z0-9\+\/]/g`) que expurga formatações corrompidas de *copy/paste* antes da decodificação Base64.


* **Rejeição HTTP 413 no Envio de Mensagem (`Payload muito grande`):**
* *Causa:* O JWT ultrapassou o limite de 4.096 bytes imposto pelo serviço Web Push (FCM).
* *Solução:* O payload cifrado utiliza *Static Schema Compression* e o compressor GZIP (`fflate`).


* **Erro de Rota de Push Proxy e Falha de CORS:**
* *Solução:* Acesse as "Configurações" do App e clique em "Auto-Discovery". O sistema remapeará a sua rota estática (como GitHub Pages) para o Worker público de *fallback* ativo.



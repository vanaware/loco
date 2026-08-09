# 🤝 Arquitetura do Roteador de Handshakes (Loco)

Este documento descreve a especificação técnica do **Roteador Genérico de Handshakes** do **Loco**, detalhando o funcionamento da máquina de estados assíncrona *Offline-First*, os módulos especializados de rotas, o mecanismo de injeção de carona (*Piggybacking*) e a auditoria de confiança mútua.

---

## 1. Visão Geral e Filosofia

No **Loco**, não existem fluxos de rede isolados para mensagens de texto, imagens ou comandos de sistema. **Toda e qualquer comunicação na rede é um Handshake de sincronização de estados.**

O Roteador (`src/sw/sw-handshakes.ts`) opera dentro do Service Worker como uma **Máquina de Estados assíncrona** responsável por coordenar a persistência local e o transporte criptográfico E2E.

A arquitetura organiza o ciclo de vida de cada interação em duas vias principais dentro da tabela `Handshake_DB`:

* **`FluxoIn` (Entrada):** Pacotes recebidos da rede, descriptografados pelo Service Worker e enfileirados para processamento local por módulos especialistas.
* **`FluxoOut` (Saída):** Pacotes preparados pela UI ou Service Worker, enfileirados, comprimidos e cifrados para envio assíncrono.

---

## 2. Estrutura de Dados no IndexedDB (`Handshake_DB`)

Todas as interações criam ou atualizam registros na tabela `Handshake_DB` (gerenciada via `src/utils/db-helpers.ts` e `idb-keyval`):

```typescript
export interface Handshake { 
  id: string;          // ID único do handshake (jti / UUID)
  aud: string;         // Hash SHA-256 do contato destinatário/remetente (vapidPublicKey)
  in?: FluxoIn;        // Dados e estado do fluxo de recepção
  out?: FluxoOut;      // Dados e estado do fluxo de emissão
  createdAt: number;   // Timestamp de criação
  updatedAt: number;   // Timestamp da última alteração de estado
}

export interface FluxoIn {
  status: 'recebido' | 'processando' | 'processado' | 'falha';
  rotas: HandshakeRotas; // Payload descriptografado e descompactado
  tentativas: number;    // Contador de execuções
  erro?: string;         // Descrição detalhada da falha, se houver
}

export interface FluxoOut {
  status: 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
  rotas: HandshakeRotas; // Payload original a ser comprimido e cifrado
  tentativas: number;    // Contador de retentativas
  erro?: string;
}

// Contêiner central de payloads roteáveis
export interface HandshakeRotas { 
  profile?: any;   // Dados de perfil e cartão de visitas (hand-profile.ts)
  mensagem?: any;  // Mensagens de texto e recibos de leitura (hand-mensagem.ts)
  contato?: any;   // Sincronização compacta de confiança (hand-contato.ts)
}
```

---

## 3. O Roteador Central (`src/sw/sw-handshakes.ts`)

O Service Worker principal atua como um orquestrador logístico e criptográfico neutro, desacoplado das regras visuais da interface:

```text
               +-----------------------------------+
               |     Ações do Usuário / PUSH       |
               +-----------------+-----------------+
                                 |
                                 v
               +-----------------+-----------------+
               |     IndexedDB: Handshake_DB       |
               +--------+-----------------+--------+
                        |                 |
             +----------+                 +----------+
             |                                       |
             v                                       v
   +-------------------+                   +-------------------+
   |   FluxoIn (IN)    |                   |   FluxoOut (OUT)  |
   | Status: recebido  |                   | Status: pendente  |
   |   -> processado   |                   |   -> enviado      |
   +---------+---------+                   +---------+---------+
             |                                       |
             v                                       v
   +-------------------+                   +-------------------+
   | Módulos Handshake |                   |  Proxy Web Push   |
   | (mensagem,        |                   |  (AES-GCM +       |
   |  contato,         |                   |   RSA + JWT)      |
   |  profile)         |                   +-------------------+
   +-------------------+
```

### A. Fluxo de Saída (Envio para a Rede)
1. **Varredura:** O Service Worker consulta a tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'`.
2. **Atualização de Estado:** Transiciona o status para `'enviando'`.
3. **Injeção de Carona (*Piggybacking*):**
   * O Roteador inspeciona a agenda local (`BrowserB_Contatos_DB`) verificando o estado `me` do destinatário.
   * Se o contato alvo estiver classificado como `me: 'none'` (ainda não possui nossos dados) ou `me: 'wrong'` (dados locais desatualizados), o Roteador **injeta automaticamente o Cartão de Visitas local (`rotas.profile`) no mesmo pacote da mensagem**.
4. **Compressão e Cifragem E2E:**
   * O objeto `handshake.out.rotas` é serializado em JSON e comprimido com GZIP (`fflate`).
   * Cifra-se o bloco comprimido via AES-GCM-256 e a chave AES simétrica via RSA-OAEP-2048 (`e2ePublicKey` do receptor).
5. **Assinatura e Despacho:**
   * O envelope cifrado (`ct`) é empacotado em um token JWT (`sub: "hand"`), assinado via ECDSA P-256 (`alg: "ES256"`) com a chave VAPID privada local e despachado ao Proxy Deno (`/api/proxy-push`).

### B. Fluxo de Entrada (Recepção da Rede)
1. O evento `push` é capturado em `src/sw/push.ts`.
2. Valida-se a assinatura do JWT (`kid`) com a `vapidPublicKey` do emissor.
3. Decifra-se o envelope `ct` com a `e2ePrivateKey` (RSA-OAEP) local e desfaz-se a compressão GZIP (`fflate`).
4. Grava-se o registro em `Handshake_DB` com `in = { rotas: payloadObj, status: 'recebido', tentativas: 0 }`.
5. Invoca-se o Despachante Interno.

### C. O Despachante Interno (Processador de Fila)
* O Processador varre as entradas com `in.status === 'recebido'`, altera o status para `'processando'` e aciona em paralelo os **Módulos Especializados** em `src/handshakes/`.
* Como a execução é modular, um pacote que utilizou *Piggybacking* processa `rotas.profile` e `rotas.mensagem` no mesmo ciclo.

---

## 4. Módulos Especializados de Rotas (`src/handshakes/`)

Cada módulo especialista implementa a função `processarHandshake({ in, out })`:

### 💬 Rota Mensagem (`src/handshakes/hand-mensagem.ts`)
Gerencia o fluxo bidirecional de mensagens e recibos de confirmação:
* **Nova Mensagem Recebida (`data.enviada`):**
  1. Salva a mensagem no banco local `BrowserB_MensagensRecebidas_DB`.
  2. Aciona a notificação nativa do sistema operacional (`self.registration.showNotification`).
  3. **Auto-Ack Instantâneo:** Gera imediatamente um `FluxoOut` de resposta acusando a entrega da mensagem (`data.recebida`).
* **Recibo de Entrega Recebido (`data.recebida`):**
  * Atualiza o registro correspondente em `BrowserA_MensagensEnviadas_DB` para o status `'entregue'`, desenhando os "dois tiques" (`✓✓`) na interface do emissor.

### 👤 Rota Profile (`src/handshakes/hand-profile.ts`)
Trata a troca e atualização sob demanda de atributos de perfil (nome, foto e e-mail). Permite solicitar apenas campos específicos (ex: `['name', 'email']`), otimizando o consumo de dados.

### 🛡️ Rota Contato e Sincronização Compacta (`src/handshakes/hand-contato.ts` & `src/utils/share-utils.ts`)
Sincroniza a saúde criptográfica da relação entre dois nós.

Para respeitar o limite de **4.096 bytes** da RFC 8291 (FCM), os contatos utilizam a interface **`CompactContact`** (atributos de 2 letras como `vx`, `vy`, `en`, `se`, `sp`, `sa`, `ve`, `tr`), reduzindo o payload de ~2.5 KB para menos de **750 bytes**.

#### Auditoria do Ciclo de Confiança Mútua (`me`):
O módulo avalia o estado `me` do contato local comparando as credenciais recebidas:
* **`none`:** O dispositivo do parceiro retornou endpoint/chaves vazias (não possui nossos dados salvos).
* **`trusted`:** O parceiro possui nosso perfil salvo e homologou a relação (`tr: true`).
* **`saved`:** O parceiro possui nosso perfil salvo, mas ainda não realizou a verificação explícita.
* **`wrong` (Auditoria Paranoica):** O Roteador compara byte a byte as chaves VAPID, RSA e o Envelope recebido com o perfil local. Se **qualquer byte diferir**, sinaliza `wrong` e bloqueia a comunicação E2E até o re-alinhamento das chaves.

---

## 5. Vantagens Arquiteturais

1. **Garantia de Enquadramento no Limite de 4KB:** Graças à padronização `CompactContact` e compressão GZIP (`fflate`), mesmo pacotes complexos utilizam menos de 20% do limite da rede FCM.
2. **Autocura de Conexões por Piggybacking:** Se um contato atualizou sua subscrição Web Push, o envio de uma mensagem simples transporta o perfil atualizado em carona, reparando a base de dados do receptor antes da exibição da conversa.
3. **Extensibilidade Sem Boilerplate:** A criação de novas funcionalidades (ex: apagar mensagens, reações, sinalizador de digitação) exige apenas a adição de um novo arquivo em `src/handshakes/hand-*.ts`, reaproveitando toda a infraestrutura de criptografia, filas e retentativas.
4. **Resiliência Local-First:** Alterações realizadas sem conexão de rede ficam retidas com status `'pendente'` no `Handshake_DB` e são processadas automaticamente assim que o evento `online` for disparado.

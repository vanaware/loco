
# 🤝 Arquitetura do Roteador de Handshakes (Loco)

## 1. Visão Geral

O sistema de mensagens do Loco opera através de um **Roteador Genérico de Handshakes**.

Não existem fluxos separados na rede para "mensagens" ou "comandos". **Toda e qualquer comunicação na rede é um Handshake** de sincronização de estados.

O Roteador funciona como uma "Máquina de Estados" assíncrona baseada na arquitetura *Offline-First*, composta por duas vias principais dentro de um único registro no IndexedDB:

* **`FluxoIn` (Entrada):** O que o seu dispositivo recebeu, descriptografou e precisa processar localmente.
* **`FluxoOut` (Saída):** O que o seu dispositivo preparou e precisa criptografar e enviar para a rede.

---

## 2. Estrutura de Dados no IndexedDB (`Handshake_DB`)

Cada interação gera um registro na tabela `Handshake_DB` com a seguinte tipagem:

```typescript
export interface Handshake { 
  id: string;          // ID único gerado localmente ou recebido (jti)
  aud: string;         // Hash SHA-256 do contato alvo (Destinatário/Remetente)
  in?: FluxoIn;        // Dados e status recebidos via Push
  out?: FluxoOut;      // Dados e status preparados para envio
  createdAt: number; 
  updatedAt: number; 
}

export interface FluxoIn {
  status: 'recebido' | 'processando' | 'processado' | 'falha';
  rotas: HandshakeRotas; // O "recheio" descriptografado recebido
  tentativas: number; 
  erro?: string;
}

export interface FluxoOut {
  status: 'pendente' | 'enviando' | 'enviado' | 'falha' | 'entregue';
  rotas: HandshakeRotas; // O "recheio" que será criptografado e enviado
  tentativas: number; 
  erro?: string;
}

// O objeto centralizador de payloads
export interface HandshakeRotas { 
  profile?: any; 
  mensagem?: any; 
  contato?: any; 
}

```

---

## 3. O Roteador Central (`sw-handshakes.ts`)

O Service Worker principal não conhece regras de negócio da UI. O trabalho dele é puramente logístico e de segurança E2E:

### A. Fluxo de Saída (Enviando para a rede)

1. O Service Worker varre o banco buscando Handshakes com `out.status === 'pendente'` ou `'enviando'` (presos em falha).
2. Ele altera o status para `'enviando'`.
3. **PIGGYBACKING (Injeção de Carona) 🔥**: Antes de criptografar, o Roteador verifica o status local do destinatário. Se o contato alvo estiver classificado como `me: 'none'` (ele não tem nossos dados) ou `me: 'wrong'` (os dados dele estão corrompidos/desatualizados), o Roteador injeta **silenciosamente** os nossos dados de Perfil atualizados dentro do mesmo payload da mensagem!
4. O objeto final de `handshake.out.rotas` é serializado, compactado com GZIP (`fflate`) e **criptografado ponta-a-ponta (E2E)** com a chave pública RSA do destinatário (`aud`).
5. Um JWT externo é gerado (`sub: "hand"`) assinado pela chave VAPID privada do remetente e despachado via POST para o servidor Proxy (Deno).

### B. Fluxo de Entrada (Recebendo da rede)

1. O Push chega ao dispositivo, o SW intercepta (`sub: "hand"`).
2. A assinatura do JWT é validada matematicamente usando o cabeçalho (`kid`).
3. O envelope (`ct`) é descriptografado usando a chave privada RSA local, e em seguida descompactado.
4. Um registro de Handshake é salvo/atualizado contendo `handshake.in = { rotas: payloadObj, status: 'recebido' }`.
5. O Processador de Fila Interno é invocado.

### C. O Despachante Interno

O Processador varre a fila de entrada (`in.status === 'recebido'`), marca como `'processando'` e distribui para os **Módulos Especializados** (Rotas) com base nas propriedades ativas no objeto. Como a execução é paralela, um único handshake que utilizou *Piggybacking* processará `rotas.contato` e `rotas.mensagem` no mesmo milissegundo.

---

## 4. Módulos Especializados (As Rotas)

Cada módulo reside em `src/handshakes/` e possui uma função `Processar({ in, out })`.

### 💬 Rota Mensagem (`hand-mensagem.ts`)

Responsável pelo tráfego bidirecional de mensagens e recibos de leitura (Auto-Ack).

* **Nova Mensagem (`data.enviada`):** Salva no banco local, exibe a notificação Push do SO e gera *imediatamente* um `FluxoOut` de volta acusando o recebimento do pacote (`status: 'nao_lida'`).
* **Recibo de Entrega (`data.recebida` + `status`):** Atualiza a mensagem na caixa de saída do remetente para `'entregue'` (desenhando os "dois tiques ✓✓" na UI).

### 👤 Rota Profile (`hand-profile.ts`)

Responsável pela exibição genérica de dados passivos. Utiliza arrays de `campos` (ex: `['name', 'email']`) para responder apenas com os dados solicitados, evitando expor chaves sem necessidade.

### 🛡️ Rota Contato e Sincronização Compacta (`hand-contato.ts` & `share-utils.ts`)

Este é o núcleo de gestão de saúde criptográfica do app. Para evitar o limite restrito de 4.096 bytes imposto pelas redes da Apple/Google (FCM), os contatos **não trocam objetos JWK inteiros**.

A rota converte Perfis em **Sincronizações Compactas** usando siglas de 2 letras (Ex: `tr`: Trusted, `vx`: Vapid X, `en`: E2E N Modulus, `se`: Subscription Endpoint). Isso derruba o payload de ~2.5KB para menos de **750 bytes**.

O Roteador avalia o "Ciclo de Confiança Mútua" em três frentes:

* **PULL (Diagnóstico de Confiança - `confirmarSubscription`):** Um aparelho pergunta ao outro "Quais os dados que você tem salvos sobre mim?".
* **PUSH (Injeção de Perfil - `enviarSubscription`):** Um aparelho "empurra" agressivamente seus próprios dados compactados para o outro salvar e passa a existir na rede do destinatário.
* **AVALIAÇÃO DO STATUS (`me`):** Ao receber dados, a rota faz uma auditoria estrita, gerando 4 possíveis estados na interface:
* `none`: O outro aparelho devolveu endpoint vazio. (Ele nos apagou ou não nos conhece).
* `trusted`: O outro aparelho nos conhece e sua flag de verificação mútua é `tr: true`.
* `saved`: O outro aparelho nos salvou organicamente, mas nunca clicou em "Verificar".
* `wrong`: Auditoria Paranoica. O Roteador compara byte a byte as chaves VAPID, RSA e o Envelope recebido com os do nosso perfil. Se **qualquer byte diferir**, bloqueia a comunicação E2E e avisa que o dispositivo do parceiro está desatualizado.



---

## 5. Principais Vantagens da Nova Arquitetura

1. **Imunidade ao Limite do Web Push (4KB):** Graças à padronização universal em `share-utils.ts` e à compressão `fflate`, os handshakes mais complexos ocupam menos de 20% do limite da rede FCM.
2. **Reparação Silenciosa (Piggybacking):** Mensagens não se perdem se as rotas estiverem levemente dessincronizadas. O ato de enviar um texto automaticamente "pega carona" e autoconserta a base de dados do recebedor antes que ele leia a mensagem.
3. **Extensibilidade Modular:** Para criar recursos futuros (ex: *Excluir foto, Transferência de Arquivos OPFS, Sinalizador de "Digitando..."*), basta criar um novo módulo `hand-*.ts`. O fluxo de criptografia, persistência e tentativas (retries) é absorvido gratuitamente.
4. **Resistência Offline Absoluta:** O sistema de `tentativas` é universal. Se você mudar seu nome enquanto estiver num voo sem internet, a intenção será encapsulada num `FluxoOut`. Assim que o celular tocar numa rede Wi-Fi, a máquina de estados retomará o processo de envio perfeitamente.
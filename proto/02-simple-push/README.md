# Loco Proto 02 — Sistema de Web Push Inteligente, E2EE com Identidade JWT e Sincronização Offline

Este protótipo demonstra a implementação completa de um pipeline de **Web Push Notifications** moderno, resiliente e de segurança máxima (*Zero-Trust*) utilizando o ecossistema **Deno 2.0+** [SW]. 

O projeto resolve os principais desafios arquiteturais de privacidade e rede em PWAs:
1. **Identidade Digital Federada via JWT (RFC 7519):** Remetentes assinam mensagens gerando tokens JWT estruturados com metadados dinâmicos (Nome/E-mail).
2. **Criptografia de Aplicação de Ponta a Ponta (E2EE):** O texto trafega totalmente ilegível (*cipherText*) para intermediários (Deno e Google/Apple), sendo aberto apenas na RAM do destinatário.
3. **Mascaramento RSA-OAEP de Infraestrutura:** A chave privada VAPID gerada no navegador viaja e reside na tela protegida por criptografia, sendo decodificada unicamente na RAM do servidor Deno no milissegundo do disparo.
4. **Resiliência de Rede (Background Sync API + IndexedDB):** Mensagens enviadas em modo offline são enfileiradas localmente de forma transacional e disparadas sozinhas assim que a conexão é restaurada.

---

### 🏗️ Arquitetura do Sistema e Fluxo Criptográfico

O ecossistema opera sob um modelo de chaves assimétricas duplas (transporte e aplicação):

+-------------------------------------------------------------------------------+

|                                  BROWSER A                                    |
|  [Perfil: John Doe]                                                           |
|  1. Cifra a mensagem usando a Chave Pública RSA-OAEP do Browser B             |
|  2. Assina o envelope usando sua Chave Privada RSA-PSS permanente              |
|  3. Constrói e sela o token JWT único (header.payload.signature)              |
+---------------------------------------+---------------------------------------+
                                        |
                    +-------------------+-------------------+

                    | (Se Online)                           | (Se Offline)
                    ▼                                       ▼
         +--------------------+                  +--------------------+

         |    Fetch POST      |                  |     IndexedDB      |
         |  Caminho Relativo  |                  | Fila de Disparos   |
         +----------+---------+                  +----------+---------+

                    |                                       |
                    |                                       | (Internet retornou)
                    |                                       ▼
                    |                            +--------------------+

                    |                            |  Background Sync   |
                    |                            |   Service Worker   |
                    |                            +----------+---------+

                    |                                       |
                    +-------------------+-------------------+
                                        |
                                        ▼
+-------------------------------------------------------------------------------+

|                                 SERVIDOR DENO                                 |
|  [Proxy Stateless / Filtro de CORS Dinâmico para *.vanaware.com]              |
|  1. Executa a auditoria cega das claims textuais do JWT sem possuir chaves    |
|  2. Descriptografa a Chave Privada VAPID na RAM usando sua RSA local          |
|  3. Assina o cabeçalho HTTP VAPID e despacha o JWT intacto para a nuvem       |
+---------------------------------------+---------------------------------------+
                                        |
                                        ▼
+-------------------------------------------------------------------------------+

|                            CENTRAIS DE PUSH (FCM/APNs)                        |
|  Recebem a stream binária criptografada de rede e entregam ao dispositivo     |
+---------------------------------------+---------------------------------------+
                                        |
                                        ▼
+-------------------------------------------------------------------------------+

|                                  BROWSER B                                    |
|  [Service Worker / PWA / Perfil: Alice]                                       |
|  1. Intercepta o Push e isola os bytes do JWT                                 |
|  2. Lê o e-mail do emissor e puxa a chave da Lista Branca do IndexedDB        |
|  3. Valida a assinatura digital RSA-PSS (Garante a autenticidade do A)        |
|  4. Descriptografa a mensagem usando sua Chave Privada RSA-OAEP local         |
|  5. Dispara a Notificação de Tela com Som e Vibração customizados             |
+-------------------------------------------------------------------------------+


1. **`browser-b.html` (O Receptor / PWA):** Coleta o perfil do usuário (Alice), solicita as chaves de infraestrutura do Deno para mascarar sua chave privada VAPID em formato Hex e gera um **Payload Bundle unificado**. Possui também um painel de **Lista Branca** para homologar as chaves públicas de emissores autorizados.
2. **`browser-a.html` (O Emissor / Remetente):** Registra seu perfil (John Doe) e gera sua identidade permanente de assinatura. Ao enviar uma mensagem, ele a cifra com a chave pública do Browser B, assina digitalmente o bloco com sua chave privada e gera um token **JWT legítimo de 3 partes** (`header.payload.signature`).
3. **`main.ts` (O Backend / Proxy Stateless):** Inicializa um par de chaves RSA-OAEP na memória RAM ao ligar. Valida requisições através de um filtro dinâmico de **CORS restrito a `*.vanaware.com` e `localhost`**. Ele é incapaz de ler o conteúdo da mensagem, atuando apenas como um proxy cego de despacho.
4. **`service-worker.js` (O Motor em Background):** Gerencia o cache offline e o ciclo de vida do PWA. Ao receber o push, ele realiza a perícia digital do JWT: valida o emissor na lista branca do IndexedDB, verifica a integridade da assinatura, decifra o texto oculto com sua chave privada local e renderiza a notificação com som e vibração customizados [SW].

---

## 🧠 Conceitos Avançados Implementados

### 1. Zero-Trust e Isolamento de Chaves Privadas
Nenhuma chave privada de aplicação jamais trafega pela rede ou é exposta ao código JavaScript legível do navegador. Usando a *Web Crypto API* com a flag `extractable: false`, as chaves privadas de criptografia e assinatura ficam permanentemente trancadas no cofre de hardware/IndexedDB de cada dispositivo, imunes a ataques de injeção de script (XSS) ou interceptações de proxy.

### 2. Envelope JWT (JSON Web Token) e Auditoria Cega
O `main.ts` realiza uma inspeção cirúrgica sem chaves. Como a segunda parte do JWT viaja em Base64URL comum, o servidor consegue ler as claims textuais `iss` (quem enviou) e `sub` (quem vai receber) para imprimir relatórios de auditoria em tempo real no terminal, sem possuir a chave de decodificação e sem violar o segredo do texto criptografado.

### 3. Sincronização Resiliente Offline com Confirmação Visual
Se o `browser-a` transmitir um JWT sem internet, a Background Sync API impede a falha de rede. O token é persistido no IndexedDB e o Service Worker agenda uma tarefa silenciosa. Assim que o sistema operacional reportar o retorno da conexão, o Worker processa a transmissão em background (mesmo com o navegador fechado) e dispara uma notificação local nativa de sucesso para o usuário: *"✨ Conexão Restaurada! Suas mensagens offline foram transmitidas com sucesso!"*.

---

## 🤖 📋 IA Replication Guide (Diretrizes para outros Agentes de IA)

*Se você é uma Inteligência Artificial estendendo, refatorando ou portando este sistema para outras linguagens (Node.js, Go, Python, etc.), siga rigidamente os seguintes padrões para não quebrar o ecossistema:*

* **Algoritmo de Assinatura (JWT):** O Browser A deve assinar o token utilizando **RSA-PSS com hash SHA-256 e Salt Length de 32 bytes** (mapeado no JWT como cabeçalho `{"alg": "PS256", "typ": "JWT"}`). O cabeçalho e carga devem ser convertidos estritamente usando codificação Base64URL segura.
* **Algoritmo de Cifragem (E2EE):** Mensagens internas e o mascaramento da chave VAPID do servidor utilizam obrigatoriamente **RSA-OAEP com hash SHA-256**. O output binário gerado na criptografia do cliente deve ser convertido em strings **Hexadecimais puras** para transitar de forma segura dentro das propriedades do JSON HTTP POST sem sofrer corrupção de caracteres.
* **Validação de Divisão por 4 (Base64 URL-Safe):** Funções de decodificação de chaves do Service Worker e Background Sync devem recalcular o preenchimento de padding (`=`) baseado no comprimento da string (`length % 4 === 1` indica corrupção e exige truncamento ou higienização imediata com Regex `/[^A-Za-z0-9+/=]/g` para evitar que o interpretador `atob` derrube a stream).
* **Tratamento Resiliente do Evento Push:** O Service Worker deve ler o evento de entrada primeiramente como texto bruto usando `event.data.text()` [SW]. Nunca execute `event.data.json()` diretamente no início do escopo [SW], caso contrário o Service Worker sofrerá falha catastrófica de execução (*evaluation crash*) caso receba mensagens de teste em texto plano disparadas pelo Chrome DevTools ou Firebase.

---

## 🛠️ Instalação e Execução

### Passo 1: Compilação Estática Automatizada
Rode a tarefa de automação para transpilar o JSX/TypeScript do frontend, mapear os hashes dos arquivos gerados e injetar o mapa dinâmico de assets offline diretamente no Service Worker fonte:
```bash
deno task build
```

### Passo 2: Inicialização do Servidor Proxy
Inicie o servidor de arquivos estáticos e API proxy cega executando:
```bash
deno task start
```
*O console mostrará os logs de inicialização das chaves RSA de infraestrutura do servidor na memória RAM.*

---

## 🧪 Roteiro de Validação de Segurança Máxima

### Teste 1: Homologação e Comunicação Privada
1. Abra o `browser-a.html`, insira seu perfil (John Doe) e clique em **"Gerar Minha Chave de Identidade"**. Copie o JSON gerado na caixa.
2. Abra o `browser-b.html` (Alice) em outra aba, role até o final, cole o JSON no campo de emissores e clique em **"Autorizar e Salvar Emissor"**.
3. No topo do `browser-b.html`, insira os dados do perfil e gere a sua Carga Unificada. Copie o bloco gerado.
4. Volte ao `browser-a.html`, cole a Carga Unificada no painel de postagem, digite uma mensagem confidencial e clique em **"Enviar Notificação Instantânea"**.
5. O terminal do seu Deno (`main.ts`) exibirá as informações da auditoria cega (quem enviou e quem recebe) mantendo o texto em formato Hex indecifrável. A notificação saltará na tela da Alice perfeitamente descriptografada.

### Teste 2: Bloqueio de Ataque e Mensagem Forjada
1. Mantenha os dados colados no painel do `browser-a.html`.
2. Vá até a caixa de texto da mensagem e mude ou adultere intencionalmente um único caractere da string do token JWT gerado (ou da assinatura) simulando uma tentativa de ataque hacker por interposição de rede (*Man-in-the-middle*).
3. Clique em enviar.
4. O Service Worker do Browser B interceptará o push, executará a perícia de assinatura digital usando a chave homologada no IndexedDB, detectará a violação matemática e **bloqueará o disparo na hora**, exibindo o alerta de fraude na tela do usuário: **`⚠️ Bloqueio de Segurança: A assinatura digital do token falhou!`**.

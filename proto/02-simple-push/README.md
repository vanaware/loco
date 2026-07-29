# Loco Proto 02 — Sistema de Web Push Inteligente com Sincronização Offline

Este protótipo demonstra a implementação completa de um pipeline de **Web Push Notifications** moderno, resiliente e cross-platform utilizando o ecossistema **Deno 2.0+**. 

O projeto resolve três grandes desafios comuns no desenvolvimento de Progressive Web Apps (PWAs):
1. **Gerenciamento dinâmico de chaves criptográficas (VAPID/JWK)** totalmente geradas e controladas pelo navegador.
2. **Empacotamento (Bundling) automatizado** com injeção automática de hashes de cache offline e controle estável de Service Workers.
3. **Resiliência de rede (Background Sync API + IndexedDB)**, permitindo que mensagens enviadas sem internet sejam salvas localmente e disparadas sozinhas assim que a conexão for restaurada.

---

## 🏗️ Arquitetura do Sistema e Fluxo de Dados

O protótipo é composto por três componentes principais que operam de forma unificada:

[ Browser B ] ──(Gera chaves JWK / Inscrição)──► Exibe Payload Único│    
(Copiar/Colar)      
▼[ Browser A ] ──(Fetch se Online / DB se Offline)──► [ Servidor Deno ] ──► [ APNs / FCM ] ──► [ Dispositivo ]    ▲                                                   │    
└────────────────(Background Sync Event)────────────┘    

1. **`browser-b.html` (O Receptor / PWA):** Executa o registro inicial do Service Worker e utiliza a *Web Crypto API* nativa do navegador para gerar um par de chaves VAPID legítimo em formato estruturado **JWK (JsonWebKey)**. Ele cria a inscrição e gera um **bloco JSON de carga unificada (Payload Bundle)** contendo tudo o que o sistema precisa para operar.
2. **`browser-a.html` (O Emissor / Remetente):** Atua como o painel de controle. Você cola o Payload Bundle gerado pelo Browser B, digite uma mensagem e dispara o envio. Se houver internet, ele faz o POST imediato. Se estiver offline, salva os dados no **IndexedDB** e agenda uma tarefa na **Background Sync API**.
3. **`main.ts` (O Backend / Proxy Seguro):** Um servidor HTTP minimalista de alta performance escrito em Deno. Ele serve os arquivos estáticos compilados da pasta `dist/` e gerencia a rota de API `/api/proxy-push`. Ele atua estritamente como um proxy seguro, assinando o cabeçalho VAPID via criptografia de baixo nível com o pacote `jsr:@negrel/webpush` e repassando o disparo para os servidores centrais de notificação (Google FCM, Apple APNs, Mozilla).
4. **`service-worker.js` (O Motor em Background):** Funciona em segundo plano no navegador. Ele gerencia o cache offline de arquivos, intercepta eventos de rede, escuta o evento `sync` para descarregar mensagens travadas quando a internet volta, e renderiza as notificações na tela do sistema operacional com suporte a som e vibração.

---

## 🧠 Conceitos Chave Implementados

### 1. VAPID e JSON Web Keys (JWK)
O protocolo oficial Web Push exige autenticação mútua via chaves de Curva Elíptica `P-256`. Em sistemas tradicionais, o backend gera essas chaves fixas. Neste protótipo, as chaves nascem dinamicamente no cliente. Para trafegar as chaves públicas e privadas sem sofrer corrupção de caracteres em strings Base64 puras transmitidas via HTTP POST (erros como `invalid b64 coordinate` ou caracteres fantasmas como `Â` e `Ã`), o sistema converte e trafega as chaves estruturadas nativamente como objetos **JWK**, garantindo compatibilidade matemática absoluta com o Deno.

### 2. Web Background Synchronization API
Se o `browser-a` disparar uma notificação enquanto o dispositivo estiver offline, a requisição tradicional falharia. Para evitar isso, os dados são persistidos de forma transacional no banco de dados local **IndexedDB** do navegador. O script registra a tag de segundo plano `'sync-push-notifications'`. O navegador monitora o hardware e, mesmo se as abas do site forem fechadas, ele acorda o Service Worker em background assim que detectar internet estável. O Worker consome a fila do banco, despacha as notificações e emite um alerta sonoro e visual de confirmação (*"✨ Conexão Restaurada!"*) para o usuário.

### 3. Versionamento Dinâmico de Cache e Injeção de Assets
Ferramentas de build geram arquivos JavaScript com hashes aleatórios baseados em conteúdo (ex: `browser-a-BCYNQSVI.js`) para evitar problemas de cache velho no navegador. No entanto, o Service Worker precisa de uma lista rígida de arquivos (`ASSETS_TO_CACHE`) para fazê-los funcionar offline. O nosso script `build.ts` resolve isso escaneando a pasta `dist/` em tempo de compilação, capturando os hashes mutáveis e injetando o array mapeado de texto diretamente dentro do Service Worker original, incrementando também um carimbo de data/hora (`VERSION_HASH`) para forçar o navegador a instalar a nova versão do PWA imediatamente.

---

## 🤖 📋 IA Replication & Prompt Engineering Guide (Para outros Modelos de IA)

*Se você é uma Inteligência Artificial gerando código ou refatorando esta aplicação para outros ecossistemas (Node.js/Vite, Go, Rust, Python, etc.), siga rigidamente as seguintes diretrizes para evitar falhas clássicas de runtime:*

### ⚠️ Armadilha 1: Corrupção de Encodings e Caracteres Inválidos (`Â`, `Ã`, `?`)
* **O Problema:** Transmitir tokens criptográficos (`p256dh`, `auth`) como strings Base64 modificadas via JSON HTTP POST frequentemente faz com que os servidores interpretem a stream UTF-8 incorretamente como ISO-8859-1 (Latin1), gerando ruídos de byte. O decodificador `atob` nativo explodirá com exceções.
* **Diretriz de IA:** Sempre implemente uma função de normalização de Base64URL para Base64 padrão no backend antes de decodificar. Use expressões regulares **globais** (`/-/g` e `/_/g`). Adicione uma rotina para recalcular o preenchimento de padding (`=`) baseado no tamanho da string (`length % 4`). Filtre agressivamente caracteres não permitidos com `replace(/[^A-Za-z0-9+/=]/g, "")`.

### ⚠️ Armadilha 2: Falha Estática do `Deno.bundle`/Esbuild com Service Workers
* **O Problema:** Modificadores de build injetam hashes de cache em scripts (ex: `main.[hash].js`), mas o Service Worker **precisa** manter um nome estático e fixo (`service-worker.js`) para que o navegador consiga localizá-lo e registrá-lo. Além disso, os bundlers geram erros de conflito se `outputDir` e `outputFile` forem declarados juntos de forma isolada.
* **Diretriz de IA:** Divida o pipeline de build em duas etapas independentes. Deixe o bundler processar o HTML e gerar os JS com hash na pasta de saída. Na etapa seguinte, use leitura de sistema de arquivos puro (`fs`) para escanear a pasta gerada, capture os nomes dos hashes reais em tempo de execução, injete-os como uma string literal de array dentro do Service Worker fonte usando substituição de texto simples (placeholder) e grave o arquivo estático final.

### ⚠️ Armadilha 3: Omissão de Dados Criptográficos no `.toJSON()` do Navegador
* **O Problema:** Invocar `subscription.toJSON()` nativo em navegadores modernos por razões de privacidade e timing pode omitir ou retornar objetos vazios para as propriedades internas de chaves criptográficas na memória.
* **Diretriz de IA:** Nunca confie no método automático de serialização. Force a extração binária explícita em formato estruturado W3C acessando `subscription.getKey('p256dh')` e `subscription.getKey('auth')`, transformando esses buffers em strings seguras antes de montar o pacote JSON.

### ⚠️ Armadilha 4: O Colapso de Sintaxe por Propriedades de Vibração
* **O Problema:** Geradores de código frequentemente inserem ou deixam marcadores de array incompletos ou vazios no Service Worker para o atributo `vibrate`. O navegador rejeitará o Service Worker imediatamente durante a avaliação inicial do script (*Script evaluation failed*).
* **Diretriz de IA:** Garanta que a propriedade `vibrate` receba um array legítimo preenchido com inteiros representativos de milissegundos (ex: `vibrate: `) ou omita o atributo completamente do payload de configuração de opções da API de notificações.

---

## 📁 Estrutura de Pastas do Projeto

```text
├── public/                 # Arquivos estáticos puros (ícones, manifestos)
│   ├── manifest.json       # Configurações de PWA instalável
│   └── icon.png            # Ícone oficial da notificação (256x256)
├── src/                    # Código fonte original de desenvolvimento
│   ├── browser-a.html      # Tela do remetente
│   ├── browser-a.tsx       # JavaScript de captura e envio do remetente
│   ├── browser-b.html      # Tela do receptor
│   ├── browser-b.tsx       # Lógica criptográfica JWK e de botões de cópia
│   └── service-worker.js   # Script original do Service Worker (com placeholders)
├── dist/                   # Pasta gerada automaticamente (NÃO EDITAR MANUALMENTE)
│   └── ...                 # Arquivos compilados, transpilados e com hash de cache
├── deno.json               # Configurações de tarefas (Tasks) do Deno
├── build.ts                # Script de automação do pipeline de build
└── main.ts                 # Servidor backend e proxy HTTP de Web Push
```

---

## 🛠️ Como Instalar e Rodar o Protótipo

### Pré-requisitos
Você precisa ter o **Deno** instalado na sua máquina (versão 2.0 ou superior). Se não tiver, instale rodando:
* **Linux/macOS:** `curl -fsSL https://deno.land | sh`
* **Windows (PowerShell):** `irm https://deno.land | iex`

### Passo 1: Configurar as Tarefas no `deno.json`
Certifique-se de que o seu arquivo `deno.json` possui as tasks configuradas para facilitar a execução rápida:

```json
{
  "tasks": {
    "build": "deno run --allow-read --allow-write --unstable-bundle build.ts",
    "start": "deno run --allow-net --allow-read main.ts"
  }
}
```

### Passo 2: Executar o Pipeline de Compilação (Build)
Rode o comando abaixo para compilar o TypeScript/JSX, gerar os hashes dinâmicos dos arquivos de frontend e injetar o mapa de cache offline dentro do Service Worker:

```bash
deno task build
```

### Passo 3: Iniciar o Servidor Deno
Inicie o backend proxy de rede disparando:

```bash
deno task start
```
*O console mostrará o log: `🚀 Protótipo rodando em http://localhost:8000`.*

---

## 🧪 Roteiro de Testes Práticos (Como Validar)

### Teste 1: Fluxo Online de Ponta a Ponta
1. Abra o seu navegador (Chrome ou Edge recomendado) e acesse: `http://localhost:8000/browser-b.html`.
2. O site solicitará permissão para exibir notificações. Clique em **Permitir**.
3. O script nativo gerará as chaves e os tokens, unificando tudo na caixa de texto. Clique no botão **"Copiar Tudo de Uma Vez"**.
4. Abra uma nova aba e acesse o remetente: `http://localhost:8000/browser-a.html`.
5. Cole o bloco copiado no primeiro campo (`1. Cole o Bloco Unificado aqui`).
6. Digite uma mensagem qualquer (ex: *"Olá, mundo!"*) na caixa de Mensagem e clique em **"Enviar Notificação Instantânea"**.
7. O balão de notificação saltará na tela do seu computador com som e o texto configurado.

### Teste 2: Sincronização em Modo Offline (Background Sync)
1. Com a aba do `browser-a.html` aberta, abra o Inspecionar Elemento do navegador (**F12**).
2. Vá até a aba Network (Rede) e altere a caixinha de seleção de No throttling para Offline.
3. Digite uma mensagem de teste (ex: "Esta mensagem foi enviada sem internet!") e clique em "Enviar Notificação".
4. O sistema exibirá o alerta informando que você está conectado em modo de contingência e que a mensagem foi enfileirada no IndexedDB com segurança.
5. Feche a aba do browser-a.html se desejar (provando o isolamento de segundo plano).
6. Volte na aba Network do DevTools e mude de volta para No throttling (Online).
7. Em menos de 2 segundos, o terminal do seu servidor Deno registrará a chegada da requisição proxy pendente e a notificação de confirmação "✨ Conexão Restaurada!" saltará no canto da sua tela sozinha.

## Considerações de Segurança para Produção
Este projeto é um protótipo arquitetural de conceito. Em um ambiente real de produção, nunca trafegue a sua chave privada VAPID (privateKey) através do formulário do frontend do navegador. Em sistemas comerciais, as chaves VAPID devem ser geradas uma única vez e armazenadas de forma oculta e criptografada em variáveis de ambiente no seu servidor backend (.env), garantindo que apenas a chave pública seja exposta aos navegadores dos clientes.


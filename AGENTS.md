AGENTS.md - Regras e Contexto do Projeto Loco

1. Visão Geral

O Loco é um PWA (Progressive Web App) de mensagens descentralizado com interface
Material Design 3, comunicação híbrida (Web Push + WebRTC) e arquitetura de
armazenamento robusta e escalável. O app prioriza a privacidade, o controle
granular de dados pelo usuário e a resistência à evicção automática pelo
navegador.

Características Principais

- Zero Servidor: Toda comunicação é P2P ou via Web Push direto
- Armazenamento Híbrido: IndexedDB + OPFS + Cache API
- Proteção contra Evicção: navigator.storage.persist() para evitar limpeza
  automática
- Feature Detection: Toda API moderna é detectada antes do uso
- Progressive Enhancement: Funciona em qualquer browser moderno, mas oferece
  recursos extras onde suportado

2. Stack Tecnológica

Core

- Runtime: Deno / Deno Deploy
- Frontend: Preact 10.19.3 + @preact/signals 1.2.2
- UI Framework: @material/web 1.5.1 (Web Components Material Design 3)
- Build: Deno.bundle() (bundling de múltiplos entrypoints)

Bibliotecas

- @libs/qrcode (JSR): Geração de QR Codes
- fflate 0.8.2 (ESM): Compressão ZIP para backups
- idb-keyval 6.2.1 (ESM): Wrapper leve para IndexedDB (~500 bytes)
- webtorrent (CDN): Transferência P2P de arquivos

APIs Modernas Utilizadas

- IndexedDB (via idb-keyval)
- OPFS (Origin Private File System)
- Cache API
- Web Push API
- WebRTC (RTCDataChannel, RTCPeerConnection)
- WebTorrent (em Web Worker)
- Web Share Target
- Contact Picker API
- Barcode Detector API
- App Badging API
- Screen Wake Lock API
- View Transitions API
- Picture-in-Picture API
- Virtual Keyboard API
- Background Sync API
- File System Access API
- Storage Persistence API

3. Arquitetura de Armazenamento

3.1. IndexedDB (via idb-keyval)

Uso: Dados estruturados e binários leves ((key: string): Promise export async
function storageSet(key: string, value: any): Promise export async function
storageDel(key: string): Promise export async function loadFromIDB(key: string,
defaultValue: T): Promise

3.2. OPFS (Origin Private File System)

Uso: Arquivos binários grandes recebidos ou enviados via WebTorrent/WebRTC

Conteúdo Armazenado:

- Fotos originais recebidas/enviadas
- Vídeos
- Documentos (PDF, DOC, etc.)
- Áudios
- Qualquer arquivo compartilhado entre peers

Gerenciamento:

- Cada arquivo tem um ID único vinculado à mensagem (messageId)
- O usuário pode excluir individualmente arquivos da conversa para liberar
  espaço sem apagar o histórico de texto
- O usuário pode baixar arquivos do OPFS para o sistema de arquivos do
  dispositivo
- Arquivos são nomeados como {messageId}.{ext}

Fallback: Blob URL temporário se OPFS não for suportado

Implementação: src/utils/storage.ts export async function saveFileToOPFS(file:
File, messageId: string, contactId: string): Promise export async function
readFileFromOPFS(path: string): Promise export async function
deleteFileFromOPFS(path: string): Promise export async function
exportFileFromOPFS(path: string, suggestedName: string): Promise

3.3. Cache API

Uso: Recursos estáticos necessários para o funcionamento offline do PWA

Conteúdo Armazenado:

- HTML, CSS, JavaScript
- Ícones e fontes
- Assets do Material Design

Estratégia de Cache:

- Cache First para assets estáticos (scripts, styles, images)
- Network First para HTML (sempre tenta buscar versão mais recente)

Manutenção: Limpeza automática de versões antigas do cache durante a atualização
do Service Worker

Implementação: src/sw/sw.ts e src/utils/storage.ts

3.4. Proteção de Persistência

API: navigator.storage.persist()

Comportamento:

- Solicita ao navegador que trate os dados do app como "persistentes"
- Reduz drasticamente a chance de evicção em situações de baixa memória no
  dispositivo
- Não garante 100% de proteção (usuário pode limpar dados manualmente)

Monitoramento:

- Verificação periódica da quota usada vs. disponível (a cada 60 segundos)
- Alerta ao usuário se o espaço estiver acabando (>80% usado)
- Exibição de status detalhado em Settings

Implementação: src/utils/storage.ts export async function
requestPersistentStorage(): Promise export function
startStorageMonitor(intervalMs: number, onLowStorage?: (status: StorageStatus)
=> void): () => void

4. Módulo de Transferência P2P (Worker + OPFS)

4.1. Arquitetura Isolada

Web Worker (`src/worker/p2p-transfer.worker.js`):

- Toda a lógica do WebTorrent e I/O de disco roda em thread separada
- Evita travamentos da thread principal do PWA
- Gerencia conexões WebRTC e escrita síncrona no OPFS

Comunicação:

- Via postMessage com eventos tipados
- Uso de Transferable Objects para evitar cópia duplicada de dados na memória

4.2. Tabela de Eventos de Mensageria Origem Destino Tipo de Evento Payload /
Propósito Main Thread Worker P2P_START_SEED Envia o objeto File para iniciar o
envio Worker Main Thread P2P_SEED_READY Retorna o magnetURI e infoHash gerados
Main Thread Worker P2P_START_DOWNLOAD Envia o magnetURI e fileName para iniciar
o recebimento Worker Main Thread P2P_PROGRESS Notifica porcentagem, velocidade
(MB/s) e peers conectados Worker Main Thread P2P_DOWNLOAD_COMPLETE Confirma que
o arquivo foi gravado 100% no OPFS Qualquer Worker P2P_CANCEL Solicita a
interrupção manual do envio ou recebimento Worker Main Thread P2P_SESSION_ENDED
Confirma o encerramento da sessão P2P

4.3. Fluxo de Dados

Envio:

1. Main Thread envia File object → Worker
2. Worker cria seed via WebTorrent
3. Worker retorna magnetURI → Main Thread
4. Main Thread envia magnetURI para o contato via Push/DataChannel
5. Worker notifica progresso em tempo real

Recebimento:

1. Main Thread detecta magnet link na mensagem
2. Main Thread envia magnetURI → Worker
3. Worker baixa diretamente para OPFS
4. Worker notifica conclusão
5. Main Thread registra metadados no IndexedDB e adiciona mensagem ao chat

Cancelamento:

- Botão na UI dispara P2P_CANCEL
- Worker destrói torrent e limpa handles
- Notifica Main Thread sobre encerramento

4.4. Interface de Usuário

TransferDock (src/components/TransferDock.tsx):

- Widget flutuante no rodapé que mostra progresso em tempo real
- Exibe: nome do arquivo, porcentagem, velocidade, peers
- Botão de cancelar sempre visível
- Não-intrusivo: permite navegação livre pelo app enquanto transfere

4.5. Regra de Envio Único

- O seed é encerrado automaticamente após o envio completo e desconexão de todos
  os peers
- Não há re-seeding automático (o recebedor não redistribui o arquivo)
- Isso economiza banda e bateria do dispositivo

5. Fluxos de Usuário

5.1. Adição de Contato via QR Code

1. Usuário A gera QR Code em Profile
2. Usuário B abre QR Scanner
3. B escaneia o QR Code de A
4. App detecta link #add= com dados codificados em Base64
5. App decodifica e adiciona contato automaticamente
6. Alerta de sucesso é exibido

5.2. Envio de Mensagem

1. Usuário digita texto e clica em Enviar
2. App verifica se há DataChannel P2P aberto com o contato
3. Se P2P disponível:
   - Envia via DataChannel (canal direto)
   - Marca mensagem como channel: "p2p"
4. Se P2P indisponível:
   - Envia via Web Push (servidor de notificação)
   - Marca mensagem como channel: "push"
5. Mensagem é salva no IndexedDB localmente

5.3. Transferência de Arquivo

1. Usuário clica em "Anexar" e seleciona arquivo
2. App envia arquivo para o Worker via P2P_START_SEED
3. Worker cria seed e retorna magnetURI
4. App envia magnetURI como mensagem de texto para o contato
5. Contato recebe mensagem com magnet link
6. ChatWindow detecta magnet link automaticamente
7. App inicia download via P2P_START_DOWNLOAD
8. Worker baixa arquivo para OPFS
9. App registra metadados no IndexedDB
10. Mensagem é adicionada ao chat com preview inline (se imagem/vídeo)

5.4. Exclusão Granular de Arquivo

1. Usuário clica em "Excluir" em um anexo específico
2. App remove o arquivo físico do OPFS
3. App atualiza a mensagem no IndexedDB, removendo a referência ao arquivo
4. Mensagem é marcada como "🗑️ Arquivo excluído"
5. Espaço é liberado imediatamente no dispositivo
6. Histórico de texto permanece intacto

5.5. Download de Arquivo para Dispositivo

1. Usuário clica em "Baixar" em um anexo
2. App lê arquivo do OPFS
3. Se File System Access API disponível:
   - Abre diálogo "Salvar como" nativo
4. Senão:
   - Usa download tradicional via
5. Arquivo é salvo no sistema de arquivos do dispositivo

5.6. Backup e Restauração

Backup:

1. Usuário seleciona quais dados incluir (perfil, config, contatos, conversas,
   arquivos)
2. App cria ZIP contendo:
   - Dump do IndexedDB (JSON)
   - Arquivos do OPFS (se selecionado)
   - Manifest com metadados
3. Usuário baixa o ZIP para o dispositivo

Restauração:

1. Usuário seleciona arquivo ZIP de backup
2. App extrai e valida manifest
3. Recria as estruturas no IndexedDB
4. Restaura arquivos no OPFS (se incluídos)
5. Alerta de sucesso e solicita recarregamento

6. APIs Modernas Integradas API Uso Fallback Implementação OPFS Salva arquivos
   WebTorrent Blob URL src/utils/storage.ts Share Target Recebe shares de outros
   apps — src/utils/webShareTarget.ts Contact Picker Importa da agenda Digitar
   manualmente src/utils/pwa.ts BarcodeDetector Lê QR Codes da câmera
   Compartilhamento por link src/utils/pwa.ts App Badging Badge de não lidas no
   ícone Badge na UI src/utils/pwa.ts Wake Lock Tela ligada em chamadas —
   src/utils/pwa.ts View Transitions Navegação fluida entre views Troca
   instantânea src/utils/pwa.ts WebCodecs Codec otimizado para vídeo MediaStream
   (futuro) PiP (Video) Chamada flutuante Tela cheia src/utils/pwa.ts PiP
   (Document) Visualização flutuante de docs — (futuro) App Shortcuts Atalhos no
   ícone do app Menu interno public/manifest.json Virtual Keyboard Layout do
   teclado customizado Resize viewport src/utils/pwa.ts Background Sync Sync
   periódico de atualizações Verificar ao abrir src/sw/sw.ts Window Controls UI
   imersiva em desktop Barra padrão CSS env(titlebar-area-*) Storage Persist
   Proteção contra evicção Backup manual src/utils/storage.ts

7. Componentes Principais

7.1. App.tsx

- Componente raiz da aplicação
- Gerencia navegação entre views (list, chat, profile, settings, about, call,
  scanner)
- Processa hash #add= para adicionar contatos via QR
- Processa hash #action= para app shortcuts
- Renderiza drawer menu e top bar
- Integra TransferDock para transferências ativas

7.2. ChatWindow.tsx

- Interface de conversa com um contato específico
- Renderiza mensagens (texto, imagens, vídeos, arquivos, localização)
- Preview inline de imagens e vídeos
- Botões de download e exclusão granular de arquivos
- Detecção automática de magnet links para iniciar P2P download
- Modal de edição de contato (nome, privacidade)
- Integração com Web Share Target

7.3. Profile.tsx

- Exibe e edita perfil do usuário (nome, foto)
- Gera e exibe QR Code para adicionar contatos
- Botão de compartilhar link via Web Share API
- Upload e redimensionamento de foto de perfil

7.4. QRScanner.tsx

- Interface de câmera para escanear QR Codes
- Usa BarcodeDetector API
- Overlay visual com área de detecção
- Processa resultado e adiciona contato automaticamente
- Fallback para navegadores sem suporte

7.5. CallScreen.tsx

- Interface de chamadas de voz e vídeo
- Gerencia MediaStream (áudio e vídeo)
- Controles: mute, câmera, trocar câmera, PiP
- Integração com Wake Lock para manter tela ligada
- Picture-in-Picture para chamadas flutuantes

7.6. Settings.tsx

- Painel de configurações gerais (DND, localização, criptografia)
- Status de proteção de armazenamento (persisted/best-effort)
- Barra de uso de storage com detalhamento (IDB, OPFS, Cache)
- Lista de capacidades PWA suportadas pelo navegador
- Backup e restauração de dados
- Configurações por contato individual

7.7. TransferDock.tsx

- Widget flutuante no rodapé
- Exibe progresso de transferências P2P ativas
- Mostra: nome do arquivo, porcentagem, velocidade, peers
- Botão de cancelar
- Auto-dismiss quando concluído

7.8. About.tsx

- Informações sobre o app
- Versão e changelog
- Lista de recursos
- Política de privacidade

8. Regras de Desenvolvimento

8.1. Armazenamento

1. NUNCA usar localStorage: Usar exclusivamente src/utils/storage.ts (wrapper de
   idb-keyval)
2. Assincronicidade OBRIGATÓRIA: Todas as operações de leitura/escrita de dados
   devem ser async/await
3. Feature Detection: Sempre verificar se OPFS está disponível antes de usar
4. Fallback: Se OPFS falhar, usar Blob URL temporário
5. Limpeza: Ao excluir uma conversa inteira, iterar sobre todos os fileId e
   remover do OPFS antes de limpar o IndexedDB
6. Performance: Imagens de perfil devem ser redimensionadas para max 200x200px
   antes de salvar no IndexedDB

8.2. UI/UX

1. Material Design: Usar @material/web para todos os componentes
2. Responsividade: Layout deve funcionar em mobile e desktop
3. Acessibilidade: Usar atributos ARIA e labels apropriados
4. View Transitions: Usar navigateWithTransition() para trocar views
5. Feedback Visual: Sempre mostrar loading states e confirmações
6. Empty States: Páginas vazias devem ter mensagens amigáveis e CTAs

8.3. Rede e Comunicação

1. P2P First: Sempre tentar DataChannel antes de Web Push
2. Profile Update: Enviar atualização de perfil na primeira comunicação P2P com
   cada contato
3. Fallback Graceful: Se P2P falhar, usar Push sem erro visível ao usuário
4. Criptografia: Se habilitada, criptografar mensagens localmente antes de
   enviar
5. Status de Entrega: Atualizar status da mensagem (sent → delivered → failed)

8.4. P2P Transfer

1. Worker Isolado: Toda lógica pesada deve rodar no Web Worker
2. Cancelamento Explícito: Sempre fornecer botão de cancelar transferência
3. Progresso em Tempo Real: Atualizar UI com porcentagem e velocidade
4. Persistência: Solicitar navigator.storage.persist() durante init
5. Monitoramento: Verificar quota periodicamente e alertar se baixo

8.5. Segurança e Privacidade

1. Criptografia Local: Mensagens podem ser criptografadas com AES-GCM antes de
   enviar
2. Biometria: Verificar suporte antes de habilitar criptografia
3. Permissões: Solicitar permissões (câmera, localização) apenas quando
   necessário
4. Dados Sensíveis: Nunca logar chaves privadas ou tokens em produção
5. Validação: Validar dados recebidos via QR Code antes de processar

8.6. Performance

1. Lazy Loading: Imagens e vídeos devem usar loading="lazy"
2. Virtualização: Listas longas devem ser virtualizadas (futuro)
3. Debounce: Operações frequentes (input, scroll) devem ser debounced
4. Cache: Assets estáticos devem ser cacheados via Cache API
5. Web Worker: Operações pesadas (criptografia, compressão) devem rodar em
   Worker

8.7. Testes

1. Cobertura: Funções utilitárias críticas devem ter testes unitários
2. Edge Cases: Testar fallbacks (sem OPFS, sem P2P, sem Push)
3. Performance: Testar com grandes volumes de mensagens e arquivos
4. Cross-browser: Testar em Chrome, Firefox, Safari, Edge

9. Estrutura de Arquivos

loco/
├── .gitignore # Git ignore rules
├── LICENSE # MIT License
├── README.md # Documentação do projeto
├── AGENTS.md # Este arquivo
├── deno.json # Configuração do Deno + imports
├── build.ts # Script de build usando Deno.bundle()
├── main.ts # Servidor HTTP (Deno)
├── public/
│   ├── manifest.json # PWA manifest
│   ├── icon-192.png # Ícone 192x192
│   ├── icon-512.png # Ícone 512x512
│   ├── badge-72.png # Badge de notificação
│   ├── version.json # Versão do app para update check
│   └── (arquivos estáticos gerados pelo build)
├── src/
│   ├── main/
│   │   └── index.html # HTML principal
│   ├── worker/
│   │   └── p2p-transfer.worker.js # Web Worker para P2P
│   ├── sw/
│   │   └── sw.ts # Service Worker
│   ├── store.ts # Estado global (signals)
│   ├── crypto.ts # Criptografia e VAPID
│   ├── types/
│   │   └── material-web.d.ts # TypeScript declarations para @material/web
│   ├── utils/
│   │   ├── storage.ts # Wrapper unificado (IDB + OPFS + Cache)
│   │   ├── capabilities.ts # Feature detection central
│   │   ├── pwa.ts # Badging, Wake Lock, PiP, etc.
│   │   ├── backup.ts # Lógica de backup/restore (ZIP)
│   │   ├── imageProcessor.ts # Redimensionamento de imagens
│   │   └── webShareTarget.ts # Share target handler
│   └── components/
│       ├── App.tsx # Componente raiz
│       ├── ChatWindow.tsx # Janela de chat
│       ├── CallScreen.tsx # Tela de chamada
│       ├── QRScanner.tsx # Scanner de QR Code
│       ├── Profile.tsx # Perfil do usuário
│       ├── Settings.tsx # Configurações
│       ├── About.tsx # Sobre o app
│       └── TransferDock.tsx # Widget de transferência P2P
└── tests/
    ├── storage.test.ts # Testes de storage
    └── crypto.test.ts # Testes de criptografia

**Arquitetura de Build**

O projeto utiliza Deno workspaces para gerenciar múltiplos entrypoints de forma isolada. O script `build.ts` emprega Deno.bundle() para criar bundles otimizados para:

- Aplicação principal (`src/main/`)
- Web Workers (`src/worker/`)
- Service Worker (`src/sw/`)

A configuração do Deno é definida em `deno.json`, que inclui mapeamentos de importação e definições de workspace. Para adicionar novos entrypoints:

1. Crie o arquivo no diretório apropriado (main/worker/sw)
2. Atualize `build.ts` para incluir o novo entrypoint no processo de bundling
3. Ajuste `deno.json` se necessário para novos mapeamentos de importação

O comando `deno task build` executa o processo completo de bundling, gerando os arquivos estáticos em `dist/`.

9.1. Laboratório de Protótipos (`proto/`)

O diretório `proto/` contém pequenos PWAs executáveis e isolados. Cada
protótipo testa uma funcionalidade crítica de forma granular (Web Push, WebRTC
DataChannel, OPFS, QR scanner, etc.) e serve como modelo para que, depois de
validada, a funcionalidade seja integrada e orquestrada no app principal.

Cada protótipo possui:

- Próprio `deno.json`, `build.ts`, `main.ts`, `index.html` e `manifest.json`.
- UI simplificada em Preact + `@preact/signals`.
- Build e servidor independentes (`deno task build && deno task start`).
- README explicando o objetivo, como rodar e limitações.

Exemplo de protótipo:

```
proto/
├── _template/              # modelo para novos protótipos
└── 01-push-messaging/     # envio PWA Push entre dois clientes
```

Regra prática: quando for implementar uma nova feature crítica, crie primeiro um
protótipo em `proto/` que prove isoladamente que a funcionalidade funciona. Só
depois faça a orquestração no app completo em `src/`.

10. Limitações Conhecidas

10.1. Compatibilidade de Navegadores

OPFS:

- Chrome 86+ ✅
- Edge 86+ ✅
- Safari 15.2+ ✅ (parcial)
- Firefox ❌ (não suportado)

BarcodeDetector:

- Chrome 83+ ✅
- Edge 83+ ✅
- Safari ❌ (não suportado)

Contact Picker:

- Chrome Android 80+ ✅
- Outros navegadores ❌

Web Share Target:

- Chrome Android ✅
- Chrome Desktop (limitado) ⚠️
- Safari iOS ❌
- Firefox ❌

View Transitions:

- Chrome 111+ ✅
- Edge 111+ ✅
- Safari ❌ (não suportado)

Picture-in-Picture:

- Chrome 70+ ✅
- Firefox 77+ ✅
- Safari 13.1+ ✅ (apenas vídeo)

10.2. Armazenamento

Persistência:

- A API persist() não garante 100% de proteção
- Usuário pode limpar dados manualmente
- Sistema operacional pode forçar limpeza em casos extremos de baixa memória

Quota:

- Embora grande, a quota não é infinita
- Tipicamente 50-80% do espaço disponível no dispositivo
- Monitoramento de espaço é essencial para evitar falhas

OPFS:

- Arquivos são privados à origem (não acessíveis por outros apps)
- Requer exportação explícita para compartilhar com outros apps
- Não há API para listar todos os arquivos de todas as origens

10.3. Rede e P2P

WebTorrent:

- Requer WebRTC para funcionar
- Pode falhar em redes com NAT restritivo
- Trackers públicos podem ser bloqueados por firewalls corporativos

Web Push:

- Requer permissão do usuário
- Alguns navegadores limitam frequência de notificações
- Servidores push podem ter rate limiting

DataChannel:

- Conexão P2P direta pode falhar em redes restritivas
- Requer servidor STUN/TURN para traversal de NAT
- Latência pode variar dependendo da qualidade da rede

10.4. Performance

IndexedDB:

- Operações são assíncronas (não bloqueiam UI)
- Leituras/escritas grandes podem ser lentas
- Não há API para estimar tamanho exato do banco

OPFS:

- SyncAccessHandle é mais rápido que WritableFileStream
- Arquivos muito grandes (>100MB) podem causar picos de memória
- Leitura/escrita simultânea de múltiplos arquivos pode ser lenta

Web Worker:

- Comunicação via postMessage tem overhead
- Transferable Objects reduzem cópia de dados
- Worker não tem acesso ao DOM

10.5. UX/UI

Material Design:

- @material/web é relativamente novo (pode ter bugs)
- Componentes são pesados (~200KB min+gzip)
- Customização de tema requer CSS variables

Responsividade:

- Layout mobile-first pode não ser ideal para desktop
- Teclado virtual em mobile pode quebrar layout
- Picture-in-Picture não funciona em todos os dispositivos

Acessibilidade:

- Web Components podem ter problemas com screen readers
- Foco de teclado precisa ser gerenciado manualmente
- Contraste de cores deve ser verificado

11. Roadmap e Melhorias Futuras

11.1. Funcionalidades Planejadas

- Mensagens de voz: Gravar e enviar áudios via OPFS
- Chamadas em grupo: WebRTC mesh network para múltiplos participantes
- Reações: Emojis de reação em mensagens
- Edição de mensagens: Editar mensagens enviadas recentemente
- Apagar para todos: Retractar mensagens em ambos os lados
- Busca: Pesquisar mensagens e arquivos no histórico
- Filtros: Filtrar conversas por tipo (texto, mídia, localização)
- Notificações customizadas: Sons e vibrações por contato
- Status online: Indicador de presença em tempo real
- Digitando...: Indicador de digitação em tempo real

11.2. Melhorias Técnicas

- Virtualização de listas: React Window ou similar para listas longas
- Compressão de imagens: WebP/AVIF para reduzir tamanho
- Streaming de vídeo: Video streaming via WebTorrent
- Criptografia E2E: Signal Protocol para criptografia ponta-a-ponta real
- Sincronização multi-dispositivo: Sync entre dispositivos do mesmo usuário
- Backup automático: Backup periódico para cloud (opcional)
- Análise de storage: Gráficos de uso de espaço por tipo de arquivo
- Limpeza automática: Apagar arquivos antigos automaticamente
- Modo escuro: Tema escuro automático baseado em preferências do sistema
- Internacionalização: Suporte a múltiplos idiomas (i18n)

11.3. Integrações

- Calendário: Compartilhar eventos de calendário
- Contatos do sistema: Sync bidirecional com agenda do dispositivo
- Notificações ricas: Ações em notificações (responder, marcar como lido)
- Widgets: Widgets para tela inicial (Android/iOS)
- Atalhos de teclado: Atalhos para desktop (Ctrl+N, Ctrl+F, etc.)
- Compartilhamento de tela: Screen sharing em chamadas
- Anotações: Desenhar em imagens compartilhadas
- OCR: Extrair texto de imagens compartilhadas

12. Comandos e Scripts

Desenvolvimento

Instalar Deno (se necessário) curl -fsSL https://deno.land/install.sh | sh

Clonar repositório git clone https://github.com/seu-usuario/loco.git cd loco

Build (Deno.bundle) deno task build

Executar servidor de desenvolvimento (com watch) deno task dev

Executar servidor de produção deno task start

Executar testes deno task test

Deploy

Deno Deploy (automático) git push origin main

Ou manual deno deploy --project=loco

Docker (alternativo) docker build -t loco . docker run -p 8000:8000 loco

Manutenção

Limpar cache do Deno deno cache --reload src/main.ts

Verificar tipos deno check src/**/*.ts

Formatar código deno fmt

Lint deno lint

Atualizar dependências deno run -A https://deno.land/x/udd/main.ts deno.json

13. Troubleshooting

Problemas Comuns

"OPFS indisponível"

- Causa: Navegador não suporta OPFS (Firefox) ou contexto inseguro (HTTP)
- Solução: Usar HTTPS e navegador compatível (Chrome/Edge/Safari)

"Storage não persistente"

- Causa: Navegador negou pedido de persistência
- Solução: Tentar novamente em Settings ou fazer backup manual

"Falha ao enviar via Push"

- Causa: Servidor push do destino indisponível ou subscription expirada
- Solução: Re-adicionar contato ou tentar P2P

"Transferência P2P falhou"

- Causa: NAT restritivo ou firewall bloqueando WebRTC
- Solução: Usar servidor TURN (não implementado) ou enviar via Push

"QR Code não detectado"

- Causa: Navegador não suporta BarcodeDetector ou câmera sem permissão
- Solução: Conceder permissão de câmera ou usar compartilhamento por link

"Chamada não conecta"

- Causa: Permissões de mídia negadas ou WebRTC bloqueado
- Solução: Verificar permissões no navegador e tentar novamente

"Backup muito grande"

- Causa: Muitos arquivos armazenados no OPFS
- Solução: Excluir arquivos antigos antes de fazer backup

"App lento após muito uso"

- Causa: IndexedDB com muitas mensagens ou OPFS cheio
- Solução: Limpar conversas antigas ou excluir arquivos

Debug

Ver logs do Service Worker chrome://serviceworker-internals/

Ver storage do app chrome://settings/siteData

Ver OPFS chrome://indexeddb-internals/

Ver cache chrome://cache/

Testar notificações chrome://flags/#enable-experimental-web-platform-features

14. Contribuição

Como Contribuir

1. Fork o repositório
2. Crie uma branch para sua feature (git checkout -b feature/AmazingFeature)
3. Commit suas mudanças (git commit -m 'Add some AmazingFeature')
4. Push para a branch (git push origin feature/AmazingFeature)
5. Abra um Pull Request

Guidelines

- Siga as regras de desenvolvimento deste documento
- Escreva testes para novas funcionalidades
- Atualize a documentação (README, AGENTS.md)
- Use conventional commits (feat:, fix:, docs:, etc.)
- Mantenha o código formatado (deno fmt)
- Verifique tipos (deno check)

Reportar Bugs

- Use GitHub Issues
- Inclua passos para reproduzir
- Mencione navegador e versão
- Anexe screenshots se aplicável
- Inclua logs do console se possível

15. Licença

Este projeto está licenciado sob a MIT License - veja o arquivo LICENSE para
detalhes.

16. Contato

- Autor: Ademar Arvati Filho
- Email: arvati@hotmail.com
- GitHub: @arvati
- Website: vanaware.com

Última atualização: 2026-07-26\
Versão: 1.0.0

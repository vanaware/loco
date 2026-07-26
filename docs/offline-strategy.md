# Estratégia de Funcionamento Offline do Loco

## A filosofia

O Loco é um PWA de mensagens **sem servidor central**. Isso significa que o app
deve continuar funcionando mesmo quando:

- O dispositivo está sem internet.
- A internet é intermitente.
- O servidor de push do navegador está indisponível.
- O contato está offline no momento.

A estratégia de offline do Loco é simples: **tudo que é essencial para o usuário
deve estar no dispositivo dele**. Comunicação online acontece apenas quando
possível, e sempre priorizando canais P2P.

## Princípios fundamentais

1. **Local-first**: os dados do usuário moram no dispositivo.
2. **P2P primeiro**: sempre tentar comunicação direta entre os navegadores.
3. **Push como fallback**: usar Web Push apenas quando o destinatário não está
   online.
4. **PWA como plataforma**: Service Worker, Cache API e armazenamento
   persistente tornam o app resilientes.
5. **Graceful degradation**: cada funcionalidade tem um fallback funcional.

## O que funciona 100% offline

Mesmo sem nenhuma conexão, o usuário pode:

- Ver todo o histórico de mensagens salvo no IndexedDB.
- Ver arquivos armazenados no OPFS.
- Ver informações de perfil e contatos.
- Criar mensagens (que serão enviadas quando houver conexão).
- Tirar fotos e selecionar arquivos locais para envio futuro.
- Editar configurações, contatos e perfil.

Tudo isso porque os dados estão armazenados localmente.

## O que não funciona offline

- Enviar mensagens para um contato.
- Fazer chamadas de voz/vídeo.
- Transferir arquivos via WebTorrent.
- Receber notificações de push.
- Adicionar contatos via link/QR Code (não há como entregar os dados).

Essas operações dependem de conectividade, mas o app deve continuar funcional e
sincronizar quando possível.

## Arquitetura de armazenamento local

### IndexedDB

Guarda dados estruturados:

- Perfil do usuário (`myId`, `myDisplayName`, `myVapidKeys`).
- Contatos.
- Conversas e mensagens.
- Configurações (`appConfig`).
- Metadados de arquivos (`storedFiles`).

### OPFS (Origin Private File System)

Guarda binários:

- Fotos, vídeos, documentos.
- Arquivos de mídia de chamadas (futuro).

### Cache API

Guarda recursos do app:

- HTML, CSS, JavaScript.
- Ícones, fontes, manifesto.
- Recursos do Material Web.

## Ciclo de vida de uma mensagem

```
Usuário digita mensagem
        |
        v
Mensagem é salva localmente (IndexedDB)
        |
        v
Tentativa P2P (DataChannel)
        |
        |-- sucesso --> mensagem entregue, status "delivered"
        |
        falha
        |
        v
Tentativa Web Push
        |
        |-- sucesso --> mensagem enviada, status "sent"
        |
        falha
        |
        v
Mensagem ficar├а pendente para retry
```

O app nunca bloqueia o usuário. A mensagem é salva imediatamente e o envio
tentado em background.

## Comunicação P2P como prioridade

### Por que P2P primeiro?

- **Privacidade**: os dados não passam por servidores.
- **Velocidade**: conexão direta é mais rápida, especialmente na mesma rede.
- **Independência**: não depende de serviços de push de terceiros.
- **Funciona offline em LAN**: dois dispositivos na mesma rede podem se
  comunicar via P2P mesmo sem internet.

### Como o P2P é estabelecido

1. Dois dispositivos trocam ofertas/answers WebRTC.
2. A conexão pode passar por STUN para encontrar rotas públicas.
3. Se estiverem na mesma LAN, o WebRTC usa a rota local automaticamente.
4. Um `RTCDataChannel` é aberto sobre a conexão.
5. As mensagens trafegam por esse canal.

### Retry P2P

O app tenta reconectar P2P automaticamente quando:

- O contato volta a ficar online.
- O app retorna de segundo plano.
- A rede muda (Wi-Fi para 4G, por exemplo).

Se após várias tentativas o P2P não for possível, o app usa Web Push.

## Web Push como fallback

Quando o P2P não funciona, o Web Push é usado para acordar o dispositivo do
destinatário. Ele é considerado fallback porque:

- Depende de servidores de push de terceiros.
- Pode ter latência variável.
- Pode ser bloqueado por firewalls.
- Requer permissões do usuário.

Mesmo assim, é essencial porque permite alcançar contatos que estão com o
navegador fechado ou com o dispositivo inativo.

## Service Worker e cache

O Service Worker (`src/sw/sw.ts`) é responsável por:

- Cachear assets estáticos do app.
- Servir o app offline.
- Receber e exibir notificações push.
- Interceptar requisições e responder do cache quando offline.

### Estratégias de cache

- **Cache First**: scripts, estilos, imagens e fontes são servidos do cache se
  disponíveis.
- **Network First**: HTML sempre tenta a versão mais recente.
- **Background Sync**: marca atualizações pendentes para sincronizar quando
  online.

## Sincronização quando volta a ficar online

Quando o dispositivo volta a ficar online:

1. O evento `online` do navegador é disparado.
2. O app tenta reconectar P2P com todos os contatos.
3. Mensagens pendentes são reenviadas.
4. O app verifica se há atualizações de perfil para enviar/receber.
5. Background Sync pode ser usado para sincronizar dados.

## Exclusão granular e gestão de armazenamento

Para garantir que o app continue funcionando offline sem ocupar todo o espaço:

- O usuário pode excluir arquivos individuais do OPFS sem apagar o histórico.
- O app monitora o uso de armazenamento e alerta quando passa de 80%.
- Dados antigos podem ser arquivados via backup e removidos localmente.
- `navigator.storage.persist()` é solicitado para reduzir risco de evicção.

## Cenários de uso

### Cenário 1: Avião

- Usuário abre o Loco durante um voo.
- Histórico de mensagens e arquivos estão disponíveis offline.
- Ele escreve uma mensagem para um contato.
- A mensagem é salva localmente e enviada automaticamente quando o avião pousar
  e houver conexão.

### Cenário 2: Festa sem internet

- Duas pessoas na mesma LAN de um evento sem internet.
- Ambos abrem o Loco.
- WebRTC encontra a rota local e estabelece conexão P2P.
- Mensagens e transferências funcionam sem sair da rede local.

### Cenário 3: Contato offline

- Usuário envia mensagem para contato que está offline.
- P2P falha.
- Web Push acorda o dispositivo do contato quando possível.
- Contato recebe e responde.
- Próximas mensagens podem já ir por P2P se ambos estiverem online.

## Limitações e desafios

| Desafio                                  | Impacto                       | Mitigação                                |
| ---------------------------------------- | ----------------------------- | ---------------------------------------- |
| Navegador pode limpar dados              | Perda de histórico e arquivos | `storage.persist()` e backups            |
| OPFS não suportado no Firefox            | Arquivos não persistem        | Fallback para Blob URLs temporários      |
| WebRTC pode falhar em NATs restritivos   | P2P não funciona              | Fallback para Web Push e futuro TURN     |
| Dispositivo sem internet por muito tempo | Mensagens pendentes acumulam  | Retry automático e feedback de status    |
| Dispositivo sem permissão de push        | Não recebe pushes             | Indicar status e permitir reenvio manual |

## Resumo

A estratégia offline do Loco segue a premissa de que o app é **independente e
resiliente**:

- Todos os dados essenciais estão no dispositivo.
- P2P é sempre a primeira escolha de comunicação.
- Web Push existe apenas como fallback para alcançar contatos offline.
- Service Worker (empacotado via Deno.bundle()) e Cache API garantem que o app funcione sem internet.
- Sincronização automática acontece quando a conectividade retorna.

Esse design coloca o máximo de controle possível nas mãos do usuário, sem
depender de infraestrutura central.

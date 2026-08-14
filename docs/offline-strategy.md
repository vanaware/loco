# 📴 Estratégia de Funcionamento Offline e Resiliência no Loco

Este documento especifica a arquitetura **Local-First / Offline-First** do **Loco**, detalhando o comportamento da aplicação em cenários de desconexão, a retenção de dados no dispositivo e os mecanismos automáticos de ressincronização.

---

## 1. Filosofia e Princípios Fundamentais

O **Loco** opera sob a premissa de que **cada navegador é um nó autônomo**. O aplicativo não depende de um banco de dados centralizado para ler ou escrever informações.

1. **Local-First Absoluto:** Todo o histórico de mensagens, dados de perfil e mídias residem primariamente no dispositivo local. Nenhuma ação de interface (digitar mensagem, alterar perfil, adicionar contato) é bloqueada por ausência de rede.
2. **Sincronização Assíncrona via Handshakes:** Operações externas são tratadas como intenções registradas em uma fila local no IndexedDB (`Handshake_DB`), processadas assincronamente pelo Service Worker (`sw-handshakes.ts`).
3. **Resiliência em Três Níveis (Graceful Degradation):** A entrega de dados prioriza conexões diretas P2P, recorre ao Web Push como despertador e utiliza uma fila de retenção (*Polling Autenticado*) caso a infraestrutura de Push falhe.

---

## 2. Fast-Boot e Auto-Discovery Inteligente

Para que o PWA mantenha uma experiência ultrafluída de 60fps, o Loco aplica a estratégia de **Fast-Boot**.

* **No Primeiro Acesso (Onboarding):** A aplicação executa uma rotina de *Auto-Discovery* (`loadAllConfigs()` em `config-store.ts`). Ela envia pequenos Heartbeats (método `POST` para furar caches HTTP do navegador/servidor) para a rota atual e para a rota de `Fallback` da Cloudflare, definindo dinamicamente e com segurança o melhor caminho para transitar os envelopes de Push. Se o dispositivo estiver no "Modo Avião", a UI não trava aguardando *timeouts* da rede, inferindo automaticamente as configurações otimizadas para seguir no processo de criação offline.
* **Em Acessos Subsequentes:** Ao reabrir o App, as configurações do `ProxyPath` são lidas do IndexedDB local de maneira praticamente instantânea (~2ms). O app ignora qualquer Ping de validação externo, despachando o spinner de *Loading* de forma imediata e garantindo acesso instantâneo ao histórico de conversas E2E.

---

## 3. Divisão de Armazenamento Local

A persistência no dispositivo é estritamente setorizada por tipo de recurso para evitar gargalos na thread principal do navegador:

```text
                               +----------------------------+
                               |     Recursos de Dados      |
                               +--------------+-------------+
                                              |
       +--------------------------------------+--------------------------------------+
       |                                      |                                      |
(Dados Estruturados)                   (Arquivos Grandes)                   (Ativos PWA)
       |                                      |                                      |
       v                                      v                                      v
+------------------------------+       +------------------------------+       +------------------------------+
|          IndexedDB           |       |              OPFS            |       |         Cache Storage        |
|      (via idb-keyval)        |       | (Origin Private File System) |       |         (sw/cache.ts)        |
+------------------------------+       +------------------------------+       +------------------------------+
| - AppConfig_DB               |       | - Fotos originais em alta    |       | - HTMLs (index, share, etc.) |
| - BrowserB_Contatos_DB       |       | - Áudios e Mensagens de Voz  |       | - JS / TSX empacotados       |
| - Chat_DB                    |       | - Vídeos e Documentos P2P    |       | - Estilos CSS (Material 3)   |
| - Handshake_DB               |       | - Anexos da Timeline         |       | - Ícones e Fontes da PWA     |
+------------------------------+       +------------------------------+       +------------------------------+

```

---

## 4. O Ciclo de Vida do Handshake Offline (`Handshake_DB`)

Na arquitetura do Loco, **todas as mensagens e ações de rede são Handshakes** submetidos à Máquina de Estados operada pelo Service Worker:

```text
               [ Usuário envia uma mensagem ]
                             |
                             v
          Gravação Imediata na UI e Store Local
         (Status: 'pendente' / Exibido na Timeline)
                             |
                             v
           Enfileiramento em Handshake_DB (FluxoOut)
                             |
                             v
                   [ Há Conexão de Rede? ]
                   /                     \
             (SIM)                         (NÃO)
               /                             \
              v                               v
Processa Envio E2E                    Permanece Retido em FluxoOut
- Tenta Proxy FCM                     - Aguarda evento 'online'
- Tenta P2P (Se Online)               - Retentativas em background

```

---

## 5. Matriz de Capacidades Offline

| Funcionalidade do Loco | Modo Offline (Sem Rede) | Com Conectividade (Online) |
| --- | --- | --- |
| **Leitura do Histórico de Conversas** | ✅ **100% Funcional** (Leitura do IndexedDB) | ✅ **100% Funcional** |
| **Visualização de Anexos/Mídia** | ✅ **100% Funcional** (Carregado do OPFS) | ✅ **100% Funcional** |
| **Composição e Envio de Mensagens** | ⏳ **Enfileirado em `FluxoOut**` (Status `pendente`) | ⚡ **Disparo Imediato via E2E** |
| **Gestão de Perfil e QR Code** | ✅ **100% Funcional** (Geração local do `cqr`) | ✅ **100% Funcional** |
| **Adição Presencial de Contatos** | ✅ **100% Funcional** (Escaneamento câmera `cqr`) | ✅ **100% Funcional** |

---

## 6. Recuperação de Conexão e Ressincronização Automatizada

Quando a conectividade é restabelecida no dispositivo (disparo do evento `online` do navegador ou ativação do Background Sync):

1. **Descongelamento do Roteador:** O Service Worker executa a varredura da tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'` (interrompidos por falha de rede).
2. **Re-execução de Tentativas:** O Roteador aplica uma política de até **3 retentativas** por pacote, limitando requisições fantasmas.
3. **Atualização da Interface:** As alterações nos bancos do IndexedDB notificam os stores reativos, atualizando as marcas de entrega (`✓` enviada, `✓✓` entregue/lida) sem recarregar a tela (Mutação DOM O(1)).


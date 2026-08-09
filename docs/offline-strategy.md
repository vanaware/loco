# 📴 Estratégia de Funcionamento Offline e Resiliência no Loco

Este documento especifica a arquitetura **Local-First / Offline-First** do **Loco**, detalhando o comportamento da aplicação em cenários de desconexão, a retenção de dados no dispositivo e os mecanismos automáticos de ressincronização.

---

## 1. Filosofia e Princípios Fundamentais

O **Loco** opera sob a premissa de que **cada navegador é um nó autônomo**. O aplicativo não depende de um banco de dados centralizado para ler ou escrever informações.

1. **Local-First Absoluto:** Todo o histórico de mensagens, dados de perfil e mídias residem primariamente no dispositivo local. Nenhuma ação de interface (digitar mensagem, alterar perfil, adicionar contato) é bloqueada por ausência de rede.
2. **Sincronização Assíncrona via Handshakes:** Operações externas são tratadas como intenções registradas em uma fila local no IndexedDB (`Handshake_DB`), processadas assincronamente pelo Service Worker (`sw-handshakes.ts`).
3. **Resiliência em Três Níveis (Graceful Degradation):** A entrega de dados prioriza conexões diretas P2P, recorre ao Web Push como despertador e utiliza uma fila de retenção (*Polling Autenticado*) caso a infraestrutura de Push falhe.
4. **Proteção Contra Evicção:** O nó solicita Armazenamento Persistente (`navigator.storage.persist()`) na inicialização para evitar que o sistema operacional purgue o histórico durante períodos de memória baixa.

---

## 2. Divisão de Armazenamento Local

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
|          IndexedDB           |       |             OPFS             |       |         Cache Storage        |
|      (via idb-keyval)        |       | (Origin Private File System) |       |         (sw/cache.ts)        |
+------------------------------+       +------------------------------+       +------------------------------+
| - AppConfig_DB               |       | - Fotos originais em alta    |       | - HTMLs (index, share, etc.) |
| - BrowserB_Contatos_DB       |       | - Áudios e Mensagens de Voz  |       | - JS / TSX empacotados       |
| - BrowserB_MensagensRecebidas|       | - Vídeos e Documentos P2P    |       | - Estilos CSS (Material 3)   |
| - BrowserA_MensagensEnviadas |       | - Anexos da Timeline         |       | - Ícones e Fontes da PWA     |
| - Handshake_DB               |       +------------------------------+       +------------------------------+
+------------------------------+
```

> **Regra Arquitetural:** É terminantemente proibido o uso de `localStorage` para evitar bloqueios síncronos na thread de execução da UI.

---

## 3. O Ciclo de Vida do Handshake Offline (`Handshake_DB`)

Na arquitetura do Loco, **todas as mensagens e ações de rede são Handshakes** submetidos à Máquina de Estados operada pelo Service Worker (`sw-handshakes.ts`):

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
- Tenta P2P (Nível 1)                 - Aguarda evento 'online'
- Tenta Proxy FCM (Nível 2)           - Retentativas em background
- Enfileira Deno Pull (Nível 3)       - Status visual: ⏳ (Pendente)
```

### Otimização em Segundo Plano (Piggybacking)
Se o nó do emissor ficou offline por um longo período e perdeu a sincronização do perfil do destinatário, o Roteador de Handshakes detecta a divergência e **injeta automaticamente o Cartão de Visitas atualizado (`hand-profile.ts`) no mesmo envelope cifrado da mensagem**. O receptor atualiza os dados criptográficos no exato instante em que recebe a mensagem, promovendo a autocura da base sem intervenção do usuário.

---

## 4. Matriz de Capacidades Offline

| Funcionalidade do Loco | Modo Offline (Sem Rede) | Com Conectividade (Online) |
| :--- | :--- | :--- |
| **Leitura do Histórico de Conversas** | ✅ **100% Funcional** (Leitura do IndexedDB) | ✅ **100% Funcional** |
| **Visualização de Anexos/Mídia** | ✅ **100% Funcional** (Carregado do OPFS) | ✅ **100% Funcional** |
| **Composição e Envio de Mensagens** | ⏳ **Enfileirado em `FluxoOut`** (Status `pendente`) | ⚡ **Disparo Imediato via E2E** |
| **Gestão de Perfil e QR Code** | ✅ **100% Funcional** (Geração local do `cqr`) | ✅ **100% Funcional** |
| **Adição Presencial de Contatos** | ✅ **100% Funcional** (Escaneamento câmera `cqr`) | ✅ **100% Funcional** |
| **Recebimento de Novas Mensagens** | ❌ Indisponível (Requer canal ativo/Push) | ⚡ **Recebimento e Auto-Ack Instantâneo** |
| **Sincronização de Fila Retida (PULL)**| ❌ Indisponível | ⚡ **Executa `POST /api/fallback-pull`** |

---

## 5. Estratégia de Cache e Ativos PWA (`sw/cache.ts`)

O Service Worker implementa estratégias de cache diferenciadas para garantir que a aplicação seja carregada sem atrasos, mesmo em redes intermitentes:

* **Stale-While-Revalidate / Cache First (Ativos Estáticos):** JavaScripts, bibliotecas Web Components (`@material/web`), CSS e fontes são servidos instantaneamente do `CacheStorage`. Atualizações são baixadas em segundo plano para a execução seguinte.
* **Network First / Fallback Local (Documentos HTML):** As entradas de página (`index.html`, `share.html`, `profile.html`, `logout.html`) tentam a versão mais recente na rede; caso falhe, utilizam a cópia gravada no cache.

---

## 6. Recuperação de Conexão e Ressincronização Automatizada

Quando a conectividade é restabelecida no dispositivo (disparo do evento `online` do navegador ou ativação da PWA):

1. **Descongelamento do Roteador (`sw-handshakes.ts`):** O Service Worker executa a varredura da tabela `Handshake_DB` buscando registros com `out.status === 'pendente'` ou `'enviando'` (interrompidos por falha de rede).
2. **Re-execução de Tentativas:** O Roteador aplica uma política de até **3 retentativas** por pacote, com intervalo exponencial.
3. **Resgate da Fila de Fallback (PULL):** O cliente dispara uma requisição autenticada ao servidor Deno Proxy (`POST /api/fallback-pull`) para recuperar eventuais envelopes cifrados que foram retidos enquanto o dispositivo esteve inacessível.
4. **Atualização da Interface (Signals):** As alterações nos bancos do IndexedDB notificam os stores reativos (`mensagensStore.ts`, `contatosStore.ts`), atualizando as marcas de entrega (`✓` enviada, `✓✓` entregue/lida) sem recarregar a tela.

---

## 7. Tabela Comparativa: Documentação Anterior vs. Arquitetura Atual

| Recurso / Aspecto | Especificação Legada | Implementação Atual no Loco |
| :--- | :--- | :--- |
| **Fila de Envio Offline** | Lógica genérica no frontend | **Roteador de Handshakes em Service Worker (`Handshake_DB`)** |
| **Serviço de Cache PWA** | Referência a `sw.ts` genérico | **Módulo especializado `src/sw/cache.ts`** |
| **Resiliência do Servidor** | Dependência exclusiva de Web Push | **Fila de Fallback retida no Deno com Polling Autenticado** |
| **Retenção de Arquivos** | Sem especificação clara | **OPFS com monitoramento de quota e `storage.persist()`** |
| **Sincronização de Estado** | Polling não estruturado | **Handshake Auto-Ack com injeção de carona (*Piggybacking*)** |

---

## 8. Resumo

- O Loco é projetado sob o paradigma **Local-First**: os dados residem unicamente no dispositivo do usuário.
- Mídias e arquivos grandes utilizam o **OPFS**, enquanto mensagens e contatos usam o **IndexedDB** (`idb-keyval`).
- O enfileiramento de Handshakes garante que mensagens compostas offline sejam transmitidas automaticamente assim que a conexão for restabelecida.
- A combinação de **Cache API**, **Service Worker** e **Fallback Retido no Deno** garante operabilidade total do aplicativo mesmo sob conexões altamente instáveis.

# 🔮 Limitações Técnicas, Pendências e Roadmap do Loco

Este documento consolida o estado atual das limitações técnicas, pendências de integração e o plano de desenvolvimento futuro (*Roadmap*) para o **Loco**, alinhado com a arquitetura atual baseada no **Roteador de Handshakes (`sw-handshakes.ts`)**, **Stores Modulares (`src/stores/`)**, **Preact Signals** e **Servidor Proxy Deno**.

---

## 1. O que JÁ FOI IMPLEMENTADO (Evolução da Arquitetura)

Para referência técnica, os seguintes itens listados em rascunhos anteriores **já foram totalmente implementados e corrigidos** na base de código atual:

* ✅ **Criptografia E2E em Web Push (RFC 8291 / Híbrida):** Todas as mensagens trafegam cifradas via AES-GCM-256 + RSA-OAEP-2048 e comprimidas via GZIP (`fflate`). O Proxy Deno e o FCM recebem apenas o payload `ct` totalmente ilegível.
* ✅ **Persistência no Service Worker com App Fechado:** Quando um push chega e a aba está fechada, o Service Worker (`sw/push.ts` e `sw-handshakes.ts`) decifra a mensagem E2E, grava no IndexedDB (`BrowserB_MensagensRecebidas_DB`), emite o Auto-Ack e dispara a notificação nativa do SO.
* ✅ **Atualização Automática de Endpoints (*Piggybacking*):** Quando um contacto atualizou a sua subscrição ou foi adicionado, o Roteador de Handshakes detecta a divergência e injeta automaticamente o Cartão de Visitas (`hand-profile.ts`) no mesmo pacote da mensagem.
* ✅ **Gargalo do Limite de 4KB do FCM:** Resolvido com a interface `CompactContact` (`vx`, `vy`, `en`, `se`, `sp`, `sa`, `ve`), tokenização de endpoints FCM e compressão GZIP universal (`fflate`).
* ✅ **Arquitetura Reativa e Modular:** Substituição do antigo ficheiro monolítico `store.ts` por stores especializados em `src/stores/`, Signals de UI em `src/signals/state.ts` e bancos isolados no IndexedDB (`idb-keyval`).

---

## 2. Pendências de Integração de Módulos Futuros

### A. Sinalização WebRTC para Chamadas e DataChannel (`CallScreen.tsx`)
* **Estado Atual:** O componente `CallScreen.tsx` instancia a `RTCPeerConnection` e captura a mídia local, mas as funções de troca de SDP (`offer` e `answer`) e `ICE Candidates` ainda não estão conectadas ao Roteador de Handshakes.
* **Ação Necessária:** Criar o módulo especialista `src/handshakes/hand-webrtc.ts` para transportar o payload de sinalização `CompactSignaling` cifrado E2E via Web Push Proxy.

### B. Transferência P2P de Arquivos Pesados (WebTorrent + OPFS)
* **Estado Atual:** O gerenciamento de mídias leves já utiliza o OPFS. No entanto, o motor WebTorrent em Web Worker (`src/worker/p2p-transfer.worker.ts`) e o handshake especialista (`src/handshakes/hand-arquivo.ts`) estão especificados, mas aguardam integração final.
* **Ação Necessária:** Conectar o Worker à API síncrona `FileSystemSyncAccessHandle` do OPFS para gravação e leitura de blocos em alta velocidade durante *seeding/download*.

### C. Servidor TURN de Emergência para NATs Restritivos
* **Estado Atual:** A resolução de rotas P2P utiliza o servidor público STUN da Google (`stun:stun.l.google.com:19302`).
* **Ação Necessária:** Adicionar suporte à configuração opcional de credenciais de servidor TURN para retransmissão de mídia cifrada quando ambos os nós estiverem sob firewalls ou NATs simétricos restritivos.

---

## 3. Roadmap de Funcionalidades Futuras

### 💬 Funcionalidades de Mensageria e Interface
1. **Mensagens de Áudio / Voz:** Gravação nativa no navegador via `MediaRecorder API`, compressão e armazenamento no OPFS.
2. **Reações com Emojis:** Módulo handshake leve (`hand-reacao.ts`) para anexar reações a mensagens existentes.
3. **Edição e Remoção Remota:** Handshake de retratação/substituição de mensagens enviadas.
4. **Busca no Histórico e Paginação:** Indexação local de texto e virtualização de lista no `ChatSection.tsx` para suporte a conversas longas sem perda de quadros (60 FPS).
5. **Indicadores de Presença ("Online" e "A escrever..."):** Sinalização de eventos efêmeros exclusivamente através do canal direto P2P ativo (`RTCDataChannel`) quando ambos os utilizadores estão online, sem recorrer ao Web Push (evitando desperdício de bateria, limites de quota e notificações indevidas no SO).
6. **Seleção Rápida no Share Target (`ShareTargetPicker`):** Ao abrir o app via Web Share API de outro aplicativo, apresentar lista de contactos com busca para envio direto.

### 🛡️ Melhorias de Segurança e Criptografia
1. **Forward Secrecy (Double Ratchet / Signal Protocol):** Evolução do handshake para renovação de chaves efêmeras a cada mensagem, garantindo que a quebra de uma chave não comprometa o histórico passado.
2. **Bloqueio Biométrico (WebAuthn):** Exigir autenticação por biometria facial/digital antes de renderizar os sinais da UI e decifrar chaves do IndexedDB.
3. **Verificação Presencial de Fingerprint:** Exibição do hash visual das chaves públicas para comparação mútua entre contactos, prevenindo ataques do tipo Man-in-the-Middle (MITM).

### 🎴 Melhorias em QR Code e Contactos
1. **Convites Temporários e Protegidos:** Links `cjwt` com data de expiração e senha opcional para decodificação dos dados de contacto.
2. **Deep Links Nativos:** Suporte ao esquema `web+loco:` para abertura automática da PWA ao clicar em convites na web.

---

## 4. Limitações Conhecidas de Navegadores e Mitigações

| Recurso do PWA | Comportamento no Navegador | Mitigação Implementada / Planejada |
| :--- | :--- | :--- |
| **OPFS (FileSystem API)** | Suportado no Chrome, Edge e Safari. Suporte parcial ou desativado em algumas versões do Firefox. | Fallback para carregamento e persistência temporária em Blob URLs. |
| **`BarcodeDetector API`** | Funciona nativamente no Chrome Android. Indisponível ou limitado no Safari iOS. | Fallback de captura continuada de quadros de imagem com biblioteca JS local em `share.html`. |
| **`Web Share Target`** | Funcionamento pleno quando instalado como PWA no Android/Desktop. | Captura via parâmetros de busca URL (`?shared_title=...`) em `share.html`. |
| **`View Transitions API`** | Animações fluidas entre seções no Chrome/Edge. Indisponível no Safari. | Transições suaves via fallback CSS em `src/styles.css`. |
| **Armazenamento Persistente** | Sujeito a evicção pelo SO se o espaço em disco estiver crítico. | Chamada explícita de `navigator.storage.persist()` e alertas no `AdvancedSection.tsx` ao atingir 80% da quota. |

---

## 5. Matriz de Cenários e Resiliência

* **Contacto sem Internet / Offline por Longos Períodos:** As mensagens compostas ficam retidas no `Handshake_DB` com status `'pendente'`. O Roteador executa retentativas automáticas ao restabelecer a rede (`online`) e sincroniza a fila retida no Deno Proxy (`POST /api/fallback-pull`).
* **Incompatibilidade de Subscrição Push (HTTP 410 Gone):** Quando o gateway da Google/Apple rejeita um endpoint expirado, a mensagem é direcionada à Fila de Fallback Retida no Deno. Assim que o contacto reconecta, o *Piggybacking* re-alinha as chaves e restabelece o canal.

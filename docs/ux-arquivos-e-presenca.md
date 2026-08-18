# Experiência do Usuário (UX): P2P, Presença e Cofre de Arquivos

Este documento descreve como a complexa engenharia de rede P2P (WebRTC + WebTorrent) e armazenamento (OPFS) do **Loco** é traduzida em uma interface de usuário simples, fluída e baseada no Material Design 3.

---

## 1. Indicadores de Presença e Conexão (WebRTC)

Diferente de mensageiros centralizados, o Loco não possui um servidor para dizer se alguém está "Online". O status de presença indica a **existência física de um túnel P2P direto (RTCDataChannel) ativo** entre os dois dispositivos.

### 1.1 Lista de Contatos (Aura de Conexão)
Na tela principal de contatos ou conversas recentes:
* **Conexão Inativa:** O avatar do contato aparece normalmente. (O contato pode estar com internet, mas o Loco não está ativamente roteando dados via WebRTC com ele agora; a comunicação seria via fila/Push).
* **Conexão P2P Ativa:** O avatar do contato recebe um **círculo (anel) azul vibrante** ao redor da foto.
  * *UX:* Isso sinaliza ao usuário: *"Você e esta pessoa estão conectados diretamente agora. Mensagens e arquivos fluirão na velocidade da luz."*

### 1.2 Tela de Detalhes do Contato
Ao abrir o perfil/detalhes de um contato específico, além da foto e chaves públicas, teremos um selo de status técnico:
* **🟢 Conexão P2P Ativa** (Aparece apenas quando o `RTCPeerConnection.connectionState === 'connected'`).
* **📡 Conectando...** (Durante a negociação silenciosa de Handshake/ICE).
* **🌙 Standby / Fila** (Quando não há túnel, e as mensagens dependem do Push).

---

## 2. A Experiência de Arquivos no Chat

A UI de envio de arquivos no chat deve imitar a simplicidade do WhatsApp/Telegram, escondendo a complexidade da criptografia e fatiamento em blocos.

### 2.1 Enviando um Arquivo (Ação do Remetente)
1. O usuário toca no ícone de "Anexo" e seleciona um arquivo da galeria/sistema.
2. Um balão de mensagem aparece imediatamente no chat.
3. **Status Visual:**
   * 🔒 *Criptografando...* (Rápido, enquanto o arquivo desce pro OPFS).
   * 📡 *Semeando (0%)* (Aguardando o contato ficar online/aceitar).
   * ⬆️ *Enviando (45%)* (O WebRTC abriu e o contato está puxando os dados).
   * ✅ *Concluído* (O contato possui 100% do arquivo).

### 2.2 Recebendo um Arquivo (Ação do Destinatário)
1. O usuário recebe a notificação/mensagem do arquivo.
2. O balão no chat mostra o nome, tamanho do arquivo e uma miniatura borrada (se for imagem).
3. **Status Visual:**
   * O usuário toca no botão **"Baixar"** (ícone de seta para baixo).
   * ⬇️ *Baixando (20%)* (Motor Torrent puxando blocos do emissor).
   * 🔓 *Pronto* (Disponível para play instantâneo).
   * *Nota:* Como usamos streaming por blocos, se for um vídeo, o botão muda para "Play" logo nos primeiros 5% do download, permitindo assistir enquanto o resto baixa no fundo.

---

## 3. O Cofre Local (Gerenciador OPFS)

Como o usuário é o próprio "servidor", precisamos de uma tela dedicada onde ele gerencie o que está ocupando espaço no celular dele e quem tem acesso.

### 3.1 Tela "Meu Cofre" ou "Arquivos Salvos"
Acessível pelo menu principal. Esta tela lista tudo o que está fisicamente no **OPFS** do usuário.

**Abas/Filtros da Interface:**
* **Privados:** Arquivos guardados apenas para si mesmo. Ninguém mais sabe que existem.
* **Compartilhados:** Arquivos que foram enviados em chats (semeando para contatos específicos). Mostra a lista de avatares de quem tem permissão para puxar o arquivo.
* **Públicos:** Arquivos marcados no diretório aberto do usuário.

**Ações por Arquivo:**
* **Mudar Permissão:** Um menu dropdown (*"Tornar Público"*, *"Remover acesso de Bob"*).
* **Apagar do Dispositivo:** Remove os blocos binários do OPFS (liberando espaço). Se apagado, o arquivo no chat ficará indisponível para os amigos baixarem, a menos que outro amigo do grupo já tenha o arquivo completo para assumir como "Seeder".

---

## 4. Controle Global (Tela de Configurações)

O protocolo P2P consome processamento e bateria. O usuário precisa do controle supremo sobre o esforço do aparelho.

### 4.1 Sessão "Uso de Dados e Rede" (Configurações)
* **Toggle: "Ativar Motor P2P / WebTorrent"** (Chave Mestra)
  * *Ligado:* Comportamento padrão.
  * *Desligado:* Coloca **todos os torrents em Standby**. O Web Worker é pausado. O aplicativo ainda envia e recebe textos curtos via Push/Fila, mas transferências de arquivo e chamadas são negadas instantaneamente.
* **Toggle: "Apenas via Wi-Fi"**
  * Pausa a semeadura/leeching automaticamente se o celular for para o 4G/5G.

---

## 5. Tela de Diagnóstico (Para Desenvolvedores/Power Users)

Como somos descentralizados, debugar problemas de rede no P2P é vital.

### 5.1 Dashboard "Saúde da Rede" (Em Configurações Avançadas)
Uma tela puramente informativa, atualizada em tempo real (via Preact Signals conectados ao Worker):
* **Status do Worker:** 🟢 Operante / 🔴 Pausado
* **Conexões WebRTC Abertas:** `3` (Lista os IDs dos peers conectados).
* **Arquivos Ativos (Torrents):** `2 baixando, 5 semeando`.
* **Tráfego Atual:** `↓ 1.2 MB/s | ↑ 500 KB/s`
* **Espaço Usado no OPFS:** `1.5 GB` (Calculado a partir dos metadados do IDB).

Isso nos dará visibilidade total de que a "fábrica" está rodando por baixo dos panos.
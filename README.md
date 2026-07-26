# Loco

Um mensageiro descentralizado PWA com Material Design 3, comunicação híbrida
(Web Push + WebRTC), e integração profunda com APIs modernas de navegador.

## ✨ Recursos

- 💬 Mensagens de texto com criptografia local
- 📎 Transferência P2P de arquivos via WebTorrent
- 📍 Compartilhamento de localização
- 📷 Leitura de QR Codes nativa
- 🛡️ Armazenamento persistente (OPFS + IndexedDB)
- 💾 Backup e restauração completa
- 📤 Web Share Target (recebe compartilhamento de outros apps)
- 🔔 Notificações Push
- ⚡ App Shortcuts e App Badging
- 🎬 Picture-in-Picture em chamadas
- ☀️ Screen Wake Lock em chamadas

## 🚀 Como Executar

### Pré-requisitos

- [Deno](https://deno.land/) instalado

### Comandos

```bash
# Clonar repositório
git clone https://github.com/seu-usuario/loco.git
cd loco

# Build
deno task build

# Executar servidor de desenvolvimento
deno task dev

# Executar testes
deno task test

# Deploy (produção)
deno task start
```

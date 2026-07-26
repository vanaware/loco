# Problemas, Limitações e Melhorias Futuras do Loco

Este documento consolida todas as lógicas que ainda não foram corrigidas, funcionalidades não implementadas, limitações técnicas e melhorias planejadas para o Loco. O conteúdo aqui foi reunido dos demais arquivos de documentação do projeto.

## Lógicas não corrigidas / não implementadas

### 1. WebRTC signaling não implementada
- **Arquivos**: `src/store.ts`, `src/components/CallScreen.tsx`
- **Descrição**: A variável `peerConnections` está comentada como `TODO`. O app não estabelece conexões WebRTC automaticamente, então o data channel P2P não é criado sem uma sinalização externa.
- **Impacto**: O recurso "P2P primeiro" não funciona na prática. Mensagens e chamadas caem para Web Push ou não funcionam.
- **Trabalho futuro**: Implementar troca de ofertas/answers SDP entre peers via Web Push, DataChannel existente ou outro canal de sinalização.

### 2. Chamadas de voz/vídeo não conectam
- **Arquivo**: `src/components/CallScreen.tsx`
- **Descrição**: A tela cria uma `RTCPeerConnection`, gera oferta local e adiciona tracks, mas não troca SDP com o outro peer.
- **Impacto**: Chamadas não saem do estado local. O usuário vê sua própria câmera, mas não conecta com ninguém.
- **Trabalho futuro**: Implementar sinalização WebRTC e aceitação de chamadas no destinatário.

### 3. P2P "primeiro" depende de data channel já aberto
- **Arquivo**: `src/store.ts` (`smartSendMessage`)
- **Descrição**: `smartSendMessage` tenta usar `dataChannels.get(contactId)`, mas o mapa `dataChannels` nunca é preenchido automaticamente.
- **Impacto**: Mensagens nunca vão por P2P direto. Sempre usam Web Push (quando houver endpoint) ou falham.
- **Trabalho futuro**: Criar função `openDataChannel(contactId)` que estabeleça conexão WebRTC e data channel.

### 4. Web Push simplificado (sem criptografia RFC 8291)
- **Arquivos**: `src/crypto.ts`, `src/store.ts`
- **Descrição**: O payload é enviado como JSON plano para o endpoint do peer. Não há criptografia de ponta a ponta conforme RFC 8291.
- **Impacto**: Servidores push intermediários podem ler o conteúdo. Requer relay server para criptografia correta.
- **Trabalho futuro**: Implementar criptografia RFC 8291 ou usar um relay server confiável.

### 5. Endpoint do contato não é obtido automaticamente
- **Arquivo**: `src/store.ts`
- **Descrição**: Após adicionar um contato via QR Code (apenas `id` + `displayName`), não há mecanismo automático para obter/substituir a subscription push do peer.
- **Impacto**: Push só funciona se o contato já tiver sido adicionado com subscription completa.
- **Trabalho futuro**: Sincronizar subscriptions entre peers na primeira comunicação bem-sucedida.

### 6. Recebimento de push quando o app está fechado
- **Arquivos**: `src/sw/sw.ts`, `src/components/App.tsx`
- **Descrição**: O SW exibe notificações e envia mensagens para clients abertos via `postMessage`. Quando o app está completamente fechado, a mensagem pode ser perdida se o client não reabrir.
- **Impacto**: Mensagens recebidas enquanto o app está fechado só aparecem após abrir e sincronizar.
- **Trabalho futuro**: Persistir mensagens recebidas via push no IndexedDB a partir do SW, ou usar Background Sync para reenvio.

### 7. Trocar SDP entre peers
- **Arquivo**: `docs/webrtc-signaling.md`
- **Descrição**: Não existe canal para trocar ofertas/answers WebRTC entre peers.
- **Solução planejada**: Usar Web Push ou DataChannel existente para sinalização.

### 8. TURN server não implementado
- **Arquivos**: `docs/offline-strategy.md`, `docs/webrtc-signaling.md`
- **Descrição**: NATs restritivos podem bloquear conexões P2P. Atualmente o app usa apenas STUN do Google.
- **Solução planejada**: Adicionar suporte a TURN server para redes restritas.

## Funcionalidades não implementadas

### 9. Mensagens de voz
- Gravar áudio e enviar via OPFS/P2P.

### 10. Chamadas em grupo
- Mesh network para múltiplos participantes.

### 11. Reações a mensagens
- Emojis de reação.

### 12. Edição de mensagens
- Editar mensagens enviadas recentemente.

### 13. Apagar para todos
- Retractar mensagens em ambos os lados.

### 14. Busca no histórico
- Pesquisar mensagens e arquivos.

### 15. Filtros de conversas
- Filtrar por texto, mídia, localização, etc.

### 16. Notificações customizadas por contato
- Sons e vibrações diferentes por contato.

### 17. Status "online" e "digitando..."
- Indicadores em tempo real de presença.

### 18. Sincronização multi-dispositivo
- Sync entre dispositivos do mesmo usuário.

### 19. Backup automático
- Backup periódico para nuvem (opcional).

### 20. Paginação/virtualização de listas
- Listas longas de contatos/mensagens podem ter performance ruim.

### 21. Snackbar / toast
- Feedback visual para ações do usuário.

### 22. Componente de seleção rápida de contato para Share Target
- Ao abrir via Web Share Target, apresentar tela de seleção de contato com busca.

## Melhorias futuras de segurança e privacidade

### 23. Criptografia ponta-a-ponta com Signal Protocol
- Cada dispositivo gera um par de chaves X3DH (X25519).
- As chaves públicas são trocadas via QR Code ou primeiro contato P2P.
- Mensagens criptografadas com chave pública do destinatário.
- Forward secrecy com chaves efêmeras.

### 24. Criptografia de payload Web Push (RFC 8291)
- Payload criptografado com chave pública do subscriber (`p256dh`).
- Relay server pode fazer a criptografia sem ler o conteúdo.

### 25. Biometria para proteger a masterKey
- Usar WebAuthn para exigir autenticação biométrica antes de decriptografar.

### 26. Verificação de contato
- Mostrar fingerprint da chave para evitar MITM.

## Melhorias futuras de QR Code e contatos

### 27. Links temporários
- Gerar links que expiram após um tempo.

### 28. Links com senha
- Exigir palavra-passe para adicionar contato.

### 29. QR Code com design
- Permitir customização visual do QR Code.

### 30. Deep links
- Usar `web+loco:` para abrir o app nativamente em vez de hash.

## Melhorias futuras de transferência P2P

### 31. Compressão de arquivos antes do envio
- Reduzir tamanho antes de seedar.

### 32. Criptografia end-to-end de arquivos
- Proteger arquivos transferidos via P2P.

### 33. Preview de arquivos enquanto baixam
- Mostrar progresso visual melhor.

### 34. Sincronização de estado de transferência entre dispositivos
- Manter estado consistente entre dispositivos do usuário.

## Melhorias técnicas futuras

### 35. Compressão de imagens
- Converter para WebP/AVIF para reduzir tamanho.

### 36. Streaming de vídeo via WebTorrent
- Permitir streaming durante o download.

### 37. Análise de storage
- Gráficos de uso de espaço por tipo de arquivo.

### 38. Limpeza automática
- Apagar arquivos antigos automaticamente.

### 39. Modo escuro
- Tema escuro automático baseado em preferências do sistema.

### 40. Internacionalização (i18n)
- Suporte a múltiplos idiomas.

## Integrações futuras

### 41. Calendário
- Compartilhar eventos de calendário.

### 42. Contatos do sistema
- Sync bidirecional com agenda do dispositivo.

### 43. Notificações ricas
- Ações em notificações (responder, marcar como lido).

### 44. Widgets
- Widgets para tela inicial (Android/iOS).

### 45. Atalhos de teclado
- Atalhos para desktop (Ctrl+N, Ctrl+F, etc.).

### 46. Compartilhamento de tela
- Screen sharing em chamadas.

### 47. Anotações em imagens
- Desenhar em imagens compartilhadas.

### 48. OCR
- Extrair texto de imagens compartilhadas.

## Limitações técnicas conhecidas

### OPFS no Firefox
- O Origin Private File System não é suportado no Firefox. O app usa fallback para Blob URLs temporários, mas arquivos não persistem.

### BarcodeDetector no Safari
- Leitura de QR Code não funciona no Safari. Requer fallback ou compartilhamento manual.

### Contact Picker
- Limitado ao Chrome Android.

### Web Share Target
- Funcionalidade reduzida no Safari iOS e Firefox.

### View Transitions
- Não suportado no Safari.

### Picture-in-Picture
- Vídeo funciona em Chrome/Firefox/Safari; PiP de documento ainda é limitado.

## Cenários que podem falhar

- **Contato não recebe pushes**: endpoint expirou, permissão negada ou serviço de push indisponível.
- **Navegador limpa dados**: perda de histórico e arquivos. Mitigação via `storage.persist()` e backups.
- **Dispositivo sem internet por muito tempo**: mensagens pendentes acumulam. Retry automático e feedback de status.
- **Dispositivo sem permissão de push**: não recebe notificações. Indicar status e permitir reenvio manual.
- **WebRTC bloqueado em NATs restritivos**: fallback para Web Push e futuro TURN.
- **QR Code não detectado**: navegador sem suporte a BarcodeDetector ou câmera sem permissão.
- **Backup muito grande**: muitos arquivos no OPFS. Limpar arquivos antigos antes do backup.

## Como contribuir

Se desejar trabalhar em algum dos itens acima, abra uma issue ou pull request com:
1. Descrição do problema
2. Proposta de solução
3. Testes que cubram o cenário

Mantenha a arquitetura P2P primeiro e offline-first ao propor mudanças.

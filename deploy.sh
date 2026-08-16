#!/bin/bash

# Aborta o script se ocorrer algum erro crítico nas operações normais
set -e

# ==============================================================================
# 0. CONFIGURAÇÕES DE AMBIENTE (NON-INTERACTIVE)
# ==============================================================================
# Informa aos CLIs (como Wrangler) que estamos em um fluxo de automação,
# suprimindo prompts (Y/n) e pedidos de envio de métricas.
export CI=true
export WRANGLER_SEND_METRICS=false

# ==============================================================================
# 1. PARSING DE ARGUMENTOS (--at=... --m=...)
# ==============================================================================

# Valores padrão
AT="github"
MESSAGE=""

# Loop de extração de parâmetros nominais
for i in "$@"; do
  case $i in
    --at=*)
      AT="${i#*=}"
      shift
      ;;
    --m=*)
      MESSAGE="${i#*=}"
      shift
      ;;
    *)
      # Ignora argumentos desconhecidos
      ;;
  esac
done

# ==============================================================================
# 2. EXTRAÇÃO DINÂMICA DA VERSÃO E CONFIGURAÇÃO
# ==============================================================================

# Busca a linha "version", extrai o conteúdo entre aspas e separa o Major.Minor
FULL_VERSION=$(grep '"version"' deno.jsonc | awk -F'"' '{print $4}')
MAJOR_MINOR=$(echo $FULL_VERSION | awk -F'.' '{print $1"."$2}')
TAG_NAME="v${MAJOR_MINOR}"

# Se a mensagem estiver vazia, assume o padrão
if [ -z "$MESSAGE" ]; then
  MESSAGE="Versão $TAG_NAME"
fi

echo "============================================================"
echo "🚀 INICIANDO DEPLOY LOCO"
echo "============================================================"
echo "📌 Versão completa: $FULL_VERSION"
echo "🏷️  Tag alvo: $TAG_NAME"
echo "📝 Mensagem de commit: $MESSAGE"
echo "🎯 Alvo do Deploy: $AT"
echo "============================================================"

# ==============================================================================
# 3. SINCRONIZAÇÃO DO CÓDIGO FONTE (Commit e Push)
# ==============================================================================
# Independente do alvo, garantimos que o código esteja a salvo no repositório.

echo ""
echo "📦 1/4 - Empacotando e enviando código fonte para o repositório..."
git add .

# Utilizamos "|| true" pois o git commit retorna erro (exit 1) se não houver arquivos alterados
git commit -m "$MESSAGE" || true

# Envia o código atual para a branch ativa
git push

# ==============================================================================
# 4. ROTEAMENTO DO DEPLOY
# ==============================================================================

if [ "$AT" = "github" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: GITHUB ACTIONS (Via Tags)
  # ----------------------------------------------------------------------------
  echo ""
  echo "🧹 2/4 - Limpando tags antigas ($TAG_NAME)..."
  
  git push origin --delete $TAG_NAME 2>/dev/null || true
  git tag -d $TAG_NAME 2>/dev/null || true

  echo ""
  echo "🏷️  3/4 - Publicando nova tag (Isso disparará o Github Actions)..."

  git tag -a $TAG_NAME -m "Versão $TAG_NAME"
  git push origin $TAG_NAME --force

  echo ""
  echo "✅ DEPLOY VIA GITHUB ACIONADO COM SUCESSO!"
  echo "Acompanhe o andamento na aba Actions do seu repositório."

elif [ "$AT" = "cloudflare" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: CLOUDFLARE DIRETO (Via Wrangler Deno)
  # ----------------------------------------------------------------------------
  echo ""
  echo "🔐 2/4 - Sincronizando Segredos (Secrets) no Cloudflare Worker..."
  
  EXTRACTED_PRIVATE_KEY=$(deno run -A --env-file minify-keys.ts SERVER_PRIVATE_KEY)
  
  if [ -z "$EXTRACTED_PRIVATE_KEY" ]; then
    echo "❌ ERRO: A extração da chave retornou vazia! O deploy foi abortado."
    exit 1
  fi

  echo "   Limpando chave antiga (se existir)..."
  # Apagamos a chave e suprimimos a saída para manter o terminal limpo
  echo "y" | deno run -A npm:wrangler secret delete SERVER_PRIVATE_KEY -c wrangler-worker.toml > /dev/null 2>&1 || true

  echo "   Registrando nova chave no cofre da Cloudflare (com active polling)..."
  
  # 🔥 ARQUITETURA: Active Polling
  # Ao invés de um sleep cego, testamos ativamente a resposta da API até a consistência ocorrer.
  MAX_RETRIES=10
  RETRY_COUNT=0
  SUCCESS=false

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # O if suspende temporariamente o "set -e" para podermos tratar a falha pacificamente
    if echo "$EXTRACTED_PRIVATE_KEY" | deno run -A npm:wrangler secret put SERVER_PRIVATE_KEY -c wrangler-worker.toml > /dev/null 2>&1; then
      SUCCESS=true
      break
    else
      RETRY_COUNT=$((RETRY_COUNT+1))
      echo "   ⏳ Aguardando a liberação do nome na API (Tentativa $RETRY_COUNT/$MAX_RETRIES)..."
      sleep 3
    fi
  done

  if [ "$SUCCESS" = false ]; then
    echo "❌ ERRO: A Cloudflare demorou demais para liberar o segredo. Abortando deploy."
    exit 1
  fi

  echo "✅ SERVER_PRIVATE_KEY atualizado com segurança."

  echo ""
  echo "⚡ 3/4 - Realizando deploy do Backend (Cloudflare Worker)..."
  deno run -A npm:wrangler deploy -c wrangler-worker.toml

  echo ""
  echo "⚡ 4/4 - Realizando deploy do Frontend (Cloudflare Pages)..."
  deno run -A npm:wrangler pages deploy

  echo ""
  echo "✅ DEPLOY DIRETO NA CLOUDFLARE CONCLUÍDO COM SUCESSO!"
  
else
  echo ""
  echo "❌ ERRO: Alvo de deploy desconhecido ('$AT'). Use '--at=github' ou '--at=cloudflare'."
  exit 1
fi

echo "============================================================"
#!/bin/bash

# Aborta o script se ocorrer algum erro crítico nas operações normais
set -e

# ==============================================================================
# 0. CONFIGURAÇÕES DE AMBIENTE (NON-INTERACTIVE)
# ==============================================================================
# O CI=true força o Wrangler a não fazer perguntas interativas.
export CI=true
export WRANGLER_SEND_METRICS=false

# ==============================================================================
# 1. PARSING DE ARGUMENTOS (--at=... --m=...)
# ==============================================================================

# AT="github"
MESSAGE=""

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
      ;;
  esac
done

# ==============================================================================
# 2. EXTRAÇÃO DINÂMICA DA VERSÃO E CONFIGURAÇÃO
# ==============================================================================

FULL_VERSION=$(grep '"version"' deno.jsonc | awk -F'"' '{print $4}')
MAJOR_MINOR=$(echo $FULL_VERSION | awk -F'.' '{print $1"."$2}')
TAG_NAME="v${MAJOR_MINOR}"

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
# 3. ROTEAMENTO DO DEPLOY
# ==============================================================================

if [ "$AT" = "github" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: GITHUB ACTIONS (Com Commit e Push)
  # ----------------------------------------------------------------------------
  echo ""
  echo "📦 1/3 - Empacotando e enviando código fonte para o repositório..."
  git add .
  git commit -m "$MESSAGE" || true
  git push

  echo ""
  echo "🧹 2/3 - Limpando tags antigas ($TAG_NAME)..."
  git push origin --delete $TAG_NAME 2>/dev/null || true
  git tag -d $TAG_NAME 2>/dev/null || true

  echo ""
  echo "🏷️  3/3 - Publicando nova tag (Isso disparará o Github Actions)..."
  git tag -a $TAG_NAME -m "Versão $TAG_NAME"
  git push origin $TAG_NAME --force

  echo ""
  echo "✅ DEPLOY VIA GITHUB ACIONADO COM SUCESSO!"
  echo "Acompanhe o andamento na aba Actions do seu repositório."

elif [ "$AT" = "cloudflare" ]; then
  # ----------------------------------------------------------------------------
  # FLUXO: CLOUDFLARE DIRETO (Sem Commit, Sem Push, Apenas Infraestrutura)
  # ----------------------------------------------------------------------------
  echo ""
  echo "🔐 1/3 - Sincronizando Segredos (Secrets) no Cloudflare Worker..."
  
  EXTRACTED_PRIVATE_KEY=$(deno run -A --env-file minify-keys.ts SERVER_PRIVATE_KEY)
  
  if [ -z "$EXTRACTED_PRIVATE_KEY" ]; then
    echo "❌ ERRO: A extração da chave retornou vazia! O deploy foi abortado."
    exit 1
  fi

  # Como removemos a "Var" conflitante, o Wrangler sobrescreve o "Secret" de forma limpa
  echo "   Registrando chave no cofre da Cloudflare..."
  echo "$EXTRACTED_PRIVATE_KEY" | deno run -A npm:wrangler secret put SERVER_PRIVATE_KEY -c wrangler-worker.toml
  echo "✅ SERVER_PRIVATE_KEY atualizado com segurança."

  echo ""
  echo "⚡ 2/3 - Realizando deploy do Backend (Cloudflare Worker)..."
  deno run -A npm:wrangler deploy -c wrangler-worker.toml 

  echo ""
  echo "⚡ 3/3 - Realizando deploy do Frontend (Cloudflare Pages)..."
  # O Pages lê tudo nativamente do wrangler.toml
  # Criamos uma cópia temporária do wrangler-pages.toml para satisfazer a CLI da Cloudflare
  cp wrangler-pages.toml wrangler.toml
  #mv build/functions build/dist/
  
  deno run -A npm:wrangler pages deploy --commit-dirty=true
  
  # Limpamos o rastro para o repositório continuar limpo e organizado
  rm wrangler.toml
  # mv build/dist/functions build/

  echo ""
  echo "✅ DEPLOY DIRETO NA CLOUDFLARE CONCLUÍDO COM SUCESSO!"
  
else
  echo ""
  echo "❌ ERRO: Alvo de deploy desconhecido ('$AT'). Use '--at=github' ou '--at=cloudflare'."
  exit 1
fi

echo "============================================================"
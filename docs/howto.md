# 🚀Comandos para Executar

```bash
# Clonar/criar repositório
mkdir loco && cd loco
# (crie os arquivos acima)

# Instalar Deno (se necessário)
curl -fsSL https://deno.land/install.sh | sh

# Build (usa Deno.bundle() para múltiplos entrypoints) e executar
deno task build && deno task start

# Desenvolvimento com watch
deno task dev

# Testes
deno task test
```

O app estará disponível em

http://localhost:8000

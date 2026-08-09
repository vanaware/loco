# 🚀 Comandos para Execução e Desenvolvimento do Loco

Este documento reúne os comandos necessários para clonar, instalar, compilar, executar e testar o **Loco** em ambiente local, utilizando o runtime **Deno 2.x**.

---

## 1. Instalação do Ambiente e Pré-requisitos

### A. Clonar o Repositório
```bash
git clone https://github.com/vanaware/loco.git
cd loco
```

### B. Instalar o Deno 2.x (se necessário)
* **Linux / macOS:**
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```
* **Windows (PowerShell):**
  ```powershell
  irm https://deno.land/install.ps1 | iex
  ```

---

## 2. Comandos Principais (`deno.json`)

Todas as tarefas de automação utilizam a CLI do **Deno 2.x** e estão declaradas no arquivo de configuração `deno.json`:

### A. Processamento de Build (Compilação e Artefatos)
```bash
deno task build
```
> Executa o script `build.ts`, compilando os arquivos TypeScript/TSX, copiando ativos estáticos para `dist/`, gerando as chaves RSA do servidor e injetando a relação de recursos no Service Worker.

### B. Executar o Servidor em Produção
```bash
deno task start
```
> Inicializa o servidor HTTP Deno Proxy disponibilizando a aplicação em `http://localhost:8000`.

### C. Modo de Desenvolvimento (Watch)
```bash
deno task dev
```
> Monitora alterações nos arquivos-fonte, recompilando os artefatos e reiniciando o servidor automaticamente a cada mudança.

---

## 3. Comandos de Manutenção e Qualidade

### A. Execução dos Testes Automatizados
```bash
deno task test
```

### B. Aferição Estática de Tipagem (TypeScript)
```bash
deno task typecheck
```

### C. Limpeza dos Arquivos Compilados
```bash
deno task clean
```
> Remove completamente o diretório de distribuição `dist/`.

---

## 4. Acesso à Aplicação

Após rodar `deno task start` ou `deno task dev`, abra o navegador em:

👉 **`http://localhost:8000`**

# Desenvolvimento e validação

## Requisitos

- Node.js 22.13 ou superior e npm para compilar a interface.
- PHP 8.3, com `pdo_mysql`, `mbstring`, `openssl` e `fileinfo`.
- MySQL/MariaDB para executar o serviço PHP. A validação atual utiliza MariaDB 10.11.
- Python 3.12 ou superior e `tests/requirements.txt` para os testes HTTP.

## Interface e formatação

```bash
npm ci
npm run check:v2
npm run check:legacy
npm run build:v2
npm run format:check
```

`npm run format` padroniza os arquivos de código e documentação. Os arquivos compilados,
locks e ativos de terceiros são preservados pelo `.prettierignore`.

A V2 usa o CSS original já entregue em `public/assets`. Para alterar a versão antiga,
instale também as dependências de `frontend/` com `npm ci` e execute `npm run build`
nessa pasta. O finalizador recompila a V2 e copia o arquivo de entrada PHP.

Para a interface compartilhada da prévia:

```bash
npm run sync:preview
```

A prévia tem seu lock e comandos próprios em `preview/package.json`. No ambiente Sites,
utilize os helpers e o processo de publicação do plugin existente. A cópia no GitHub não
contém dependências, builds, sessões ou credenciais do ambiente hospedado.

## Executar PHP localmente

Configure um banco de desenvolvimento e crie os arquivos privados, conforme o guia
CloudPanel. Para desenvolvimento local, use `environment=local` e uma URL local:

```bash
php -S 127.0.0.1:8080 -t public bin/dev-router.php
```

Abra `http://127.0.0.1:8080/v2`. O servidor embutido é destinado ao desenvolvimento.

## Testes HTTP em banco descartável

O runner cria um banco com nome aleatório iniciado por `urna_qa_` e uma cópia temporária
do serviço. Ele recusa host de banco diferente de `127.0.0.1` ou `localhost` e remove
somente o banco que ele próprio criou. Não utiliza `config/config.php` da instalação.

Prepare um MariaDB local exclusivo para testes. Informe as credenciais ao terminal
através de variáveis de ambiente; não coloque senha em argumentos ou no Git.

```bash
python3 -m venv .venv
.venv/bin/pip install -r tests/requirements.txt
# Defina URNA_TEST_DB_USER e URNA_TEST_DB_PASSWORD no ambiente local.
.venv/bin/python tests/run-http.py
```

Variáveis aceitas: `URNA_TEST_DB_HOST` (padrão `127.0.0.1`), `URNA_TEST_DB_PORT`
(padrão `3306`), `URNA_TEST_DB_USER` (padrão `root`), `URNA_TEST_DB_PASSWORD` e
`URNA_TEST_PHP` (padrão `php`, executável PHP local). Não execute os testes contra
um serviço de banco de produção, mesmo que esteja no mesmo computador.

As três suites verificam voto e urnas compartilhadas, permissões da equipe e gestão
manual/exclusão de alunos. Os dados e as senhas são fictícios. O runner também valida
a criação da credencial inicial sem exibir senha nem sobrescrever arquivo existente.

O workflow `.github/workflows/validar.yml` repete os checks e testes em um MariaDB
isolado do GitHub Actions. Ele não instala nem publica no servidor da escola.

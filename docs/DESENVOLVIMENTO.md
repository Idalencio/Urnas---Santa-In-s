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
npm run test:tally
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

As suites verificam voto e urnas compartilhadas, permissões da equipe, gestão
manual/exclusão de alunos, exclusão lógica de eleições, importação comparada por matrícula e apuração agregada. A suite de ciclo completo verifica seleção individual, edição agendada, bloqueio na abertura, acesso público por link e arquivo administrativo. Os dados e as senhas são fictícios. O runner também valida
a criação da credencial inicial sem exibir senha nem sobrescrever arquivo existente.

O workflow `.github/workflows/validar.yml` repete os checks e testes em um MariaDB
isolado do GitHub Actions. Ele não instala nem publica no servidor da escola.

## Apuração

### Eleições simultâneas

`tests/multi-election-v2.py` e `preview/scripts/check-multi-election.mjs` criam seis
eleições abertas nas duas urnas compartilhadas, com seis duplas em cada eleição e
12 eleitores por lista. Confirmam votos concorrentes e totais diferentes de 1 a 6
(21 no total), matrícula reutilizável entre eleições, bloqueio de repetição na mesma
eleição e reenvio idempotente. Conferem os registros gravados, a importação parcial
sem duplicidade, a preservação das listas publicadas e a exclusão de uma eleição
sem interferir nas demais. O teste D1 também reabre o SQLite e verifica sua
integridade. Os dois testes fazem parte da validação automática.

Os testes usam exclusivamente MySQL/MariaDB local e o adaptador D1 sobre SQLite
descartável, com alunos fictícios. Não medem capacidade de produção nem validam a
instalação específica do CloudPanel; essa instalação requer um ensaio com os
aparelhos e a rede da escola.

### Consulta e atualização

A aba Apuração usa `GET /api/v2/tally?election=<id>` com sessão e `X-Urna-Panel`. O serviço exige `viewResults`, vínculo com a eleição e publicação. Retorna candidatos congelados na publicação, votos agregados, totais de participação, situação e `generatedAt`, sem matrícula ou nome de eleitor. PHP lê a fotografia em uma transação; D1 usa uma única leitura do estado. Não grava votos nem altera eleições.

O observador em `frontend/v2/tally-feed.ts` faz a primeira consulta imediatamente, depois a cada 300.000 ms. Usa o horário do servidor para antecipar a consulta à abertura/ao encerramento. Após resposta `closed`, não cria temporizador. Trocar eleição ou sair aborta a consulta e ignora respostas atrasadas. Falhas de rede preservam a última parcial, exibem erro e tentam novamente no próximo ciclo; perda de acesso remove os dados e interrompe as consultas. O carregamento geral de 20 segundos é suspenso nesta aba.

`npm run test:tally` testa o tempo com relógio virtual, sem esperar cinco minutos, e o filtro por dia da votação. `frontend/v2/tally-filter.ts` compara o período previsto no fuso `America/Sao_Paulo`, independente do dispositivo; eleições de vários dias aparecem em todos os dias abrangidos e um término à meia-noite não inclui o dia seguinte. O filtro afeta somente a seleção autenticada, sem alterar permissões ou o link público. `tests/tally-v2.py` e `preview/scripts/check-tally.mjs` validam a API real em banco descartável: votos novos, reenvio idempotente, empate, separação por eleição, proteção de dados, permissões, revogação, agendamento e encerramento.

## Fluxo atual de eleições

A home apresenta os passos para preparar a votação. A equipe usa uma permissão de organização completa e apenas turmas liberadas, sempre nas eleições que criou. Turmas, cadastro geral, acessos e histórico são exclusivos de administradores.

`tests/lifecycle-v2.py` e `preview/scripts/check-lifecycle.mjs` exercitam o fluxo completo com dados fictícios. Incluem acesso anônimo a `/api/v2/public-tally`, fotos em eleições agendadas/encerradas, tentativas de acesso a dados de outra pessoa, seleção individual e preservação de votos após exclusão. O observador público usa os mesmos temporizadores testados: consulta imediata, ciclos de cinco minutos e parada no encerramento.

A API `/api/v2/election-history` é exclusiva de administradores e inclui eleições com `deleted_at`. A exclusão é lógica e não apaga votos. As listas normais não incluem essas eleições. Para que a prévia hospedada permita visitantes anônimos na apuração, o endereço deve estar público na hospedagem; a gestão continua protegida pelo login da aplicação.

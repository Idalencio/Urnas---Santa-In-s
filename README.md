# Urna Santa Inês

Sistema de votação escolar do Colégio Santa Inês, com configuração por eleição,
controle de participação por matrícula e urnas com teclado ou escolha por imagens.

A versão destinada ao **CloudPanel usa PHP + MySQL/MariaDB**. A pasta `preview/`
reproduz o ambiente de testes em TypeScript, D1 e R2. Os bancos desses ambientes
são separados.

## Começar

- **Instalar no CloudPanel:** [guia de instalação](LEIA-ME-CLOUDPANEL.md).
- **Preparar eleições e turmas:** [guia do painel](LEIA-ME-V2-ALFA.md).
- **Entender tabelas, PKs, FKs e comunicação:** [banco de dados](docs/BANCO-DE-DADOS.md).
- **Desenvolver e testar:** [ambiente de desenvolvimento](docs/DESENVOLVIMENTO.md).
- **Atualizar o GitHub e a prévia:** [fluxo de manutenção](docs/MANUTENCAO.md).

## Organização

| Pasta                | Responsabilidade                                                          |
| -------------------- | ------------------------------------------------------------------------- |
| `frontend/v2/`       | Painel, turmas, permissões e interface das urnas V2                       |
| `frontend/app/`      | Componentes compartilhados e interface anterior                           |
| `server/`            | API PHP, autenticação, permissões e regras de votação                     |
| `database/`          | Migrações SQL ordenadas, com histórico preservado                         |
| `public/`            | Única raiz pública; interface compilada, imagens de exemplo e entrada PHP |
| `config/`            | Exemplos de configuração; os arquivos reais são privados                  |
| `storage/`           | Fotos enviadas e limites locais; os dados não são versionados             |
| `tests/`             | Testes de votação, acessos, alunos e histórico eleitoral                  |
| `bin/`               | Comandos de instalação e sincronização da interface                       |
| `deploy/`            | Trecho de configuração Nginx para o CloudPanel                            |
| `docs/`              | Arquitetura, banco, desenvolvimento e manutenção                          |
| `preview/`           | Fonte do adaptador hospedado de testes, com banco D1 separado             |
| `.github/workflows/` | Validação automática das alterações enviadas ao GitHub                    |

## Funcionamento

1. O administrador importa um CSV com nome, turma e matrícula ou cadastra alunos manualmente.
2. Cada eleição recebe suas regras, candidatos/vice e turmas participantes.
3. A publicação vincula a eleição às urnas. A mesma urna pode oferecer várias eleições.
4. A matrícula libera uma participação por eleição. O voto é gravado sem identificação do aluno.
5. Participação e voto são confirmados juntos; reenvios e confirmações simultâneas não duplicam o voto.

As chapas aceitam número completo, sem prefixo fixo, nome e foto de prefeito e vice.
O vice é opcional por eleição. Excluir aluno retira o cadastro ativo e preserva
as listas e os votos das eleições já configuradas.

## Comandos de desenvolvimento

Requer Node.js 22.13 ou superior. O servidor da escola executa PHP; Node é utilizado
para desenvolvimento e compilação.

```bash
npm ci
npm run check:v2
npm run check:legacy
npm run build:v2
npm run format:check
```

Para alterar a formatação: `npm run format`. Para sincronizar a interface da cópia
hospedada: `npm run sync:preview`. Os testes HTTP e o banco descartável estão
explicados em [DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md).

A interface já está compilada em `public/`, permitindo instalar a versão PHP sem
executar Node no CloudPanel. O painel atual fica em `/v2`; a versão anterior e seu
histórico continuam na raiz `/`.

## Credenciais e dados

O repositório contém somente modelos de configuração. Na instalação, execute
`php bin/console.php init-admin` para escolher a senha inicial. O arquivo criado
fica fora de `public/` e é ignorado pelo Git. O comando preserva uma configuração
existente. A senha do MySQL é configurada separadamente em `config/config.php`.

## Histórico e atualizações

As alterações feitas neste projeto devem ser validadas, registradas em commit e
enviadas ao repositório `Idalencio/Urnas---Santa-In-s`, preservando o histórico.
O fluxo está documentado em [MANUTENCAO.md](docs/MANUTENCAO.md) e `AGENTS.md`.
O envio ao GitHub não publica automaticamente no CloudPanel.

Desenvolvido pela T.I.

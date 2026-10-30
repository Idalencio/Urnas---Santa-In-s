# Arquitetura e pontos de manutenção

A interface é escrita em React/TypeScript e compilada para `public/assets`.
O PHP atende JSON pelo mesmo domínio e acessa MySQL/MariaDB através de PDO.
As imagens enviadas ficam em `storage/uploads`, referenciadas no banco.

## Serviço PHP

| Arquivo                                | Responsabilidade                                              |
| -------------------------------------- | ------------------------------------------------------------- |
| `server/bootstrap.php`                 | Configuração privada, PDO, transações, JSON, IDs e erros      |
| `server/auth.php`                      | Sessões, senhas, login e aplicação das migrações              |
| `server/access-v2.php`                 | Contas, escopos e autorização de cada ação                    |
| `server/roster-v2.php`                 | Alunos, renomeação de turmas, aliases e exclusão lógica       |
| `server/v2.php`                        | Eleições, candidatos, seleção de eleitores, publicação e voto |
| `server/images.php`                    | Validação, gravação e entrega autorizada de fotos             |
| `server/app.php`, `server/voting.php`  | Compatibilidade com a versão anterior                         |
| `server/index.php`, `public/index.php` | Rotas de entrada; manter as duas cópias alinhadas             |

## Interface V2

| Arquivo                      | Responsabilidade                                          |
| ---------------------------- | --------------------------------------------------------- |
| `app.tsx`                    | Orquestra o painel, as etapas e as chamadas à API         |
| `people.tsx`                 | Turmas, importação/cadastro individual, edição e exclusão |
| `access.tsx`                 | Gestão de contas e permissões                             |
| `management.tsx`             | Listas de eleições e urnas                                |
| `terminal.tsx`               | Escolha da eleição, matrícula e autorização temporária    |
| `ballot.tsx`                 | Tela de votação por teclado ou imagens                    |
| `domain.ts`                  | Tipos, estado da eleição e identificadores de confirmação |
| `workflow.tsx`, `styles.css` | Estrutura visual original e crédito da T.I.               |

## Regras que precisam ser preservadas

- A configuração é da eleição, com vínculo N:N com as urnas.
- Número de candidato é único dentro da eleição; não possui prefixo fixo.
- O vice está na mesma chapa e é opcional por eleição.
- A matrícula identifica o cadastro geral; `(election_id, matricula)` identifica o eleitor.
- Publicar fixa candidatos e eleitorado. Atualizar o cadastro geral não reescreve esse histórico.
- Participação e voto são gravados na mesma transação; o voto não recebe matrícula.
- O ID de confirmação evita contabilizar um reenvio da mesma solicitação.
- Excluir aluno utiliza `active=0`, preservando vínculos e participação.
- O PHP repete as validações e permissões, mesmo quando a interface esconde uma ação.

## Adaptador da prévia

`preview/lib/demo-api.ts` implementa o mesmo contrato em D1/R2. O estado fica em
JSON e utiliza revisão para controlar escritas simultâneas. A prévia é uma aplicação
separada da instalação PHP; seus dados não são sincronizados.

`frontend/` é a origem da interface compartilhada. O comando `npm run sync:preview`
replica essa interface e as imagens de exemplo para `preview/`. Regras novas que
afetem PHP e D1 precisam ser implementadas nos dois serviços.

O dicionário completo das tabelas e a comunicação estão em [BANCO-DE-DADOS.md](BANCO-DE-DADOS.md).

# Histórico de alterações

## 03/11/2026 — exclusão de rascunhos e painel mais limpo

- Exclusão de eleições em preparação, com confirmação na lista e no editor.
- Autorização por permissão de gerenciamento e acesso à eleição.
- Proteção de eleições publicadas, encerradas ou com registros de votação.
- Remoção atômica do rascunho e vínculos, preservando alunos e urnas compartilhadas.
- Menu claro, cabeçalho compacto, filtros discretos e menos elementos decorativos.
- 174 verificações do adaptador aprovadas, incluindo exclusão concorrente com publicação.
- Suite PHP de exclusão integrada ao runner e ao CI; execução PHP local indisponível
  neste ambiente. Revisão visual pendente: o navegador da prévia excedeu o tempo de resposta.

## 03/11/2026 — navegação e apresentação do painel

- Visão inicial mais compacta, com filtros por situação e contagens de eleições.
- Eleições abertas aparecem primeiro; rascunhos indicam o próximo passo.
- Atalhos para turmas e urnas, buscas sem distinção de acentos e opção de limpar a busca.
- Eleições de cada urna sempre visíveis, distinguindo abertas de agendadas.
- Busca administrativa por aluno ou matrícula em todas as turmas autorizadas.
- Listas de alunos paginadas em grupos de 25, com contagem e navegação.
- Etapas preenchidas sinalizadas e agendamento visível na publicação.
- Foco de teclado mais visível e link para saltar ao conteúdo.

Validação: tipos da interface atual e original, build PHP/V2, tipos do projeto hospedado,
157 verificações do adaptador de testes e formatação. A prévia gerenciada iniciou, mas o
navegador retornou conexão recusada; revisão visual no navegador não foi concluída.
As regras e tabelas de votação, as permissões e os dados existentes foram preservados.

## 30/10/2026 — organização inicial no GitHub

- Publicação da versão PHP/MySQL e do código do adaptador de testes.
- Formatação padronizada e comentários nas regras de votação, permissões e cadastro.
- Documentação de arquitetura, banco, desenvolvimento, instalação e manutenção.
- Exclusão de credenciais reais e arquivos locais do versionamento.
- Comando `init-admin` para criar a configuração privada de uma instalação nova.
- Testes HTTP portáveis com banco local descartável e workflow de validação no GitHub.
- Orientação permanente de registrar e enviar as próximas alterações em `AGENTS.md`.

Validação: tipos das interfaces, build V2, sintaxe PHP, 184 verificações HTTP PHP,
157 verificações no adaptador e validação da criação/preservação da credencial inicial.

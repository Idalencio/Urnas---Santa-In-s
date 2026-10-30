# Validação — 30/10/2026

- TypeScript e compilação da interface PHP e do ambiente hospedado aprovados.
- **184 verificações HTTP em PHP 8.3 + MariaDB 10.11**, banco local descartável:
  87 de votação/urna compartilhada, 35 de contas/permissões e 62 de cadastro manual e exclusão.
- **157 verificações no adaptador hospedado**: 53 de votação, 39 de acessos e 65 de cadastro manual e exclusão.

## Turmas e acessos

Importação única com várias turmas, agrupamento e contagem; reimportação atualiza a
mesma matrícula sem duplicar. As turmas selecionadas são salvas em cada eleição.
A equipe não recebe o cadastro geral nem contas de outras pessoas. Só administradores
importam a lista, criam contas e definem permissões. Acesso direto à API também é validado.

Verificados: eleição criada pela equipe, atribuição de eleição existente pelo administrador,
recusa de turma não autorizada, ausência de seleção implícita de todas as turmas para equipe,
publicação e resultados liberados separadamente, revogação imediata de permissões,
desativação de conta, redefinição de senha e bloqueio do painel legado para equipe.
Senhas e hashes não aparecem na resposta do painel. A conta principal não pode ser desativada.

No ambiente hospedado, sessões preservam a associação entre conta da aplicação e
identidade privada do visitante. Contas da equipe não recebem privilégios administrativos.
As sessões administrativas anteriores à nova migração permanecem compatíveis.

## Votação e preservação

Duas eleições simultâneas nas mesmas urnas; escolha pública da eleição e link direto;
um voto por matrícula/eleição; doze confirmações simultâneas geram um voto; liberação
não cruza eleições ou urnas; encerrar uma eleição mantém outras abertas.
Seis chapas de prefeito e vice, fotos em tamanhos distintos, números sem prefixo fixo,
CSV com matrículas preservadas. Publicação com campos ausentes não deixa vínculos parciais.
Migrações adicionais preservam o histórico e os vínculos anteriores.

## Interface

Navegador com dados fictícios isolados: cadastro geral organizado por turma, seleção
na etapa Eleitores, número de alunos, formulário de acessos com permissões e turmas,
conta limitada sem importação e sem menu Acessos, abas conforme permissões e rodapé
“Desenvolvido pela T.I.”. O painel reutiliza o cabeçalho azul, o menu e os estilos originais do projeto.
O layout da urna de votação foi preservado.

Não foi executada instalação no CloudPanel da escola. O pacote continua PHP/MySQL
com raiz `public` e inclui migrações até `005_class_names.sql`. O ambiente hospedado
serve para testar o comportamento, mantendo seus dados existentes.

## Acabamento visual

Atualização limitada à apresentação do painel. Mantém a identidade azul e amarela
do colégio, com destaque na página de eleições, cartões de urnas maiores, títulos
padronizados, novos espaçamentos e acabamento dos formulários, turmas e acessos.
O rodapé da TI continua visível. Compilação e TypeScript aprovados; conferência no
navegador com dados fictícios nas telas de eleições, urnas, turmas, acessos e criação
de eleição. Os serviços, as regras de votação e o banco não foram alterados nesta rodada.

## Cadastro manual e turmas

Verificados: aluno manual em turma existente e nova, agrupamento automático, edição do
nome, transferência de turma, correção da matrícula antes de vínculo, preservação de
zeros, recusa de duplicidade e de dados inválidos, matrícula protegida após vínculo,
renomeação simples/consecutiva e retorno ao nome anterior.

A renomeação conserva o acesso da equipe ao cadastro atual e às listas históricas.
CSV e cadastro manual reconhecem nomes anteriores. Colisão com turma existente não
funde os grupos nem deixa alterações parciais. Contas da equipe não podem modificar
o cadastro geral. As listas publicadas, a participação e os votos permanecem intactos.
Quem já votou continua bloqueado após edições e renomeações.

No navegador, com dados fictícios isolados: inclusão manual, criação da turma, edição
do aluno, renomeação, e opções de matrícula/dígitos já visíveis na primeira etapa.

## Exclusão de alunos

25 verificações novas em cada backend: restrição administrativa; validação de matrícula
e turma; recusa quando o aluno mudou de turma; retirada do cadastro ativo e da contagem;
preservação dos demais alunos; desaparecimento do grupo vazio; exclusão repetida recusada;
atualização explícita do rascunho; reinclusão manual e por CSV sem duplicação; matrícula
recadastrada continua protegida; eleitorados publicados, participação e resultados intactos.
Excluir e recadastrar não libera segundo voto na mesma eleição. A lista publicada continua
independente do cadastro geral, inclusive para eleitores que ainda não votaram.

No navegador com dados fictícios isolados: botão Excluir ao lado de Editar, confirmação
com nome/matrícula/turma, cancelamento sem alterações, exclusão e nova contagem, e retorno
à lista de turmas ao excluir o último aluno. Nenhum aluno real ou voto publicado foi alterado.

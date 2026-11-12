# Histórico de alterações

## 12/11/2026 — Home, importação segura e conferência para CloudPanel

- Home com crédito da T.I. no subtítulo, eleição em destaque por horário, participação e próximos passos objetivos.
- Indicadores abrem a lista no filtro correto; atalhos respeitam o acesso administrativo e da equipe.
- Importação une listas pela matrícula, mantém alunos ausentes e preserva dados completos diante de campos vazios e abreviações reconhecidas.
- Prévia e confirmação informam os dados preservados; novos cadastros incompletos cancelam o arquivo inteiro, sem gravação parcial.
- Diagnóstico do CloudPanel confere também os arquivos compilados V2; guia de instalação e atualização revisado.
- Dependências React/RSC atualizadas para 19.2.9, incluindo a correção de GHSA-xqc2-xf4c-x3h3 na prévia hospedada.

Validação: 355 verificações HTTP PHP/MySQL e 348 verificações D1 em bancos descartáveis, 35 verificações de temporizadores e exportação, migrações repetidas sem alterar votos, diagnóstico de instalação, tipos, builds e revisão visual da home e dos filtros. A revisão em largura de celular incluiu nomes longos, sem transbordamento horizontal. Os testes locais não substituem a conferência do Vhost, HTTPS e das credenciais reais no servidor da escola. Auditorias dos pacotes raiz, interface e prévia em 12/11/2026: zero alertas reportados. A correção RSC segue o [aviso oficial do React](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3).

## 11/11/2026 — Fluxo completo, apuração pública e arquivo de eleições

- Home com identidade do colégio, próximos passos e crédito da T.I.
- Seleção de turmas inteiras com marcação individual e desmarcação de alunos por eleição.
- Permissão unificada para organizar a própria eleição; turmas, alunos, acessos e histórico exclusivos de administradores.
- Edição de eleições agendadas, com fotografia atualizada e bloqueio a partir da abertura.
- Apuração pública por link aleatório, sem dados de eleitores, com consulta a cada cinco minutos e resultado final preservado.
- Exclusão lógica de eleições em preparação, agendadas e encerradas; arquivo administrativo inclui eleições excluídas e não excluídas.
- Migração SQL 008 e regras equivalentes no adaptador D1.

Validação: 341 verificações HTTP PHP/MySQL em banco descartável, 334 verificações do adaptador D1, 35 verificações de temporizadores/exportação, tipos das duas interfaces, sintaxe PHP e conferência visual da home, seleção individual, agendamento, acessos, histórico e apuração pública.

## 09/11/2026 — Painel de apuração

- Nova aba Apuração, com seleção de eleições publicadas, fotos de candidato e vice, ranking, votos, percentuais e participação.
- Consulta inicial imediata e atualização automática a cada cinco minutos. Busca também na abertura/encerramento por horário; resultados encerrados ficam sem temporizador.
- API agregada somente de leitura nos serviços PHP/MySQL e D1, protegida por sessão, permissão de resultados e acesso à eleição. Sem dados individuais de eleitores.
- Tratamento de empate, zero votos, votação sem matrícula, falha de conexão e troca rápida de eleição. Exportação CSV da fotografia exibida.
- Validação em bancos descartáveis, relógio virtual e revisão visual responsiva.

## 06/11/2026 — candidato e vice; importação comparada por matrícula

- Nomenclatura genérica no cadastro, nas fotos, nos exemplos e nos dois modelos de urna.
- Prévia CSV compara novos alunos, alterações de nome/turma, cadastros iguais e reativações.
- Confirmação repete a comparação na transação e informa o resultado real, sem duplicar matrícula.
- Matrículas repetidas no mesmo arquivo são recusadas antes da gravação; zeros são preservados.
- Cadastro geral e eleitorados publicados permanecem independentes.
- Testes cobrem arquivo repetido, prévia antiga e duas importações simultâneas.

Validação: 218 verificações HTTP PHP em MariaDB local descartável e 193 verificações
no adaptador D1, tipos das interfaces e do projeto hospedado, sintaxe PHP, builds e
formatação. Conferência de interface em navegador com arquivo e alunos fictícios.

## 05/11/2026 — identidade visual e acabamento do painel

- Cabeçalho no azul do colégio, logo preservada e destaque dourado na navegação.
- Títulos, botões, campos, estados e janelas padronizados em todas as áreas administrativas.
- Textos mais legíveis, campos com mais espaço e ações alinhadas na lista de eleições.
- Tela de entrada revisada e página própria para Minha conta.
- Acesso à conta pelo nome do usuário, saída sem duplicação e fechamento do menu por Escape.
- Rodapé do colégio com o crédito da T.I.; tela da urna pública preservada.

Validação: tipos das duas interfaces e do projeto hospedado, builds, formatação,
174 verificações do adaptador e revisão visual em navegador com dados fictícios.
Telas revisadas: eleições, configuração inicial, urnas, turmas, cadastro de aluno e entrada.
Revisão responsiva com viewports de 390 e 768 px, incluindo abertura e fechamento do menu.

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

## 2026-11-09 · Segurança administrativa

- Atualiza dependências da prévia e da interface, com auditoria automática no CI.
- Adiciona TOTP, códigos de recuperação de uso único, proteção das alterações de senha e revogação de sessões.
- Acrescenta histórico administrativo restrito, filtros e registros atômicos com as alterações.
- Inclui recuperação de MFA pelo console PHP e testes de segurança nos dois adaptadores.

## 2026-11-10 · Proteção de dados sem segundo fator

- Retira a verificação em duas etapas e suas credenciais ativas, preservando senhas e dados eleitorais.
- Mantém o histórico exclusivo de administradores, com testes de tentativa de acesso por equipe.
- Restringe fotos privadas por conta/eleição, inclusive ao associar imagens a candidatos.
- Reduz os dados retornados na liberação por matrícula e reforça uploads, JSON, limites de corpo e cabeçalhos.
- Neutraliza fórmulas em exportações CSV e documenta bloqueios adicionais de arquivos no Nginx.

## 2026-11-11 · Organização dos acessos

- Simplifica os textos e a apresentação das permissões, turmas e eleições adicionais.
- Explicita que importar listas e alterar alunos são tarefas exclusivas de administradores.
- Acrescenta cancelamento no formulário e melhora os rótulos da seleção de turmas.

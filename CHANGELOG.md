# Histórico de alterações

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

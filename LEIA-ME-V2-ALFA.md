# Urna Santa Inês — configuração por eleição

A aplicação mantém PHP/MySQL e a raiz pública `public`. O painel desta atualização
fica em `/v2`. A aplicação e os resultados anteriores continuam em `/`.

## 1. Importar a lista da escola

Como administrador, abra **Turmas → Importar lista da escola**. Use um único CSV
UTF-8 com todas as turmas, contendo `nome`, `turma` e `matricula`. O botão
**Baixar modelo** fornece o formato. Confira a prévia e confirme a importação.

O sistema agrupa os alunos por turma e mostra suas quantidades. Uma matrícula já
cadastrada atualiza o nome e a turma sem duplicar o aluno. Os alunos ausentes do novo
arquivo continuam no cadastro. A importação não altera o eleitorado de eleições publicadas.

Aceita vírgula ou ponto e vírgula, até 10.000 alunos / 1,5 MB por arquivo.
A matrícula é texto: `001234` e `1234` são diferentes. Mantenha a coluna como texto
no Excel. Ela também é o número do título eleitoral escolar.

## 2. Liberar os acessos da equipe

Abra **Acessos → Novo acesso**. Informe nome, usuário e senha de pelo menos dez
caracteres. O administrador escolhe as turmas disponíveis e o que a pessoa pode fazer:

- Criar e editar eleições, candidatos e fotos.
- Selecionar turmas, consultar eleitores, imprimir títulos e cancelar liberações.
- Publicar, agendar e encerrar eleições.
- Consultar e exportar resultados.

A pessoa da equipe acessa as eleições que criou. Em **Liberar eleições já existentes**,
o administrador pode selecionar outras eleições para essa conta. Os resultados exigem
permissão própria. Apenas administradores importam a lista geral e gerenciam contas.

É possível liberar turmas específicas ou todas as turmas, incluindo futuras importações.
As permissões são verificadas pelo servidor em cada solicitação. Desativar uma conta
bloqueia o login e suas sessões. Redefinir a senha invalida as sessões anteriores.
A conta principal `admin` permanece ativa. Não existe cadastro público de novas contas.

## 3. Preparar uma eleição

1. Em **Eleições**, clique em **Nova eleição**.
2. **Eleição:** nome, opção de vice e regras. A matrícula é exigida por padrão.
3. **Candidatos:** número, nome e foto do candidato e, quando houver, nome e foto do vice.
4. **Eleitores:** marque as turmas já cadastradas. **Continuar** salva os alunos dessa
   seleção na eleição. Uma lista existente é mantida até a seleção ser alterada.
5. **Publicar:** escolha **Com teclado**, **Por imagens** ou os dois modelos, informe
   o encerramento e clique em **Publicar agora**. **Agendar início** permite outro horário.
6. Se faltar um cadastro, a última etapa indica o problema e oferece **Corrigir**.
7. Após publicar, a gestão fica nas abas **Votação**, **Candidatos**, **Eleitores** e
   **Resultados**, conforme as permissões. **Encerrar** e **Duplicar** ficam em **Ações**.

A equipe pode preparar a eleição e deixar sua publicação para o administrador.
Depois da publicação, as configurações e a lista de eleitores ficam protegidas contra
edição. Para outra configuração, use **Ações → Duplicar eleição**.

## Mesma urna, várias eleições

Toda configuração pertence à eleição. As duas urnas são reutilizadas e podem oferecer
várias eleições abertas ao mesmo tempo. Publicar uma não ocupa nem substitui outra.

- Em **Urnas**, os dois modelos têm **Abrir urna**, **Testar** e **Copiar link**.
- Nos links gerais `/v2/urna/urna-padrao` e `/v2/urna/urna-infantil`, o aluno escolhe
  a eleição quando houver várias disponíveis e depois informa sua matrícula.
- O link de dentro da eleição abre diretamente essa eleição, usando `?election=ID`.
- Cada matrícula participa uma vez de cada eleição, inclusive no mesmo aparelho.
- A liberação e a contagem são independentes por eleição. Encerrar uma mantém as outras abertas.

## Candidatos e fotos

Aceita seis chapas ou mais, com números de até cinco dígitos, sem zero automático.
`1`, `12` e `345` podem coexistir. Um número pode ser usado em outra eleição.
A foto do prefeito aparece maior e a do vice menor, com sua identificação.
Na urna por imagens, complete as fotos de todos os candidatos e vices.

O teste da tela não registra votos nem consome matrículas. Para criar seis chapas
fictícias, abra **Eleições → Testar com uma eleição de exemplo**.

O painel utiliza o cabeçalho azul, o menu e a identidade visual originais do projeto.
O rodapé do painel e das telas de votação contém **Desenvolvido pela T.I.**

## Atualizar no CloudPanel

1. Preserve o backup do banco, `config/config.php`, `config/local-admin.php` e `storage/uploads`.
2. Copie o pacote para a pasta da aplicação, mantendo esses arquivos e imagens existentes.
3. Mantenha a raiz em `public`, PHP/MySQL e HTTPS.
4. Entre primeiro em `/v2` com a conta administrativa atual.
5. A rotina existente aplica as migrações pendentes. `003_shared_terminals.sql` adiciona
   os vínculos das urnas e `004_team_access.sql` adiciona contas, permissões e responsáveis
   por eleições. `005_class_names.sql` mantém o reconhecimento dos nomes de turmas renomeadas. As tabelas e os votos anteriores continuam preservados.
6. Atualize o navegador com Ctrl+F5.

Não é necessário Node.js no servidor. A interface já está compilada.
O pacote não contém `config/config.php`; preserve a conexão do servidor.
A conta principal e sua senha atual continuam válidas.

## Validação

Passaram 184 verificações HTTP em PHP 8.3/MariaDB 10.11 em banco descartável
(87 de votação, 35 de acessos e 62 de cadastro manual e exclusão), além de 157 no adaptador hospedado
(53 de votação, 39 de acessos e 65 de cadastro manual e exclusão). A interface foi conferida no navegador com
dados fictícios isolados. Não foi realizada instalação no CloudPanel da escola.

## Cadastrar e editar alunos sem lista

Em **Turmas → Adicionar aluno**, preencha nome, matrícula e turma. Escolha uma turma
existente ou digite uma nova: o grupo é formado automaticamente, assim como na importação
CSV. Administradores podem abrir uma turma, usar **Editar** ao lado de um aluno e
alterar nome ou transferi-lo para outra turma. **Renomear turma** altera o nome do grupo.

Uma matrícula duplicada é recusada. A matrícula pode ser corrigida enquanto não estiver
vinculada a uma eleição. Depois do vínculo, ela fica protegida; nome e turma do cadastro
geral continuam editáveis. As listas e os votos das eleições publicadas são preservados.

A renomeação mantém as permissões da equipe. Importações com o nome antigo continuam
reconhecendo a turma, sem criar um grupo duplicado. O histórico eleitoral conserva o
nome da turma que foi salvo na publicação.

Para incluir novos cadastros em um rascunho com turmas já selecionadas, abra **Eleitores →
Atualizar alunos das turmas**. A atualização é explícita e não modifica eleições publicadas.

Na primeira etapa de uma eleição, **Limite de dígitos do candidato** e **Exigir matrícula
para votar** aparecem diretamente no formulário, sem abrir um bloco de outras opções.

## Excluir aluno de uma turma

Como administrador, abra **Turmas → Ver alunos → Excluir**, ao lado de **Editar**.
A confirmação mostra nome, matrícula e turma. **Cancelar** mantém o cadastro.
A exclusão atualiza a lista e a quantidade de alunos; uma turma sem alunos deixa
de aparecer no cadastro. A equipe não possui permissão para excluir alunos.

O aluno sai do cadastro ativo da escola e não entra em novas seleções. As listas já
vinculadas a eleições, a participação e os votos são preservados. Nos rascunhos,
use **Eleitores → Atualizar alunos das turmas** para atualizar uma seleção existente.
Uma eleição publicada continua usando sua lista original.

Para reincluir, use **Adicionar aluno** ou importe a matrícula novamente. Isso não
apaga o histórico nem permite votar outra vez na mesma eleição. Não é necessária
nova migração: o cadastro utiliza o campo de situação já existente.

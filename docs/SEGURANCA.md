# Proteção dos dados da urna

## Atualização de 10 de novembro de 2026

O acesso usa **usuário e senha**. A pedido da escola, a verificação em duas etapas foi retirada da interface, dos fluxos de autenticação e da configuração ativa. O histórico continua disponível **somente para administradores**, com verificação no servidor. Permissões de equipe, inclusive apuração, não concedem acesso ao histórico.

Esta revisão mantém os bancos PHP/MySQL e D1 separados, a estrutura `public/`, o design Santa Inês, os cadastros, os eleitorados publicados e os votos. Nenhum voto recebe matrícula ou nome do eleitor.

## Acesso aos dados

- APIs administrativas exigem sessão válida, conta ativa e a chave adicional da aba. A autorização é reavaliada em cada consulta ou alteração.
- Contas de equipe recebem somente as eleições e turmas permitidas; não recebem o cadastro geral de estudantes ou a lista de contas.
- O endpoint `/api/v2/audit` é somente leitura e recusa contas de equipe, mesmo que conheçam o endereço ou tenham todas as outras permissões.
- Fotos de eleições em preparação são limitadas ao administrador, ao responsável pelo envio com permissão de edição ou às contas autorizadas na eleição. A regra também vale ao associar uma imagem a um candidato.
- Fotos presentes na lista de candidatos de uma eleição aberta continuam públicas para a urna funcionar. Ao encerrar a eleição, o acesso anônimo deixa de ser autorizado.
- A liberação por matrícula devolve apenas um token temporário e sua validade. Não devolve nome nem turma do estudante. A configuração pública da urna não inclui listas de alunos, contas ou credenciais.

Matrícula continua sendo um identificador, não um segredo forte. A revisão reduz a exposição de dados nessa consulta sem mudar a forma de votar solicitada pela escola.

## Requisições, arquivos e exportações

- Escritas exigem origem igual à do site e JSON válido. Métodos não previstos são recusados. Há limites para tamanho de requisições; na prévia, o fluxo é interrompido ao exceder o limite, mesmo sem `Content-Length`.
- Consultas MySQL/SQLite usam parâmetros preparados. O retorno de erros não inclui SQL, credenciais, rastreamento interno ou corpo de requisições.
- Uploads aceitam PNG, JPEG e WebP de até 2 MB, 6000 pixels por lado e 20 megapixels. O servidor verifica os bytes, o formato e as dimensões; a prévia também compara o tipo declarado e recusa arquivos incompletos. Isso não equivale a uma análise antivírus ou decodificação completa de todos os pixels.
- Fotos ficam fora da raiz pública no PHP ou em R2 protegido por API. São entregues com tipo de imagem, `nosniff` e `no-store`; nomes enviados pelo usuário não viram caminhos no servidor.
- Exportações CSV neutralizam células que poderiam virar fórmulas ao serem abertas no Excel, incluindo nomes e turmas importados.
- Respostas do painel e das APIs não são armazenadas em cache. Cabeçalhos restringem scripts, enquadramento da página, recursos do navegador e envio de referência. HTTPS recebe HSTS. A prévia preserva a integração de exibição do ChatGPT.
- O exemplo Nginx em `deploy/nginx-location.conf` acrescenta bloqueios para arquivos internos, repositório, mapas de código, bancos, logs e backups. Esses blocos precisam estar no Vhost real para proteger arquivos servidos diretamente pelo Nginx.

## Senhas, sessões e histórico

PHP armazena hash de senha pelo algoritmo padrão do PHP com pré-hash SHA-256 identificado por versão. A prévia mantém seu formato PBKDF2. Senhas, hashes e credenciais persistidas no banco não são retornados à interface nem registrados no histórico. Chaves temporárias de sessão e liberação são entregues somente ao fluxo que precisa delas. Cookies são HttpOnly, Secure em HTTPS e SameSite=Lax. Sessões têm validade de 12 horas; trocar senha ou desativar a conta revoga as anteriores. Tentativas de login são limitadas por IP e conta.

O histórico registra responsável, data, ação, alvo, eleição e totais de importação. Não registra escolhas de voto, senhas, tokens ou conteúdo bruto das listas. Alterações administrativas e seu evento são confirmados na mesma transação; falha ao registrar desfaz a alteração. Arquivos enviados antes de uma falha podem permanecer sem referência, sem confirmar associação a um candidato.

Eventos antigos continuam preservados, inclusive os da funcionalidade retirada. O histórico começou na atualização de 9 de novembro; ações anteriores não podem ser reconstruídas. Não há edição ou exclusão pela interface/API. Quem controla diretamente o banco ou o servidor pode alterá-lo; ele não é uma prova imutável contra esse acesso.

## Atualização de instalações existentes

A migração `database/007_data_protection.sql` cria o controle de propriedade das imagens, remove as credenciais do segundo fator e invalida sessões que o usavam, preservando senhas e dados eleitorais. As migrações anteriores permanecem no repositório para manter a sequência de instalação. Novos envios registram seu responsável; fotos antigas continuam disponíveis ao administrador ou pela eleição autorizada.

Na prévia, a primeira leitura do documento antigo remove a configuração de segundo fator por atualização com revisão, registra o evento e invalida as sessões afetadas. A operação é idempotente e não modifica estudantes, eleições ou votos. O segredo de ambiente usado exclusivamente pela funcionalidade retirada deixa de ser necessário.

No CloudPanel, atualize a aplicação completa, mantenha o document root em `public/`, execute `php bin/console.php install` e `php bin/console.php check`, e aplique as regras Nginx. O primeiro login também aplica migrações pendentes sob bloqueio. Um arquivo privado antigo `storage/security/mfa.key`, se existir, não é utilizado pela versão atual e permanece fora da raiz pública; sua remoção cabe à manutenção do servidor. **Publicar a prévia não atualiza o CloudPanel.**

## Validação e limites desta revisão

Os testes usam dados fictícios e bancos descartáveis. Cobrem login sem segundo fator, atualização de instalações antigas, revogação de sessões, histórico exclusivo de administrador, acesso indevido a fotos, conteúdo falso em uploads, redução de dados públicos, tentativas de SQL injection, origem externa, tamanho de requisição e rollback do histórico. Exportações têm testes específicos contra fórmulas. O CI executa essas verificações e auditorias de dependências.

```sh
npm ci
npm run check:v2
npm run check:legacy
npm run test:tally
npm run test:security
npm run test:http
```

Na prévia, após instalar suas dependências fixadas:

```sh
pnpm audit
node scripts/check-security.mjs
```

Os registros de alunos não são cifrados individualmente no banco. Proteção de discos, acesso SSH/MySQL, firewall, atualizações do sistema operacional e cópias de segurança dependem da infraestrutura. A configuração real do CloudPanel e a restauração de backups não foram auditadas nesta entrega. Auditoria de dependências identifica alertas conhecidos naquele momento; não garante ausência de vulnerabilidades. Esta revisão não é uma certificação de segurança nem de conformidade legal.

## Apuração pública e arquivo de eleições

O endereço `/v2/apuracao/<token>` dispensa login e permite somente leitura de resultados agregados. O token contém 256 bits aleatórios; não é possível listar todas as eleições pela API pública. Fotos de eleições agendadas ou encerradas são liberadas apenas quando pertencem à eleição do link. O painel, o cadastro de alunos e o histórico continuam autenticados e autorizados no servidor.

A equipe vê apenas eleições próprias. A permissão única de organizar inclui as etapas dependentes; não libera cadastro geral, importação, renomeação de turma, acessos ou histórico. A abertura é verificada sob a mesma trava da votação para bloquear alterações concorrentes.

A migração 008 faz exclusão lógica das eleições. O arquivo administrativo mantém eleitores, candidatos e votos para consulta por administradores. O link público de uma eleição publicada continua mostrando seu resultado final; excluir um agendamento o encerra, impedindo que abra depois pelo endereço antigo.

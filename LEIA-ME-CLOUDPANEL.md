# Instalação e atualização no CloudPanel

A aplicação da escola usa PHP/MySQL. O painel V2 fica em `/v2`, mantendo a versão
anterior em `/`. Este repositório não contém senhas iniciais ou conexões reais.

## Instalação nova

1. Crie um site PHP no CloudPanel e um banco exclusivo MySQL/MariaDB.
2. Envie o projeto, mantendo `server`, `config`, `database`, `bin` e `storage`
   fora da raiz pública. O domínio deve apontar somente para `public`.
3. Copie `config/config.example.php` para `config/config.php`. Configure o domínio
   HTTPS, host, porta, banco, usuário e senha MySQL.
4. Pelo terminal do servidor, dentro da pasta do projeto, execute:

   ```bash
   php bin/console.php init-admin
   ```

   Escolha e confirme uma senha de 10 a 128 caracteres. A entrada é oculta no
   terminal. O comando cria `config/local-admin.php` com um hash, preservando
   qualquer arquivo existente. O usuário inicial é `admin`.

5. Habilite `pdo_mysql`, `mbstring`, `openssl` e `fileinfo`. As pastas `storage`
   e `storage/uploads` devem permitir gravação pelo usuário PHP do site.
6. Configure as rotas conforme `deploy/nginx-location.conf` e abra o domínio em HTTPS.
7. Execute `php bin/console.php install` e `php bin/console.php check`. O diagnóstico
   confere extensões, conexão, armazenamento e os arquivos compilados das duas interfaces.
   O usuário MySQL precisa das permissões de instalação. O primeiro login também
   aplica migrações pendentes, sem substituir o banco existente.
8. Entre em `/v2` com `admin` e a senha definida. Use **Acessos** para criar contas
   da equipe e liberar a organização das próprias eleições e as turmas permitidas.

A interface já está compilada em `public`. Não é necessário instalar Node.js no
servidor. A senha do painel e a senha do banco são independentes.

## Atualizar uma instalação existente

1. Faça backup do banco, `config/config.php`, `config/local-admin.php` e `storage/uploads`.
2. Atualize os arquivos da aplicação a partir da versão validada no GitHub.
3. Preserve os arquivos privados e as imagens existentes. Não inicialize outro banco
   nem substitua a senha de uma instalação que já funciona.
4. Confirme que o domínio continua apontando para `public`. Execute
   `php bin/console.php install` e `php bin/console.php check`.
5. Somente as migrações ainda não aplicadas são executadas. Entre em `/v2`.
6. Atualize o navegador com Ctrl+F5.

O Git não inclui os arquivos privados. Não é necessário executar `init-admin`
em uma instalação que já possui `config/local-admin.php`.

## Conferência antes de liberar para a escola

- O domínio aponta para a pasta `public` do projeto completo; não mova o restante
  do projeto para dentro dela. A rota `/v2` deve abrir o painel, sem erro 404.
- HTTPS, conexão MySQL e gravação em `storage/uploads` estão funcionando.
- O Vhost usa `deploy/nginx-location.conf`, sem cache de páginas nas APIs e urnas.
- O comando `check` termina com configuração e armazenamento OK.
- Faça uma eleição de teste com alunos fictícios, candidato e vice; publique,
  vote uma vez, confirme o bloqueio de repetição e abra o link público da apuração.

A validação automatizada usa PHP 8.4 e MariaDB locais descartáveis. Ela cobre
instalação/migrações, rotas, permissões, voto único, apuração e importação concorrente.
Os dados da prévia hospedada são independentes do MySQL do CloudPanel e não são
copiados ao atualizar arquivos. A configuração do servidor da escola precisa ser
conferida no próprio servidor antes do uso real.

## Atualizar a lista de alunos

A importação une os cadastros pela matrícula; não apaga nem substitui o banco
inteiro. Alunos ausentes no arquivo permanecem no cadastro. Campos vazios de uma
matrícula conhecida reaproveitam os dados existentes; abreviações reconhecidas
mantêm o nome completo. Para um aluno novo, nome e turma são obrigatórios.
Uma turma preenchida no arquivo atualiza a turma, e nomes diferentes podem
corrigir o cadastro: confira a prévia antes de confirmar. Votos e eleitorados
publicados são preservados.

## Comandos de manutenção

| Comando                              | Finalidade                                                               |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `php bin/console.php init-config`    | Copiar o modelo de conexão, sem sobrescrever um arquivo existente        |
| `php bin/console.php init-admin`     | Criar a credencial inicial privada, sem sobrescrever a existente         |
| `php bin/console.php install`        | Preparar as migrações de banco                                           |
| `php bin/console.php check`          | Conferir extensões, conexão e armazenamento                              |
| `php bin/console.php cleanup`        | Limpar sessões e limites vencidos                                        |
| `php bin/console.php reset-password` | Restaurar a senha inicial desta instalação e encerrar sessões anteriores |

Execute recuperação de senha somente quando ela for necessária. A senha inicial
é a definida na instalação; a senha atual do painel pode ter sido alterada em **Conta**.

## Fluxo de uso

Importe os alunos ou cadastre individualmente em **Turmas**. Configure regras,
chapas e eleitorado dentro de cada eleição e publique nos modelos de urna desejados.
O [guia V2](LEIA-ME-V2-ALFA.md) descreve esse processo.

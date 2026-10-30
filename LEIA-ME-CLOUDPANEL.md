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
7. Entre em `/v2` com `admin` e a senha definida. O primeiro login prepara as
   tabelas e migrações pendentes. O usuário MySQL precisa das permissões de instalação.
8. Use **Acessos** para criar contas da equipe e liberar turmas, eleições e funções.

A interface já está compilada em `public`. Não é necessário instalar Node.js no
servidor. A senha do painel e a senha do banco são independentes.

## Atualizar uma instalação existente

1. Faça backup do banco, `config/config.php`, `config/local-admin.php` e `storage/uploads`.
2. Atualize os arquivos da aplicação a partir da versão validada no GitHub.
3. Preserve os arquivos privados e as imagens existentes. Não inicialize outro banco
   nem substitua a senha de uma instalação que já funciona.
4. Confirme que o domínio continua apontando para `public` e entre em `/v2`.
5. As migrações ainda não aplicadas serão executadas pela aplicação.
6. Atualize o navegador com Ctrl+F5.

O Git não inclui os arquivos privados. Não é necessário executar `init-admin`
em uma instalação que já possui `config/local-admin.php`.

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

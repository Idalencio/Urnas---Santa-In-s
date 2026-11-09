<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/auth.php';
use function Urna\{
    config,
    db,
    installSchema,
    localAdminConfig,
    one,
    provisionLocalAdmin,
    sql,
    now,
    transaction,
};
try {
    $action = $argv[1] ?? 'help';
    if ($action === 'init-config') {
        $path = __DIR__ . '/../config/config.php';
        if (is_file($path)) {
            throw new RuntimeException(
                'config.php já existe. Edite os dados do banco nesse arquivo.',
            );
        }
        if (!copy(__DIR__ . '/../config/config.example.php', $path)) {
            throw new RuntimeException('Não foi possível criar config.php.');
        }
        chmod($path, 0600);
        echo "config/config.php criado. Preencha o domínio HTTPS e os dados MySQL. Não é necessário gerar chave.\n";
        exit();
    }
    if ($action === 'init-admin') {
        require __DIR__ . '/init-admin.php';
        exit();
    }
    if ($action === 'install') {
        installSchema();
        echo "Tabelas prontas. Entre pelo site usando admin e a senha definida em init-admin.\n";
        exit();
    }
    if ($action === 'check') {
        foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo'] as $ext) {
            if (!extension_loaded($ext)) {
                throw new RuntimeException('Ative a extensão PHP: ' . $ext);
            }
        }
        config();
        db();
        localAdminConfig();
        if (
            !is_writable(__DIR__ . '/../storage') ||
            !is_writable(__DIR__ . '/../storage/uploads')
        ) {
            throw new RuntimeException(
                'Permita a gravação em storage e storage/uploads pelo usuário PHP do site.',
            );
        }
        if (!is_file(__DIR__ . '/../public/app.html')) {
            throw new RuntimeException('Interface compilada não encontrada.');
        }
        echo 'PHP ' .
            PHP_VERSION .
            '; MySQL ' .
            db()->getAttribute(PDO::ATTR_SERVER_VERSION) .
            "; configuração e armazenamento OK.\n";
        exit();
    }
    if ($action === 'reset-mfa') {
        installSchema();
        $username = trim($argv[2] ?? '');
        if ($username === '') {
            throw new RuntimeException('Informe o usuário: php bin/console.php reset-mfa usuario');
        }
        $target =
            $username === 'admin'
                ? one('SELECT id,name FROM administrators WHERE id=?', [\Urna\LOCAL_ADMIN_ID])
                : one(
                    'SELECT a.id,a.name FROM administrators a JOIN v2_accounts c ON c.admin_id=a.id WHERE c.username=?',
                    [$username],
                );
        if (!$target) {
            throw new RuntimeException('Conta não encontrada.');
        }
        echo 'Isso desativa o segundo fator e encerra todas as sessões de ' .
            $username .
            '. Digite REDEFINIR para confirmar: ';
        if (trim(fgets(STDIN) ?: '') !== 'REDEFINIR') {
            throw new RuntimeException('Operação cancelada.');
        }
        transaction(function () use ($target) {
            sql('DELETE FROM admin_mfa WHERE admin_id=?', [$target['id']]);
            sql('UPDATE admin_passwords SET version=version+1 WHERE admin_id=?', [$target['id']]);
            sql('DELETE FROM admin_sessions WHERE admin_id=?', [$target['id']]);
            \Urna\auditWrite(
                ['id' => 'console', 'name' => 'T.I. · console do servidor'],
                'mfaReset',
                'account',
                $target['id'],
            );
        });
        echo "Proteção em duas etapas redefinida. A senha foi preservada.\n";
        exit();
    }
    if ($action === 'reset-password') {
        provisionLocalAdmin();
        installSchema();
        transaction(function () {
            \Urna\auditWrite(
                ['id' => 'console', 'name' => 'T.I. · console do servidor'],
                'password',
                'account',
                \Urna\LOCAL_ADMIN_ID,
            );
            sql(
                'UPDATE admin_passwords SET hash=?,version=version+1,updated_at=? WHERE admin_id=?',
                [localAdminConfig()['password_hash'], now(), \Urna\LOCAL_ADMIN_ID],
            );
            sql('DELETE FROM admin_sessions WHERE admin_id=?', [\Urna\LOCAL_ADMIN_ID]);
        });
        echo "Senha restaurada para a senha inicial configurada neste servidor. Sessões anteriores encerradas.\n";
        exit();
    }
    if (in_array($action, ['owner', 'invite-owner'], true)) {
        throw new RuntimeException(
            'Esta versão já possui a conta admin. Use a senha definida na instalação. Não há convites.',
        );
    }
    if ($action === 'cleanup') {
        sql('DELETE FROM admin_sessions WHERE expires_at<=?', [now()]);
        foreach (glob(__DIR__ . '/../storage/login-limits/*.json') as $file) {
            $f = @fopen($file, 'r+');
            if (!$f) {
                continue;
            }
            if (flock($f, LOCK_EX | LOCK_NB)) {
                $v = json_decode(stream_get_contents($f) ?: '{}', true);
                if (is_array($v) && ($v['until'] ?? 0) <= time()) {
                    rewind($f);
                    ftruncate($f, 0);
                    fflush($f);
                }
                flock($f, LOCK_UN);
            }
            fclose($f);
        }
        echo "Sessões vencidas e limites expirados limpos.\n";
        exit();
    }
    echo "Comandos: init-config, init-admin, install, check, reset-password, reset-mfa usuario, cleanup. O primeiro login também prepara o sistema automaticamente.\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

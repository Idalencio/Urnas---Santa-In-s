<?php
declare(strict_types=1);
namespace Urna;

const LOCAL_ADMIN_ID = 'csi-admin-local';
const LOCAL_ADMIN_USERNAME = 'admin';

/** Protege a senha com o algoritmo padrão do PHP, mantendo identificação da versão. */
function hashPassword(mixed $password): string
{
    if (!is_string($password) || mb_strlen($password) < 10 || mb_strlen($password) > 128) {
        fail('Use uma senha com 10 a 128 caracteres.');
    }
    return 's1:' . password_hash(hash('sha256', $password), PASSWORD_DEFAULT);
}
function verifyPassword(mixed $password, string $hash): bool
{
    return is_string($password) &&
        mb_strlen($password) <= 128 &&
        str_starts_with($hash, 's1:') &&
        password_verify(hash('sha256', $password), substr($hash, 3));
}
function localAdminConfig(): array
{
    $c = require ROOT . '/config/local-admin.php';
    if (
        !is_array($c) ||
        !is_string($c['password_hash'] ?? null) ||
        !str_starts_with($c['password_hash'], 's1:')
    ) {
        fail('Arquivo da conta local inválido.', 503);
    }
    return $c;
}
// Também funciona antes de criar as tabelas. O arquivo fica fora de public/.
function throttle(string $scope, int $limit = 8, int $minutes = 15): void
{
    $dir = ROOT . '/storage/login-limits';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        fail('Permita a gravação em storage pelo usuário PHP do site.', 503);
    }
    $file = @fopen($dir . '/' . digest($scope) . '.json', 'c+');
    if (!$file || !flock($file, LOCK_EX)) {
        fail('Não foi possível verificar as tentativas de acesso.', 503);
    }
    try {
        $value = json_decode(stream_get_contents($file) ?: '{}', true);
        $attempts = is_array($value) ? (int) ($value['attempts'] ?? 0) : 0;
        $until = is_array($value) ? (int) ($value['until'] ?? 0) : 0;
        if ($until <= time()) {
            $attempts = 0;
            $until = time() + $minutes * 60;
        }
        $attempts++;
        rewind($file);
        ftruncate($file, 0);
        if (
            fwrite(
                $file,
                json_encode(['attempts' => $attempts, 'until' => $until], JSON_THROW_ON_ERROR),
            ) === false
        ) {
            fail('Não foi possível verificar as tentativas de acesso.', 503);
        }
        fflush($file);
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
    if ($attempts > $limit) {
        fail('Muitas tentativas. Aguarde alguns minutos e tente novamente.', 429);
    }
}
function resetThrottle(string $scope): void
{
    $file = @fopen(ROOT . '/storage/login-limits/' . digest($scope) . '.json', 'c+');
    if (!$file) {
        return;
    }
    if (flock($file, LOCK_EX)) {
        rewind($file);
        ftruncate($file, 0);
        fwrite($file, '{}');
        fflush($file);
        flock($file, LOCK_UN);
    }
    fclose($file);
}
function cookieName(): string
{
    return str_starts_with(origin(), 'https://') ? '__Host-urna_session' : 'urna_session_local';
}
function setSessionCookie(string $token, int $expires): void
{
    setcookie(cookieName(), $token, [
        'expires' => $expires,
        'path' => '/',
        'secure' => str_starts_with(origin(), 'https://'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
/** Valida cookie, validade, situação da conta e chave adicional da aba do painel. */
function requireAdmin(bool $panel = false): array
{
    $token = $_COOKIE[cookieName()] ?? '';
    if (!tokenValid($token)) {
        fail('Entre com seu usuário e senha.', 401);
    }
    v2Schema();
    // Sessões de qualquer conta da versão anterior deixam de ser aceitas.
    try {
        $me = one(
            'SELECT a.*,s.panel_hash AS panelHash FROM admin_sessions s JOIN administrators a ON a.id=s.admin_id JOIN admin_passwords p ON p.admin_id=a.id WHERE s.id=? AND s.expires_at>? AND s.version=p.version AND a.active=1 AND (a.id=? OR EXISTS (SELECT 1 FROM v2_accounts c WHERE c.admin_id=a.id))',
            [digest($token), now(), LOCAL_ADMIN_ID],
        );
    } catch (\PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1146) {
            fail('Entre com o usuário admin para preparar o painel.', 401);
        }
        throw $e;
    }
    if (!$me) {
        fail('Sua sessão expirou. Entre novamente.', 401);
    }
    if ($panel) {
        $key = $_SERVER['HTTP_X_URNA_PANEL'] ?? '';
        if (!tokenValid($key) || !hash_equals($me['panelHash'], digest($key))) {
            fail('Entre com sua senha para abrir o painel nesta aba.', 401);
        }
    }
    unset($me['panelHash']);
    return array_merge($me, v2Profile($me));
}
/** Cria sessão de 12 horas; o banco recebe hashes dos dois tokens aleatórios. */
function session(string $id): array
{
    $token = token();
    $key = token();
    $p = one('SELECT version FROM admin_passwords WHERE admin_id=?', [$id]);
    if (!$p) {
        fail('Conta local não configurada.', 503);
    }
    sql('DELETE FROM admin_sessions WHERE expires_at<=?', [now()]);
    sql(
        'INSERT INTO admin_sessions (id,admin_id,version,expires_at,panel_hash) VALUES (?,?,?,?,?)',
        [digest($token), $id, $p['version'], now(43200), digest($key)],
    );
    setSessionCookie($token, time() + 43200);
    return ['ok' => true, 'panelKey' => $key];
}
/** Executa as migrações uma vez sob bloqueio, inclusive no primeiro acesso local. */
function installSchema(): void
{
    foreach (['pdo_mysql', 'mbstring', 'openssl', 'fileinfo'] as $extension) {
        if (!extension_loaded($extension)) {
            fail('Ative a extensão PHP ' . $extension . ' no servidor.', 503);
        }
    }
    if (!is_writable(ROOT . '/storage') || !is_writable(ROOT . '/storage/uploads')) {
        fail('Permita a gravação em storage e storage/uploads pelo usuário PHP do site.', 503);
    }
    $lock = 'urna-install-' . substr(digest(config()['database']['name']), 0, 40);
    if ((int) (one('SELECT GET_LOCK(?,15) AS acquired', [$lock])['acquired'] ?? 0) !== 1) {
        fail('A instalação está em andamento. Tente novamente.', 503);
    }
    try {
        sql(
            'CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at VARCHAR(24) NOT NULL) ENGINE=InnoDB',
        );
        foreach (glob(ROOT . '/database/*.sql') as $file) {
            $version = basename($file);
            if (one('SELECT version FROM schema_migrations WHERE version=?', [$version])) {
                continue;
            }
            foreach (explode(';', file_get_contents($file)) as $statement) {
                if (trim($statement)) {
                    db()->exec($statement);
                }
            }
            sql('INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)', [
                $version,
                now(),
            ]);
        }
        sql(
            "INSERT IGNORE INTO terminals (id,name,location,model) VALUES ('urna-padrao','Urna padrão','Alunos maiores · teclado e toque','standard'),('urna-infantil','Urna infantil animada','Alunos pequenos · escolha por imagens','images')",
        );
    } finally {
        sql('SELECT RELEASE_LOCK(?)', [$lock]);
    }
}
function storedLocalPassword(): ?array
{
    try {
        return one('SELECT hash,version FROM admin_passwords WHERE admin_id=?', [LOCAL_ADMIN_ID]);
    } catch (\PDOException $e) {
        if (($e->errorInfo[1] ?? 0) === 1146) {
            return null;
        }
        throw $e;
    }
}
// Executado somente após conferir a senha inicial privada incluída no pacote.
function provisionLocalAdmin(): void
{
    $lock = 'urna-admin-' . substr(digest(config()['database']['name']), 0, 40);
    if ((int) (one('SELECT GET_LOCK(?,15) AS acquired', [$lock])['acquired'] ?? 0) !== 1) {
        fail('A conta está sendo preparada. Tente novamente.', 503);
    }
    try {
        if (storedLocalPassword()) {
            return;
        }
        installSchema();
        transaction(function () {
            $c = localAdminConfig();
            sql(
                "INSERT INTO administrators (id,name,email,role,active,owner) VALUES (?,?,?,'admin',1,1) ON DUPLICATE KEY UPDATE active=1,owner=1,role='admin'",
                [LOCAL_ADMIN_ID, $c['name'] ?? 'Administrador CSI', 'admin-local@urna.invalid'],
            );
            sql(
                'INSERT IGNORE INTO admin_passwords (admin_id,hash,version,updated_at) VALUES (?,?,1,?)',
                [LOCAL_ADMIN_ID, $c['password_hash'], now()],
            );
            sql('UPDATE administrators SET active=0,owner=0 WHERE id<>?', [LOCAL_ADMIN_ID]);
            sql('DELETE FROM admin_sessions WHERE admin_id<>?', [LOCAL_ADMIN_ID]);
            sql('UPDATE admin_invitations SET used=1 WHERE used=0');
        });
    } finally {
        sql('SELECT RELEASE_LOCK(?)', [$lock]);
    }
}
/** Login, logout e troca de senha. Todas as escritas exigem a origem configurada. */
function authEndpoint(): never
{
    method('POST');
    sameOrigin();
    $b = body();
    $action = $b['action'] ?? '';
    if ($action === 'login') {
        throttle('login-ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 12, 15);
        $username = strtolower(clean($b['username'] ?? '', 80));
        $initial = localAdminConfig();
        $p = storedLocalPassword();
        if ($p) {
            v2Schema();
            if ($username !== LOCAL_ADMIN_USERNAME) {
                $account = one(
                    'SELECT a.id,p.hash FROM administrators a JOIN v2_accounts c ON c.admin_id=a.id JOIN admin_passwords p ON p.admin_id=a.id WHERE c.username=? AND a.active=1',
                    [$username],
                );
                if (!$account || !verifyPassword($b['password'] ?? null, $account['hash'])) {
                    fail('Usuário ou senha incorretos.', 401);
                }
                reply(
                    transaction(function () use ($account, $b) {
                        $current = one(
                            'SELECT p.hash FROM admin_passwords p JOIN administrators a ON a.id=p.admin_id WHERE p.admin_id=? AND a.active=1 FOR UPDATE',
                            [$account['id']],
                        );
                        if (
                            !$current ||
                            !verifyPassword($b['password'] ?? null, $current['hash'])
                        ) {
                            fail('Usuário ou senha incorretos.', 401);
                        }
                        $result = session($account['id']);
                        resetThrottle('login-ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''));
                        return $result;
                    }),
                );
            }
        }
        $hash = $p['hash'] ?? $initial['password_hash'];
        $valid = verifyPassword($b['password'] ?? null, $hash);
        if ($username !== LOCAL_ADMIN_USERNAME || !$valid) {
            fail('Usuário ou senha incorretos.', 401);
        }
        if (!$p) {
            provisionLocalAdmin();
        }
        reply(
            transaction(function () use ($b) {
                $p = one('SELECT hash FROM admin_passwords WHERE admin_id=? FOR UPDATE', [
                    LOCAL_ADMIN_ID,
                ]);
                if (!$p || !verifyPassword($b['password'] ?? null, $p['hash'])) {
                    fail('Usuário ou senha incorretos.', 401);
                }
                $result = session(LOCAL_ADMIN_ID);
                resetThrottle('login-ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''));
                return $result;
            }),
        );
    }
    if ($action === 'logout') {
        $token = $_COOKIE[cookieName()] ?? '';
        if (tokenValid($token)) {
            sql('DELETE FROM admin_sessions WHERE id=?', [digest($token)]);
        }
        setSessionCookie('', time() - 3600);
        reply(['ok' => true]);
    }
    if ($action === 'password') {
        $me = requireAdmin(true);
        throttle('password-ip:' . ($_SERVER['REMOTE_ADDR'] ?? ''), 8, 15);
        $new = $b['newPassword'] ?? null;
        if ($new !== ($b['confirmPassword'] ?? null)) {
            fail('As novas senhas precisam ser iguais.');
        }
        $hash = hashPassword($new);
        reply(
            transaction(function () use ($b, $hash, $me) {
                $p = one('SELECT hash FROM admin_passwords WHERE admin_id=? FOR UPDATE', [
                    $me['id'],
                ]);
                if (!$p || !verifyPassword($b['currentPassword'] ?? null, $p['hash'])) {
                    fail('Sua senha atual está incorreta.', 401);
                }
                sql(
                    'UPDATE admin_passwords SET hash=?,version=version+1,updated_at=? WHERE admin_id=?',
                    [$hash, now(), $me['id']],
                );
                sql('DELETE FROM admin_sessions WHERE admin_id=?', [$me['id']]);
                return session($me['id']);
            }),
        );
    }
    if (in_array($action, ['inspect', 'activate', 'forgot'], true)) {
        fail('Esta versão usa somente a conta admin local. Entre com usuário e senha.', 410);
    }
    fail('Ação inválida.');
}

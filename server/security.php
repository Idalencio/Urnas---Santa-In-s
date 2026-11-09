<?php
declare(strict_types=1);
namespace Urna;

/** Logs administrativos nunca recebem o corpo bruto da requisição nem dados do voto. */
function auditWrite(
    array $me,
    string $action,
    string $type = 'account',
    string $id = '',
    string $eid = '',
    array $details = [],
): void {
    sql(
        'INSERT INTO admin_audit (id,occurred_at,actor_id,actor_name,action,target_type,target_id,election_id,details) VALUES (?,?,?,?,?,?,?,?,?)',
        [
            uuid(),
            now(),
            $me['id'],
            $me['name'] ?? $me['id'],
            $action,
            $type,
            $id,
            $eid,
            json_encode($details, JSON_THROW_ON_ERROR),
        ],
    );
}
function auditPrepare(array $me, string $action, array $b, array $v): void
{
    if (in_array($action, ['electors', 'csvPreview'], true)) {
        return;
    }
    $baseAction = str_starts_with($action, 'legacy.') ? substr($action, 7) : $action;
    $types = [
        'election' => 'election',
        'candidate' => 'candidate',
        'terminal' => 'terminal',
        'account' => 'account',
        'student' => 'student',
        'deleteStudent' => 'student',
        'renameClass' => 'class',
        'csvImport' => 'roster',
        'image' => 'image',
    ];
    $eid = clean(
        $b['electionId'] ?? ($v['electionId'] ?? ($action === 'election' ? $v['id'] ?? '' : '')),
        36,
    );
    $id = clean(
        $v['id'] ??
            ($v['originalMatricula'] ??
                ($v['matricula'] ?? ($b['matricula'] ?? ($b['from'] ?? $eid)))),
        160,
    );
    $GLOBALS['urna_audit'] = [$me, $action, $types[$baseAction] ?? 'election', $id, $eid];
}
function auditTarget(string $id): void
{
    if (isset($GLOBALS['urna_audit'])) {
        $GLOBALS['urna_audit'][3] = $id;
    }
}
/** Chamado antes do COMMIT: a alteração não é confirmada se o histórico falhar. */
function auditFlush(mixed $result): bool
{
    $ctx = $GLOBALS['urna_audit'] ?? null;
    if (!$ctx) {
        return false;
    }
    $details = [];
    if (is_array($result)) {
        if (isset($result['summary'])) {
            $details['summary'] = $result['summary'];
        }
        if (isset($result['count'])) {
            $details['count'] = (int) $result['count'];
        }
    }
    if (is_array($result) && isset($result['matricula'])) {
        $ctx[3] = $result['matricula'];
    }
    if (in_array($ctx[1], ['election', 'legacy.election'], true) && !$ctx[4]) {
        $ctx[4] = $ctx[3];
    }
    auditWrite(...[...$ctx, $details]);
    return true;
}
function auditEndpoint(): never
{
    method('GET');
    $me = requireAdmin(true);
    if ($me['role'] !== 'admin') {
        fail('Somente administradores podem consultar o histórico.', 403);
    }
    $where = [];
    $args = [];
    foreach (
        ['action' => 'action', 'actor' => 'actor_id', 'election' => 'election_id']
        as $key => $column
    ) {
        $value = clean($_GET[$key] ?? '', 160);
        if ($value !== '') {
            $where[] = "$column=?";
            $args[] = $value;
        }
    }
    foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
        $value = clean($_GET[$key] ?? '', 10);
        if ($value !== '') {
            if (
                !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value) ||
                !checkdate(
                    (int) substr($value, 5, 2),
                    (int) substr($value, 8, 2),
                    (int) substr($value, 0, 4),
                )
            ) {
                fail('Data inválida.');
            }
            $where[] = "occurred_at $op ?";
            $args[] = $value . ($key === 'from' ? 'T00:00:00.000Z' : 'T23:59:59.999Z');
        }
    }
    $offset = max(0, min(1000000, (int) ($_GET['offset'] ?? 0)));
    $clause = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $total = (int) one('SELECT COUNT(*) AS n FROM admin_audit' . $clause, $args)['n'];
    $rows = all(
        'SELECT id,occurred_at AS occurredAt,actor_id AS actorId,actor_name AS actorName,action,target_type AS targetType,target_id AS targetId,election_id AS electionId,details FROM admin_audit' .
            $clause .
            ' ORDER BY occurred_at DESC,id DESC LIMIT 50 OFFSET ' .
            $offset,
        $args,
    );
    foreach ($rows as &$row) {
        $row['details'] = json_decode($row['details'], true, 64, JSON_THROW_ON_ERROR);
    }
    reply(['rows' => $rows, 'total' => $total, 'offset' => $offset, 'limit' => 50]);
}
/** Chave AES privada, criada sob lock e mantida fora de public/ e do banco. */
function mfaKey(): string
{
    $dir = ROOT . '/storage/security';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        fail('Não foi possível preparar a proteção em duas etapas.', 503);
    }
    $file = @fopen($dir . '/mfa.key', 'c+b');
    if (!$file || !flock($file, LOCK_EX)) {
        fail('Não foi possível abrir a chave de segurança.', 503);
    }
    try {
        @chmod($dir . '/mfa.key', 0600);
        $key = stream_get_contents($file);
        if ($key === '') {
            $key = random_bytes(32);
            if (fwrite($file, $key) !== 32 || !fflush($file)) {
                fail('Não foi possível salvar a chave de segurança.', 503);
            }
        }
        if (strlen($key) !== 32) {
            fail('Chave de segurança inválida. Restaure o backup privado.', 503);
        }
        return $key;
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
}
function mfaEncrypt(string $secret): string
{
    $nonce = random_bytes(12);
    $tag = '';
    $encrypted = openssl_encrypt(
        $secret,
        'aes-256-gcm',
        mfaKey(),
        OPENSSL_RAW_DATA,
        $nonce,
        $tag,
        'urna-mfa-v1',
        16,
    );
    if ($encrypted === false) {
        fail('Não foi possível proteger o autenticador.', 503);
    }
    return 'v1:' . base64_encode($nonce . $tag . $encrypted);
}
function mfaDecrypt(string $value): string
{
    $raw = str_starts_with($value, 'v1:') ? base64_decode(substr($value, 3), true) : false;
    if ($raw === false || strlen($raw) < 29) {
        fail('Autenticador indisponível. Procure a T.I.', 503);
    }
    $secret = openssl_decrypt(
        substr($raw, 28),
        'aes-256-gcm',
        mfaKey(),
        OPENSSL_RAW_DATA,
        substr($raw, 0, 12),
        substr($raw, 12, 16),
        'urna-mfa-v1',
    );
    if ($secret === false) {
        fail('Autenticador indisponível. Procure a T.I.', 503);
    }
    return $secret;
}
function mfaBase32(string $bytes): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $buffer = 0;
    $bits = 0;
    $out = '';
    foreach (unpack('C*', $bytes) as $b) {
        $buffer = ($buffer << 8) | $b;
        $bits += 8;
        while ($bits >= 5) {
            $bits -= 5;
            $out .= $alphabet[($buffer >> $bits) & 31];
        }
        $buffer &= (1 << $bits) - 1;
    }
    if ($bits) {
        $out .= $alphabet[($buffer << (5 - $bits)) & 31];
    }
    return $out;
}
/** RFC 6238 / RFC 4226, SHA-1, 30 s, seis dígitos; validação independente nos testes. */
function mfaTotp(string $secret, int $step, int $digits = 6): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $buffer = 0;
    $bits = 0;
    $key = '';
    foreach (str_split($secret) as $c) {
        $n = strpos($alphabet, $c);
        if ($n === false) {
            fail('Autenticador inválido.', 503);
        }
        $buffer = ($buffer << 5) | $n;
        $bits += 5;
        if ($bits >= 8) {
            $bits -= 8;
            $key .= chr(($buffer >> $bits) & 255);
        }
        $buffer &= (1 << $bits) - 1;
    }
    $mac = hash_hmac('sha1', pack('N2', intdiv($step, 4294967296), $step % 4294967296), $key, true);
    $offset = ord($mac[19]) & 15;
    $number = unpack('N', substr($mac, $offset, 4))[1] & 0x7fffffff;
    return str_pad((string) ($number % 10 ** $digits), $digits, '0', STR_PAD_LEFT);
}
function mfaStep(string $secret, mixed $code, int $last = -1): int
{
    if (!is_string($code) || !preg_match('/^[0-9]{6}$/D', $code)) {
        fail('Código inválido. Confira o autenticador ou use um código de recuperação.', 401);
    }
    $step = intdiv(time(), 30);
    foreach ([$step, $step - 1, $step + 1] as $n) {
        if ($n > $last && hash_equals(mfaTotp($secret, $n), $code)) {
            return $n;
        }
    }
    fail('Código inválido ou já utilizado. Aguarde o próximo código.', 401);
}
function mfaRow(string $id, bool $lock = false): ?array
{
    return one('SELECT * FROM admin_mfa WHERE admin_id=?' . ($lock ? ' FOR UPDATE' : ''), [$id]);
}
function mfaCodes(): array
{
    $codes = [];
    for ($i = 0; $i < 10; $i++) {
        $codes[] = implode('-', str_split(bin2hex(random_bytes(16)), 8));
    }
    return $codes;
}
/** Consome exatamente uma prova sob lock da conta; códigos não podem ser reutilizados. */
function mfaConsume(string $id, mixed $code): void
{
    $r = mfaRow($id, true);
    if (!$r || !(int) $r['enabled']) {
        return;
    }
    $normalized = is_string($code) ? strtolower(str_replace('-', '', trim($code))) : '';
    $recovery = json_decode($r['recovery'], true, 64, JSON_THROW_ON_ERROR);
    if (preg_match('/^[a-f0-9]{32}$/D', $normalized)) {
        $index = array_search(digest($normalized), $recovery, true);
        if ($index === false) {
            fail('Código de recuperação inválido ou já utilizado.', 401);
        }
        array_splice($recovery, $index, 1);
        sql('UPDATE admin_mfa SET recovery=? WHERE admin_id=?', [
            json_encode($recovery, JSON_THROW_ON_ERROR),
            $id,
        ]);
    } else {
        $step = mfaStep(mfaDecrypt($r['secret']), $code, (int) $r['last_step']);
        sql('UPDATE admin_mfa SET last_step=? WHERE admin_id=?', [$step, $id]);
    }
}
function mfaLogin(string $id, array $b): array
{
    $r = mfaRow($id, true);
    if ($r && (int) $r['enabled']) {
        if (!isset($b['code']) || $b['code'] === '') {
            return ['ok' => true, 'mfaRequired' => true];
        }
        mfaConsume($id, $b['code']);
    }
    $me = one('SELECT id,name FROM administrators WHERE id=?', [$id]);
    auditWrite($me, 'login', 'account', $id);
    return session($id);
}
function mfaAuth(array $b): never
{
    $me = requireAdmin(true);
    $action = $b['action'];
    if ($action === 'mfaStatus') {
        $r = mfaRow($me['id']);
        reply([
            'enabled' => (bool) ($r['enabled'] ?? false),
            'remaining' => count(json_decode($r['recovery'] ?? '[]', true)),
        ]);
    }
    throttle('mfa-account:' . $me['id'], 8, 15);
    $result = transaction(function () use ($me, $b, $action) {
        $p = one('SELECT hash FROM admin_passwords WHERE admin_id=? FOR UPDATE', [$me['id']]);
        if (!$p || !verifyPassword($b['currentPassword'] ?? null, $p['hash'])) {
            fail('Sua senha atual está incorreta.', 401);
        }
        $r = mfaRow($me['id'], true);
        if ($action === 'mfaBegin') {
            if ((int) ($r['enabled'] ?? 0)) {
                fail('A proteção em duas etapas já está ativa.', 409);
            }
            $secret = mfaBase32(random_bytes(20));
            sql(
                'INSERT INTO admin_mfa (admin_id,pending,pending_until,pending_panel,recovery) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE pending=VALUES(pending),pending_until=VALUES(pending_until),pending_panel=VALUES(pending_panel)',
                [
                    $me['id'],
                    mfaEncrypt($secret),
                    time() + 600,
                    digest($_SERVER['HTTP_X_URNA_PANEL'] ?? ''),
                    '[]',
                ],
            );
            auditWrite($me, 'mfaBegin', 'account', $me['id']);
            return [
                'secret' => $secret,
                'uri' =>
                    'otpauth://totp/' .
                    rawurlencode('Santa Inês:' . $me['username']) .
                    '?secret=' .
                    $secret .
                    '&issuer=Santa%20In%C3%AAs&algorithm=SHA1&digits=6&period=30',
            ];
        }
        if ($action === 'mfaConfirm') {
            if (
                !$r ||
                (int) $r['enabled'] ||
                (int) $r['pending_until'] < time() ||
                !hash_equals($r['pending_panel'] ?? '', digest($_SERVER['HTTP_X_URNA_PANEL'] ?? ''))
            ) {
                fail('A configuração expirou. Inicie novamente.', 409);
            }
            $step = mfaStep(mfaDecrypt($r['pending']), $b['code'] ?? null);
            sql(
                'UPDATE admin_mfa SET enabled=1,secret=pending,pending=NULL,pending_until=0,pending_panel=NULL,last_step=? WHERE admin_id=?',
                [$step, $me['id']],
            );
        } elseif (in_array($action, ['mfaDisable', 'mfaRecovery'], true)) {
            if (!$r || !(int) $r['enabled']) {
                fail('Ative a proteção em duas etapas primeiro.', 409);
            }
            mfaConsume($me['id'], $b['code'] ?? null);
        } else {
            fail('Ação inválida.');
        }
        $codes = $action === 'mfaDisable' ? [] : mfaCodes();
        sql('UPDATE admin_mfa SET recovery=? WHERE admin_id=?', [
            json_encode(
                array_map(fn($c) => digest(str_replace('-', '', $c)), $codes),
                JSON_THROW_ON_ERROR,
            ),
            $me['id'],
        ]);
        if ($action === 'mfaDisable') {
            sql(
                'UPDATE admin_mfa SET enabled=0,secret=NULL,pending=NULL,last_step=-1,pending_until=0,pending_panel=NULL WHERE admin_id=?',
                [$me['id']],
            );
        }
        sql('UPDATE admin_passwords SET version=version+1 WHERE admin_id=?', [$me['id']]);
        sql('DELETE FROM admin_sessions WHERE admin_id=?', [$me['id']]);
        auditWrite($me, $action, 'account', $me['id']);
        return session($me['id']) + [
            'codes' => $codes,
            'enabled' => $action !== 'mfaDisable',
            'remaining' => count($codes),
        ];
    });
    reply($result);
}

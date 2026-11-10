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
/** A senha foi validada sob lock antes de registrar o acesso e emitir sessão. */
function passwordLogin(string $id): array
{
    $me = one('SELECT id,name FROM administrators WHERE id=?', [$id]);
    auditWrite($me, 'login', 'account', $id);
    return session($id);
}

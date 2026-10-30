<?php
declare(strict_types=1);
namespace Urna;

const V2_PERMISSIONS = ['manageElections', 'manageVoters', 'publishElections', 'viewResults'];
/** Traduz os escopos JSON e resolve nomes anteriores de turmas nas permissões. */
function v2Profile(array $a): array
{
    $p = one(
        'SELECT username,permissions,class_scope,election_ids FROM v2_accounts WHERE admin_id=?',
        [$a['id']],
    );
    $admin = $a['role'] === 'admin';
    return [
        'id' => $a['id'],
        'name' => $a['name'],
        'username' => $a['id'] === LOCAL_ADMIN_ID ? 'admin' : $p['username'] ?? '',
        'role' => $a['role'],
        'active' => (int) $a['active'],
        'owner' => (int) $a['owner'],
        'permissions' => $admin ? V2_PERMISSIONS : json_decode($p['permissions'] ?? '[]', true),
        'classes' => $admin
            ? null
            : (($scope = json_decode($p['class_scope'] ?? '[]', true)) === null
                ? null
                : array_values(
                    array_unique(array_map(__NAMESPACE__ . '\\v2CanonicalClass', $scope)),
                )),
        'electionIds' => $admin ? [] : json_decode($p['election_ids'] ?? '[]', true),
    ];
}
function v2Can(array $me, string $permission): bool
{
    return $me['role'] === 'admin' || in_array($permission, $me['permissions'] ?? [], true);
}
function v2Permission(array $me, string $permission): void
{
    if (!v2Can($me, $permission)) {
        fail('O administrador não liberou esta ação para sua conta.', 403);
    }
}
function v2ClassAllowed(array $me, string $class): bool
{
    return $me['role'] === 'admin' ||
        (array_key_exists('classes', $me) && $me['classes'] === null) ||
        in_array(
            v2CanonicalClass($class),
            array_map(__NAMESPACE__ . '\\v2CanonicalClass', $me['classes'] ?? []),
            true,
        );
}
function v2HasElection(array $me, string $id): bool
{
    return $me['role'] === 'admin' ||
        in_array($id, $me['electionIds'] ?? [], true) ||
        (bool) one(
            'SELECT election_id FROM v2_election_owners WHERE election_id=? AND admin_id=?',
            [$id, $me['id']],
        );
}
function v2ElectionAccess(array $me, string $id): void
{
    if (!v2HasElection($me, $id)) {
        fail('Esta eleição não foi liberada para sua conta.', 403);
    }
}
function v2ClassList(): array
{
    return all(
        'SELECT class_name AS name,COUNT(*) AS count FROM v2_students WHERE active=1 GROUP BY class_name ORDER BY class_name',
    );
}
function v2Accounts(): array
{
    return array_map(
        __NAMESPACE__ . '\\v2Profile',
        all(
            'SELECT * FROM administrators WHERE id=? OR id IN (SELECT admin_id FROM v2_accounts) ORDER BY name',
            [LOCAL_ADMIN_ID],
        ),
    );
}
/** Somente administradores gerenciam contas e atribuem permissões e eleições. */
function v2SaveAccount(array $me, array $v): string
{
    if ($me['role'] !== 'admin') {
        fail('Somente administradores podem gerenciar acessos.', 403);
    }
    $id = clean($v['id'] ?? '') ?: uuid();
    $name = clean($v['name'] ?? '');
    $username = strtolower(clean($v['username'] ?? '', 81));
    $role = $v['role'] ?? 'staff';
    $permissions = $v['permissions'] ?? [];
    $classes = array_key_exists('classes', $v) ? $v['classes'] : [];
    $ids = $v['electionIds'] ?? [];
    if (
        !$name ||
        !preg_match('/^[a-z0-9][a-z0-9._-]{2,79}$/D', $username) ||
        !in_array($role, ['admin', 'staff'], true)
    ) {
        fail('Informe nome e usuário de 3 a 80 caracteres, sem espaços ou acentos.');
    }
    if (!is_array($permissions) || array_diff($permissions, V2_PERMISSIONS)) {
        fail('Permissões inválidas.');
    }
    if (
        $classes !== null &&
        (!is_array($classes) ||
            count($classes) > 500 ||
            array_filter($classes, fn($c) => !is_string($c) || !clean($c, 80)))
    ) {
        fail('Selecione as turmas permitidas.');
    }
    if (!is_array($ids) || count($ids) > 1000 || array_filter($ids, fn($x) => !is_string($x))) {
        fail('Selecione as eleições permitidas.');
    }
    foreach ($ids as $eid) {
        v2Election($eid);
    }
    $active = !empty($v['active']) ? 1 : 0;
    if ($id === LOCAL_ADMIN_ID || $id === $me['id']) {
        if ($role !== 'admin' || !$active) {
            fail('Você não pode desativar ou retirar o acesso administrativo desta conta.');
        }
    }
    if ($username === 'admin' && $id !== LOCAL_ADMIN_ID) {
        fail('Este usuário já existe.');
    }
    if ($id === LOCAL_ADMIN_ID && $username !== 'admin') {
        fail('O usuário principal permanece admin.');
    }
    if (
        one('SELECT admin_id FROM v2_accounts WHERE username=? AND admin_id<>?', [$username, $id])
    ) {
        fail('Este usuário já existe.');
    }
    $existing = one('SELECT id FROM administrators WHERE id=?', [$id]);
    if (!empty($v['id']) && !$existing) {
        fail('Conta não encontrada.', 404);
    }
    $password = $v['password'] ?? '';
    $hash = $password !== '' ? hashPassword($password) : null;
    if (!$existing && !$hash) {
        fail('Defina uma senha com pelo menos 10 caracteres.');
    }
    return transaction(function () use (
        $v,
        $id,
        $name,
        $username,
        $role,
        $permissions,
        $classes,
        $ids,
        $active,
        $existing,
        $hash,
    ) {
        if ($existing) {
            sql('UPDATE administrators SET name=?,role=?,active=? WHERE id=?', [
                $name,
                $role,
                $active,
                $id,
            ]);
        } else {
            sql(
                'INSERT INTO administrators (id,name,email,role,active,owner) VALUES (?,?,?,?,?,0)',
                [$id, $name, $username . '@urna.invalid', $role, $active],
            );
        }
        sql(
            'INSERT INTO v2_accounts (admin_id,username,permissions,class_scope,election_ids) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE username=VALUES(username),permissions=VALUES(permissions),class_scope=VALUES(class_scope),election_ids=VALUES(election_ids)',
            [
                $id,
                $username,
                json_encode(array_values(array_unique($permissions))),
                json_encode($classes === null ? null : array_values(array_unique($classes))),
                json_encode(array_values(array_unique($ids))),
            ],
        );
        if ($hash) {
            sql(
                'INSERT INTO admin_passwords (admin_id,hash,version,updated_at) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE hash=VALUES(hash),version=version+1,updated_at=VALUES(updated_at)',
                [$id, $hash, now()],
            );
        }
        // Revoked permissions are checked on every request. Reset passwords and
        // deactivation also invalidate all previously issued sessions.
        if ($hash || !$active) {
            sql('DELETE FROM admin_sessions WHERE admin_id=?', [$id]);
        }
        return $id;
    });
}
/** Ponto central de autorização da API; esconder botões não concede nem remove acesso. */
function v2CheckAction(array $me, string $action, array $b, array $v): void
{
    if (
        in_array(
            $action,
            [
                'account',
                'csvImport',
                'csvPreview',
                'terminal',
                'student',
                'renameClass',
                'deleteStudent',
            ],
            true,
        )
    ) {
        if ($me['role'] !== 'admin') {
            fail('Somente administradores podem fazer esta ação.', 403);
        }
        return;
    }
    $permission = match ($action) {
        'election', 'candidate', 'duplicate', 'image' => 'manageElections',
        'enroll', 'electors', 'unlock' => 'manageVoters',
        'publish', 'close' => 'publishElections',
        default => '',
    };
    if (!$permission) {
        fail('Ação desconhecida.');
    }
    v2Permission($me, $permission);
    $eid = clean(
        $action === 'election'
            ? $v['id'] ?? ''
            : ($action === 'candidate'
                ? $v['electionId'] ?? ''
                : $b['electionId'] ?? ''),
    );
    if ($eid) {
        v2ElectionAccess($me, $eid);
    }
    if ($action === 'publish' && $me['role'] !== 'admin') {
        foreach (
            all('SELECT DISTINCT class_name FROM v2_electors WHERE election_id=?', [$eid])
            as $r
        ) {
            if (!v2ClassAllowed($me, $r['class_name'])) {
                fail(
                    'Há turmas fora do seu acesso. Peça ao administrador para publicar esta eleição.',
                    403,
                );
            }
        }
    }
}

<?php
declare(strict_types=1);
namespace Urna;

function state(array $me): array
{
    $candidates = all(
        'SELECT id,terminal_id AS terminalId,name,code,image,active FROM candidates ORDER BY name',
    );
    $terminals = all('SELECT id,name,location,model FROM terminals ORDER BY name');
    $elections = array_map(
        __NAMESPACE__ . '\\electionRow',
        all(
            'SELECT id,name,terminal_id AS terminalId,starts_at AS startsAt,ends_at AS endsAt,closed,archived,candidate_snapshot AS candidateSnapshot,digits FROM elections ORDER BY starts_at DESC',
        ),
    );
    $results = all(
        'SELECT election_id,candidate_id AS candidateId,kind,COUNT(*) AS total FROM ballots GROUP BY election_id,candidate_id,kind',
    );
    foreach ($elections as &$e) {
        foreach ($results as $r) {
            if ($r['election_id'] === $e['id']) {
                unset($r['election_id']);
                $e['results'][] = $r;
            }
        }
    }
    unset($e);
    $administrators = [];
    return compact('candidates', 'terminals', 'elections', 'administrators') + [
        'me' => array_intersect_key(
            $me,
            array_flip(['id', 'name', 'email', 'username', 'role', 'active', 'owner']),
        ),
        'mail' => null,
        'ownerChange' => null,
    ];
}
function saveCandidate(array $v): void
{
    $name = clean($v['name'] ?? '');
    $raw = clean((string) ($v['code'] ?? ''), 5);
    $tid = clean($v['terminalId'] ?? '');
    $image = clean($v['image'] ?? '', 250);
    $cid = clean($v['id'] ?? '') ?: uuid();
    if (!$name || !preg_match('/^0?[0-9]$/D', $raw)) {
        fail('Informe o nome e um número de 0 a 9.');
    }
    $code = str_pad($raw, 2, '0', STR_PAD_LEFT);
    if (
        $image &&
        !preg_match('#^/(characters/(lion|owl|fox)\.svg|api/images/[a-zA-Z0-9-]+)$#D', $image)
    ) {
        fail('Imagem inválida.');
    }
    if (
        str_starts_with($image, '/api/images/') &&
        !is_file(ROOT . '/storage/uploads/' . basename($image))
    ) {
        fail('Envie novamente a imagem do candidato.');
    }
    transaction(function () use ($v, $name, $code, $tid, $image, $cid) {
        if (!one('SELECT id FROM terminals WHERE id=? FOR UPDATE', [$tid])) {
            fail('Escolha a urna deste candidato.');
        }
        $existing = one('SELECT terminal_id FROM candidates WHERE id=? FOR UPDATE', [$cid]);
        if (!empty($existing['terminal_id']) && $existing['terminal_id'] !== $tid) {
            fail('Para outra urna, cadastre um novo candidato.');
        }
        if (
            one('SELECT id FROM candidates WHERE terminal_id=? AND code=? AND id<>?', [
                $tid,
                $code,
                $cid,
            ])
        ) {
            fail('Esse número já está em uso nesta urna. Escolha outro.');
        }
        if ($existing) {
            sql('UPDATE candidates SET terminal_id=?,name=?,code=?,image=?,active=? WHERE id=?', [
                $tid,
                $name,
                $code,
                $image,
                empty($v['active']) ? 0 : 1,
                $cid,
            ]);
        } else {
            sql(
                'INSERT INTO candidates (id,terminal_id,name,code,image,active) VALUES (?,?,?,?,?,?)',
                [$cid, $tid, $name, $code, $image, empty($v['active']) ? 0 : 1],
            );
        }
    });
}
function saveTerminal(array $v): void
{
    $name = clean($v['name'] ?? '');
    $model = $v['model'] ?? '';
    $tid = clean($v['id'] ?? '') ?: uuid();
    if (!$name || !in_array($model, ['standard', 'images'], true)) {
        fail('Informe um nome e escolha o modelo da urna.');
    }
    transaction(function () use ($v, $tid, $name, $model) {
        $existing = one('SELECT id FROM terminals WHERE id=? FOR UPDATE', [$tid]);
        if ($existing) {
            $rows = all(
                'SELECT closed,starts_at AS startsAt,ends_at AS endsAt,candidate_snapshot AS candidateSnapshot FROM elections WHERE terminal_id=?',
                [$tid],
            );
            foreach ($rows as $r) {
                if (status($r) === 'active') {
                    fail('Encerre a eleição em andamento antes de editar esta urna.');
                }
                if ($model === 'images' && status($r) === 'scheduled') {
                    foreach (json_decode($r['candidateSnapshot'], true) as $c) {
                        if (!$c['image']) {
                            fail('Há uma eleição agendada com candidatos sem imagem.');
                        }
                    }
                }
            }
        }
        sql(
            'INSERT INTO terminals (id,name,location,model) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),location=VALUES(location),model=VALUES(model)',
            [$tid, $name, clean($v['location'] ?? ''), $model],
        );
    });
}
function appEndpoint(): never
{
    $method = method('GET', 'POST');
    if ($method === 'POST') {
        sameOrigin();
    }
    $me = requireAdmin(true);
    if ($me['role'] !== 'admin') {
        fail('Use o painel /v2 para acessar suas eleições.', 403);
    }
    if ($method === 'GET') {
        reply(state($me));
    }
    $b = body(2850000);
    $action = clean($b['action'] ?? '');
    $v = is_array($b['value'] ?? null) ? $b['value'] : [];
    if ($action !== 'vote' && $me['role'] !== 'admin') {
        fail('Esta ação exige um administrador.', 403);
    }
    switch ($action) {
        case 'mail':
        case 'invite':
        case 'owner':
        case 'admin':
            fail('Esta versão permite somente a conta admin local.', 403);
        case 'image':
            reply(['image' => storeImageData($b['imageData'] ?? null)]);
        case 'candidate':
            saveCandidate($v);
            break;
        case 'terminal':
            saveTerminal($v);
            break;
        case 'election':
            saveElection($v);
            break;
        case 'close':
            $id = clean($b['id'] ?? '');
            transaction(function () use ($id) {
                if (!one('SELECT id FROM elections WHERE id=? FOR UPDATE', [$id])) {
                    fail('Votação não encontrada.');
                }
                sql('UPDATE elections SET closed=1 WHERE id=?', [$id]);
            });
            break;
        case 'archive':
            $id = clean($b['id'] ?? '');
            transaction(function () use ($id) {
                $e = one(
                    'SELECT id,closed,starts_at AS startsAt,ends_at AS endsAt FROM elections WHERE id=? FOR UPDATE',
                    [$id],
                );
                if (!$e) {
                    fail('Votação não encontrada.');
                }
                if (status($e) !== 'closed') {
                    fail('Só é possível remover da aba Urnas uma votação encerrada.');
                }
                sql('UPDATE elections SET archived=1 WHERE id=?', [$id]);
            });
            break;
        case 'toggle':
            $entity = $b['entity'] ?? '';
            $id = clean($b['id'] ?? '');
            if ($entity !== 'candidates') {
                fail('Esta versão permite somente a conta admin local.', 403);
            }
            transaction(function () use ($id) {
                if (!one('SELECT id FROM candidates WHERE id=? FOR UPDATE', [$id])) {
                    fail('Cadastro não encontrado.');
                }
                sql('UPDATE candidates SET active=1-active WHERE id=?', [$id]);
            });
            break;
        case 'vote':
            reply(recordVote($b));
        default:
            fail('Ação desconhecida.');
    }
    reply(['ok' => true]);
}

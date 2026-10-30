<?php
declare(strict_types=1);
namespace Urna;

function status(array $e): string
{
    return $e['closed'] || now() >= $e['endsAt']
        ? 'closed'
        : (now() < $e['startsAt']
            ? 'scheduled'
            : 'active');
}
function electionRow(array $r): array
{
    $r['candidateSnapshot'] = json_decode($r['candidateSnapshot'], true, 64, JSON_THROW_ON_ERROR);
    $r['results'] = [];
    return $r;
}
function terminal(string $id): array
{
    if (!preg_match('/^[a-zA-Z0-9-]{1,160}$/D', $id)) {
        fail('Urna não encontrada.', 404);
    }
    $r = one('SELECT id,name,location,model FROM terminals WHERE id=?', [$id]);
    if (!$r) {
        fail('Urna não encontrada.', 404);
    }
    return $r;
}
function voteChoice(array $e, mixed $code, bool $blank = false): array
{
    if ($blank) {
        fail('Número inválido.');
    }
    $code = clean($code, 5);
    if (strlen($code) !== $e['digits']) {
        fail('Digite o último dígito.');
    }
    foreach ($e['candidateSnapshot'] as $c) {
        if ($c['code'] === $code) {
            return ['kind' => 'valid', 'candidateId' => $c['id']];
        }
    }
    fail('Número inválido.');
}
function recordVote(array $b, ?string $terminalId = null): array
{
    $id = clean($b['requestId'] ?? '', 36);
    if (
        !preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di',
            $id,
        )
    ) {
        fail('Identificador de confirmação inválido.');
    }
    return transaction(function () use ($b, $id, $terminalId) {
        // A mesma trava é usada ao encerrar; o voto não entra depois do encerramento.
        $raw = one(
            'SELECT id,terminal_id AS terminalId,closed,starts_at AS startsAt,ends_at AS endsAt,digits,candidate_snapshot AS candidateSnapshot FROM elections WHERE id=? FOR UPDATE',
            [clean($b['electionId'] ?? '')],
        );
        if (!$raw) {
            fail('Eleição não encontrada.');
        }
        if ($terminalId !== null && $raw['terminalId'] !== $terminalId) {
            fail('Esta votação não pertence à urna.');
        }
        $e = electionRow($raw);
        $choice = voteChoice($e, $b['code'] ?? '', ($b['blank'] ?? false) === true);
        $existing = one('SELECT election_id,candidate_id,kind FROM ballots WHERE id=?', [$id]);
        if ($existing) {
            if (
                $existing['election_id'] === $e['id'] &&
                $existing['candidate_id'] === $choice['candidateId'] &&
                $existing['kind'] === $choice['kind']
            ) {
                return ['ok' => true, 'duplicate' => true];
            }
            fail('Esta confirmação já foi usada.', 409);
        }
        if (status($e) !== 'active') {
            fail('A eleição não está aberta.');
        }
        try {
            sql('INSERT INTO ballots (id,election_id,candidate_id,kind) VALUES (?,?,?,?)', [
                $id,
                $e['id'],
                $choice['candidateId'],
                'valid',
            ]);
        } catch (\PDOException $error) {
            if (($error->errorInfo[1] ?? 0) === 1062) {
                fail('Esta confirmação já foi usada.', 409);
            }
            throw $error;
        }
        return ['ok' => true];
    });
}
function terminalEndpoint(string $id): never
{
    $method = method('GET', 'POST');
    $t = terminal($id);
    if ($method === 'POST') {
        sameOrigin();
        reply(recordVote(body(), $t['id']));
    }
    $row = one(
        'SELECT id,name,terminal_id AS terminalId,starts_at AS startsAt,ends_at AS endsAt,closed,digits,candidate_snapshot AS candidateSnapshot FROM elections WHERE terminal_id=? AND closed=0 AND ends_at>? ORDER BY starts_at LIMIT 1',
        [$id, now()],
    );
    reply(['terminal' => $t, 'election' => $row ? electionRow($row) : null]);
}
function parseDate(mixed $value): string
{
    if (
        !is_string($value) ||
        !preg_match(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/D',
            $value,
        )
    ) {
        fail('Informe um período válido.');
    }
    try {
        $date = new \DateTimeImmutable($value);
        $warnings = \DateTimeImmutable::getLastErrors();
        if ($warnings && ($warnings['warning_count'] || $warnings['error_count'])) {
            fail('Informe um período válido.');
        }
        return $date->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
    } catch (\Exception) {
        fail('Informe um período válido.');
    }
}
function saveElection(array $v): void
{
    $name = clean($v['name'] ?? '');
    if (!$name) {
        fail('Informe o nome da eleição.');
    }
    $tid = clean($v['terminalId'] ?? '');
    $starts = parseDate($v['startsAt'] ?? null);
    $ends = parseDate($v['endsAt'] ?? null);
    if ($ends <= $starts) {
        fail('O encerramento precisa ser depois do início.');
    }
    $ids = $v['candidateIds'] ?? [];
    if (
        !is_array($ids) ||
        count($ids) > 10 ||
        !$ids ||
        array_filter($ids, fn($id) => !is_string($id))
    ) {
        fail('Selecione pelo menos um candidato válido.');
    }
    $ids = array_values(array_unique($ids));
    transaction(function () use ($tid, $name, $starts, $ends, $ids) {
        // Serializa a criação/edição de eleições e candidatos dentro da mesma urna.
        $t = one('SELECT * FROM terminals WHERE id=? FOR UPDATE', [$tid]);
        if (!$t) {
            fail('Selecione uma urna.');
        }
        $snapshot = [];
        foreach ($ids as $id) {
            $c = one(
                'SELECT id,terminal_id AS terminalId,name,code,image,active FROM candidates WHERE id=?',
                [$id],
            );
            if (!$c) {
                fail('Candidato inexistente.');
            }
            if (!$c['active'] || $c['terminalId'] !== $tid) {
                fail('Selecione apenas candidatos cadastrados nesta urna.');
            }
            if (!preg_match('/^0[0-9]$/D', $c['code'])) {
                fail('Os números dos candidatos devem ir de 00 a 09.');
            }
            if ($t['model'] === 'images' && !$c['image']) {
                fail('Na urna com imagens, todos os candidatos precisam de uma imagem.');
            }
            $snapshot[] = $c;
        }
        if (
            one(
                'SELECT id FROM elections WHERE terminal_id=? AND closed=0 AND starts_at<? AND ends_at>? LIMIT 1',
                [$tid, $ends, $starts],
            )
        ) {
            fail('Já há uma eleição nessa urna durante o período escolhido.');
        }
        sql(
            'INSERT INTO elections (id,name,terminal_id,starts_at,ends_at,closed,archived,candidate_snapshot,digits) VALUES (?,?,?,?,?,0,0,?,2)',
            [
                uuid(),
                $name,
                $tid,
                $starts,
                $ends,
                json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            ],
        );
    });
}

<?php
declare(strict_types=1);
namespace Urna;

/** Links públicos aleatórios não permitem enumerar eleições nem consultar eleitores. */
function v2EnsurePublicTokens(): void
{
    foreach (all('SELECT id FROM v2_elections WHERE published=1 AND public_token IS NULL') as $r) {
        sql('UPDATE v2_elections SET public_token=? WHERE id=? AND public_token IS NULL', [
            bin2hex(random_bytes(32)),
            $r['id'],
        ]);
    }
}

/** Lista mínima para selecionar participantes; nunca dá permissão para editar alunos. */
function v2RosterRows(string $id, array $me): array
{
    v2ElectionAccess($me, $id);
    $saved = all(
        'SELECT matricula,name,class_name AS className FROM v2_electors WHERE election_id=?',
        [$id],
    );
    $selected = array_column($saved, 'matricula');
    $byId = [];
    foreach ($saved as $row) {
        $byId[$row['matricula']] = $row;
    }
    foreach (
        all('SELECT matricula,name,class_name AS className FROM v2_students WHERE active=1')
        as $row
    ) {
        if (!isset($byId[$row['matricula']])) {
            $byId[$row['matricula']] = $row;
        }
    }
    $rows = [];
    foreach ($byId as $row) {
        $row['className'] = v2CanonicalClass($row['className']);
        if (!v2ClassAllowed($me, $row['className'])) {
            continue;
        }
        $row['selected'] = in_array($row['matricula'], $selected, true);
        $rows[] = $row;
    }
    usort(
        $rows,
        fn($a, $b) => [$a['className'], $a['name'], $a['matricula']] <=> [
            $b['className'],
            $b['name'],
            $b['matricula'],
        ],
    );
    return $rows;
}

/** Toda mudança agendada atualiza a fotografia e mantém uma eleição válida para abrir. */
function v2RefreshScheduled(string $id): void
{
    $e = v2Election($id);
    if (!$e['published']) {
        return;
    }
    $candidates = array_values(array_filter(v2Candidates($id), fn($c) => $c['active']));
    if (!$candidates) {
        fail('Mantenha pelo menos um candidato ativo na eleição agendada.');
    }
    $images = in_array('images', array_column(v2ElectionTerminals($id), 'model'), true);
    foreach ($candidates as &$c) {
        if ($e['hasVice'] && !$c['viceName']) {
            fail('Complete os vices antes de alterar a eleição agendada.');
        }
        if ($images && (!$c['image'] || ($e['hasVice'] && !$c['viceImage']))) {
            fail('A urna por imagens exige fotos de todos os candidatos e vices.');
        }
        if (!$e['hasVice']) {
            $c['viceName'] = '';
            $c['viceImage'] = '';
        }
    }
    unset($c);
    if (
        $e['requireMatricula'] &&
        !one('SELECT matricula FROM v2_electors WHERE election_id=? LIMIT 1', [$id])
    ) {
        fail('A eleição agendada precisa ter eleitores selecionados.');
    }
    sql('UPDATE v2_elections SET candidate_snapshot=? WHERE id=?', [
        json_encode($candidates, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $id,
    ]);
}

/** Arquivo administrativo inclui exclusões lógicas e preserva os resultados originais. */
function v2ElectionHistory(): never
{
    method('GET');
    $me = requireAdmin(true);
    if ($me['role'] !== 'admin') {
        fail('Somente administradores podem consultar o histórico.', 403);
    }
    v2Schema();
    $rows = [];
    foreach (
        all(
            'SELECT e.id,a.name AS ownerName FROM v2_elections e LEFT JOIN v2_election_owners o ON o.election_id=e.id LEFT JOIN administrators a ON a.id=o.admin_id ORDER BY COALESCE(e.starts_at,\'\') DESC,e.name',
        )
        as $r
    ) {
        $e = v2Election($r['id']);
        unset($e['candidateSnapshot'], $e['results'], $e['publicToken']);
        $e['ownerName'] = $r['ownerName'] ?: 'Cadastro anterior';
        $e['voteCount'] = (int) one('SELECT COUNT(*) n FROM v2_ballots WHERE election_id=?', [
            $e['id'],
        ])['n'];
        $rows[] = $e;
    }
    reply(['rows' => $rows]);
}

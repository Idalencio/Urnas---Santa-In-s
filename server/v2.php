<?php
declare(strict_types=1);
namespace Urna;

/** Aplica somente migrações pendentes; mantém as tabelas e os votos anteriores. */
function v2Schema(): void
{
    if (one("SELECT version FROM schema_migrations WHERE version='005_class_names.sql'")) {
        return;
    }
    installSchema();
}
function v2Election(string $id, bool $lock = false): array
{
    $e = one(
        'SELECT id,name,digits,has_vice AS hasVice,require_matricula AS requireMatricula,published,closed,starts_at AS startsAt,ends_at AS endsAt,candidate_snapshot AS candidateSnapshot FROM v2_elections WHERE id=?' .
            ($lock ? ' FOR UPDATE' : ''),
        [$id],
    );
    if (!$e) {
        fail('Eleição não encontrada.', 404);
    }
    $e['candidateSnapshot'] = json_decode($e['candidateSnapshot'], true, 64, JSON_THROW_ON_ERROR);
    $e['results'] = [];
    return $e;
}
function v2Status(array $e): string
{
    if ($e['closed']) {
        return 'closed';
    }
    if (!$e['published']) {
        return 'draft';
    }
    return now() >= $e['endsAt'] ? 'closed' : (now() < $e['startsAt'] ? 'scheduled' : 'active');
}
/** Trava a eleição e impede editar configurações que já foram publicadas. */
function v2Draft(string $id): array
{
    $e = v2Election($id, true);
    if ($e['published'] || $e['closed']) {
        fail('Esta eleição já foi publicada. Duplique-a para fazer outra configuração.', 409);
    }
    return $e;
}
function v2Candidates(string $id): array
{
    return all(
        'SELECT id,election_id AS electionId,name,code,image,vice_name AS viceName,vice_image AS viceImage,active FROM v2_candidates WHERE election_id=? ORDER BY LENGTH(code),code',
        [$id],
    );
}
function v2Image(string $image): bool
{
    return $image === '' ||
        preg_match('#^/characters/(lion|owl|fox)\.svg$#D', $image) ||
        (preg_match('#^/api/images/[a-zA-Z0-9-]+$#D', $image) &&
            is_file(ROOT . '/storage/uploads/' . basename($image)));
}
/** Matrícula é texto: os zeros iniciais e a identificação original são preservados. */
function v2Matricula(mixed $value): string
{
    $value = clean($value, 81);
    if (!preg_match('#^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,79}$#D', $value)) {
        fail('Matrícula inválida. Confira o número informado.');
    }
    return $value;
}
/** Reconhece os vínculos N:N atuais e o campo antigo para compatibilidade. */
function v2Linked(string $terminalId, string $electionId): bool
{
    return (bool) one(
        'SELECT id FROM v2_terminals t WHERE t.id=? AND (t.election_id=? OR EXISTS (SELECT 1 FROM v2_election_terminals l WHERE l.terminal_id=t.id AND l.election_id=?))',
        [$terminalId, $electionId, $electionId],
    );
}
function v2ElectionTerminals(string $electionId): array
{
    return all(
        'SELECT t.id,t.name,t.location,t.model,t.election_id AS electionId FROM v2_terminals t WHERE t.election_id=? OR EXISTS (SELECT 1 FROM v2_election_terminals l WHERE l.terminal_id=t.id AND l.election_id=?) ORDER BY t.id',
        [$electionId, $electionId],
    );
}
function v2TerminalElections(string $terminalId): array
{
    $out = [];
    foreach (
        all(
            'SELECT e.id FROM v2_elections e WHERE e.published=1 AND e.closed=0 AND (EXISTS (SELECT 1 FROM v2_election_terminals l WHERE l.election_id=e.id AND l.terminal_id=?) OR EXISTS (SELECT 1 FROM v2_terminals t WHERE t.id=? AND t.election_id=e.id)) ORDER BY e.name',
            [$terminalId, $terminalId],
        )
        as $r
    ) {
        $e = v2Election($r['id']);
        if (v2Status($e) !== 'closed') {
            $out[] = [
                'id' => $e['id'],
                'name' => $e['name'],
                'startsAt' => $e['startsAt'],
                'endsAt' => $e['endsAt'],
                'status' => v2Status($e),
            ];
        }
    }
    return $out;
}
function v2ResolveElection(string $terminalId, string $requested): array
{
    if (!$requested) {
        $choices = v2TerminalElections($terminalId);
        if (!$choices) {
            fail('Não há eleição aberta nesta urna.', 409);
        }
        if (count($choices) !== 1) {
            fail('Escolha uma eleição nesta urna.');
        }
        $requested = $choices[0]['id'];
    }
    if (!v2Linked($terminalId, $requested)) {
        fail('Esta eleição não está disponível nesta urna.', 409);
    }
    return v2Election($requested);
}
/** Monta o painel com os dados que a conta pode consultar, sem senhas ou tokens. */
function v2State(array $me): array
{
    $elections = [];
    foreach (all('SELECT id FROM v2_elections ORDER BY name') as $r) {
        if (!v2HasElection($me, $r['id'])) {
            continue;
        }
        $e = v2Election($r['id']);
        $e['electorClasses'] = array_column(
            all(
                'SELECT DISTINCT class_name FROM v2_electors WHERE election_id=? ORDER BY class_name',
                [$e['id']],
            ),
            'class_name',
        );
        if (!$e['published']) {
            $e['electorClasses'] = array_values(
                array_unique(array_map(__NAMESPACE__ . '\\v2CanonicalClass', $e['electorClasses'])),
            );
        }
        $e['candidates'] = v2Candidates($e['id']);
        $e['terminalIds'] = array_column(v2ElectionTerminals($e['id']), 'id');
        $e['results'] = v2Can($me, 'viewResults')
            ? all(
                "SELECT candidate_id AS candidateId,'valid' AS kind,COUNT(*) AS total FROM v2_ballots WHERE election_id=? GROUP BY candidate_id",
                [$e['id']],
            )
            : [];
        $counts = one(
            'SELECT COUNT(*) AS electors,COALESCE(SUM(voted),0) AS voted FROM v2_electors WHERE election_id=?',
            [$e['id']],
        );
        $e['electorCount'] = (int) $counts['electors'];
        $e['votedCount'] = (int) $counts['voted'];
        $elections[] = $e;
    }
    $classes = array_values(array_filter(v2ClassList(), fn($c) => v2ClassAllowed($me, $c['name'])));
    $students =
        $me['role'] === 'admin'
            ? all(
                'SELECT s.matricula,s.name,s.class_name AS className,EXISTS (SELECT 1 FROM v2_electors e WHERE e.matricula=s.matricula) AS matriculaLocked FROM v2_students s WHERE s.active=1 ORDER BY s.class_name,s.name',
            )
            : [];
    $terms = all(
        'SELECT id,name,location,model,election_id AS electionId FROM v2_terminals ORDER BY name',
    );
    foreach ($terms as &$t) {
        if ($t['electionId'] && !v2HasElection($me, $t['electionId'])) {
            $t['electionId'] = null;
        }
    }
    unset($t);
    return [
        'me' => v2Profile($me),
        'elections' => $elections,
        'terminals' => $terms,
        'students' => $students,
        'classes' => $classes,
        'accounts' => $me['role'] === 'admin' ? v2Accounts() : [],
    ];
}
function v2SaveElection(array $v, array $me): string
{
    $id = clean($v['id'] ?? '') ?: uuid();
    $name = clean($v['name'] ?? '');
    $digits = (int) ($v['digits'] ?? 5);
    if (!$name || $digits < 1 || $digits > 5) {
        fail('Informe um nome e um limite de 1 a 5 dígitos.');
    }
    transaction(function () use ($v, $id, $name, $digits, $me) {
        if (!empty($v['id'])) {
            v2Draft($id);
            if (
                one('SELECT id FROM v2_candidates WHERE election_id=? AND LENGTH(code)>? LIMIT 1', [
                    $id,
                    $digits,
                ])
            ) {
                fail('Há um candidato com número maior que o limite escolhido.');
            }
            sql(
                'UPDATE v2_elections SET name=?,digits=?,has_vice=?,require_matricula=? WHERE id=?',
                [
                    $name,
                    $digits,
                    !empty($v['hasVice']) ? 1 : 0,
                    !empty($v['requireMatricula']) ? 1 : 0,
                    $id,
                ],
            );
        } else {
            sql(
                "INSERT INTO v2_elections (id,name,digits,has_vice,require_matricula,candidate_snapshot) VALUES (?,?,?,?,?,'[]')",
                [
                    $id,
                    $name,
                    $digits,
                    !empty($v['hasVice']) ? 1 : 0,
                    !empty($v['requireMatricula']) ? 1 : 0,
                ],
            );
            sql('INSERT INTO v2_election_owners (election_id,admin_id) VALUES (?,?)', [
                $id,
                $me['id'],
            ]);
        }
    });
    return $id;
}
/** Número é único por eleição; prefeito e vice são salvos na mesma chapa. */
function v2SaveCandidate(array $v): void
{
    $eid = clean($v['electionId'] ?? '');
    $id = clean($v['id'] ?? '') ?: uuid();
    $name = clean($v['name'] ?? '');
    $code = clean($v['code'] ?? '', 6);
    $image = clean($v['image'] ?? '', 250);
    $viceName = clean($v['viceName'] ?? '');
    $viceImage = clean($v['viceImage'] ?? '', 250);
    if (!$name || !preg_match('/^(?:0|[1-9][0-9]{0,4})$/D', $code)) {
        fail('Informe nome e um número de 0 a 99999, sem zeros adicionados à esquerda.');
    }
    if (!v2Image($image) || !v2Image($viceImage)) {
        fail('Envie uma imagem válida.');
    }
    transaction(function () use ($v, $eid, $id, $name, $code, $image, $viceName, $viceImage) {
        $e = v2Draft($eid);
        if (strlen($code) > $e['digits']) {
            fail('O número excede o limite de dígitos desta eleição.');
        }
        if ($e['hasVice'] && !$viceName) {
            fail('Informe o nome do vice desta chapa.');
        }
        if (
            one('SELECT id FROM v2_candidates WHERE election_id=? AND code=? AND id<>?', [
                $eid,
                $code,
                $id,
            ])
        ) {
            fail('Este número já está cadastrado nesta eleição.');
        }
        if (!empty($v['id'])) {
            if (!one('SELECT id FROM v2_candidates WHERE id=? AND election_id=?', [$id, $eid])) {
                fail('Candidato não pertence à eleição.');
            }
            sql(
                'UPDATE v2_candidates SET name=?,code=?,image=?,vice_name=?,vice_image=?,active=? WHERE id=?',
                [
                    $name,
                    $code,
                    $image,
                    $e['hasVice'] ? $viceName : '',
                    $e['hasVice'] ? $viceImage : '',
                    !empty($v['active']) ? 1 : 0,
                    $id,
                ],
            );
        } else {
            sql(
                'INSERT INTO v2_candidates (id,election_id,name,code,image,vice_name,vice_image,active) VALUES (?,?,?,?,?,?,?,?)',
                [
                    $id,
                    $eid,
                    $name,
                    $code,
                    $image,
                    $e['hasVice'] ? $viceName : '',
                    $e['hasVice'] ? $viceImage : '',
                    !empty($v['active']) ? 1 : 0,
                ],
            );
        }
    });
}
/** Valida o arquivo inteiro antes de iniciar a gravação dos alunos. */
function v2Csv(mixed $text): array
{
    if (!is_string($text)) {
        fail('Envie o conteúdo de um arquivo CSV.');
    }
    if (strlen($text) > 1500000) {
        fail('O arquivo deve ter até 1,5 MB.', 413);
    }
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    if (!mb_check_encoding($text, 'UTF-8')) {
        fail('Exporte o arquivo como CSV UTF-8.');
    }
    $first = strtok($text, "\r\n") ?: '';
    $delimiter = substr_count($first, ';') >= substr_count($first, ',') ? ';' : ',';
    $f = fopen('php://temp', 'w+');
    fwrite($f, $text);
    rewind($f);
    $header = fgetcsv($f, 0, $delimiter, '"', '');
    if (!$header) {
        fail('CSV vazio.');
    }
    $header = array_map(
        fn($x) => str_replace(['í', 'Í'], ['i', 'i'], mb_strtolower(trim($x))),
        $header,
    );
    $map = [];
    foreach (['nome', 'turma', 'matricula'] as $key) {
        $i = array_search($key, $header, true);
        if ($i === false) {
            fail('Use as colunas nome, turma e matricula.');
        }
        $map[$key] = $i;
    }
    $students = [];
    $seen = [];
    $line = 1;
    while (($values = fgetcsv($f, 0, $delimiter, '"', '')) !== false) {
        $line++;
        if (count($values) === 1 && trim($values[0] ?? '') === '') {
            continue;
        }
        if (count($students) >= 10000) {
            fail('Importe até 10.000 alunos por arquivo.');
        }
        $name = clean($values[$map['nome']] ?? '');
        $class = clean($values[$map['turma']] ?? '', 80);
        $matricula = v2Matricula($values[$map['matricula']] ?? '');
        if (!$name || !$class) {
            fail('Preencha nome e turma na linha ' . $line . '.');
        }
        if (isset($seen[$matricula])) {
            fail('Matrícula repetida na linha ' . $line . ': ' . $matricula);
        }
        $seen[$matricula] = true;
        $students[] = ['matricula' => $matricula, 'name' => $name, 'className' => $class];
    }
    fclose($f);
    if (!$students) {
        fail('O arquivo não contém alunos.');
    }
    return $students;
}
/** Copia os alunos ativos para a lista da eleição; alterações futuras são explícitas. */
function v2Enroll(array $b, array $me): void
{
    $id = clean($b['electionId'] ?? '');
    $classes = $b['classes'] ?? [];
    if (
        !is_array($classes) ||
        count($classes) > 500 ||
        array_filter($classes, fn($c) => !is_string($c))
    ) {
        fail('Selecione as turmas.');
    }
    if ($me['role'] !== 'admin') {
        if (!$classes) {
            fail('Selecione pelo menos uma turma liberada.', 403);
        }
        foreach ($classes as $class) {
            if (!v2ClassAllowed($me, $class)) {
                fail('Esta turma não foi liberada para sua conta.', 403);
            }
        }
    }
    $classes = array_map(__NAMESPACE__ . '\\v2CanonicalClass', $classes);
    transaction(function () use ($id, $classes) {
        v2Draft($id);
        $students = all('SELECT * FROM v2_students WHERE active=1');
        $chosen = array_filter(
            $students,
            fn($s) => !$classes || in_array($s['class_name'], $classes, true),
        );
        if (!$chosen) {
            fail('Não há alunos nas turmas escolhidas.');
        }
        sql('DELETE FROM v2_electors WHERE election_id=?', [$id]);
        foreach ($chosen as $s) {
            sql(
                'INSERT INTO v2_electors (election_id,matricula,name,class_name) VALUES (?,?,?,?)',
                [$id, $s['matricula'], $s['name'], $s['class_name']],
            );
        }
    });
}
/** Publica candidatos e eleitorado fixos e vincula a eleição às urnas compartilhadas. */
function v2Publish(array $b): void
{
    $id = clean($b['electionId'] ?? '');
    $start = parseDate($b['startsAt'] ?? null);
    $end = parseDate($b['endsAt'] ?? null);
    if ($end <= $start || $end <= now()) {
        fail('Confira o início e o encerramento.');
    }
    $models = $b['models'] ?? null;
    if (
        $models !== null &&
        (!is_array($models) ||
            !$models ||
            count($models) > 2 ||
            array_filter(
                $models,
                fn($m) => !is_string($m) || !in_array($m, ['standard', 'images'], true),
            ) ||
            count(array_unique($models)) !== count($models))
    ) {
        fail('Escolha a urna com teclado, por imagens ou as duas.');
    }
    transaction(function () use ($id, $start, $end, $models) {
        $e = v2Draft($id);
        $candidates = array_values(array_filter(v2Candidates($id), fn($c) => $c['active']));
        if (!$candidates) {
            fail('Cadastre pelo menos um candidato ativo.');
        }
        foreach ($candidates as &$c) {
            if (strlen($c['code']) > $e['digits']) {
                fail('Confira os números dos candidatos.');
            }
            if ($e['hasVice'] && !$c['viceName']) {
                fail('Há uma chapa sem vice.');
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
            fail('Selecione os eleitores desta eleição.');
        }
        $terms = v2ElectionTerminals($id);
        $chosen = $models ?? array_values(array_unique(array_column($terms, 'model')));
        if (!$chosen) {
            fail('Escolha uma urna antes de publicar.');
        }
        if (in_array('images', $chosen, true)) {
            foreach ($candidates as $c) {
                if (!$c['image'] || ($e['hasVice'] && !$c['viceImage'])) {
                    fail(
                        'Complete as fotos do prefeito e do vice da chapa número ' .
                            $c['code'] .
                            '.',
                    );
                }
            }
        }
        if ($models !== null) {
            // A configuração pertence à eleição. Os mesmos endereços de urna
            // oferecem várias eleições, cada uma com seus eleitores e candidatos.
            sql('DELETE FROM v2_election_terminals WHERE election_id=?', [$id]);
            foreach ($terms as $t) {
                if (!in_array($t['model'], $models, true)) {
                    sql('UPDATE v2_terminals SET election_id=NULL WHERE id=? AND election_id=?', [
                        $t['id'],
                        $id,
                    ]);
                }
            }
            foreach ($models as $model) {
                $tid = $model === 'images' ? 'urna-infantil' : 'urna-padrao';
                sql('INSERT INTO v2_election_terminals (election_id,terminal_id) VALUES (?,?)', [
                    $id,
                    $tid,
                ]);
            }
        }
        sql(
            'UPDATE v2_elections SET published=1,starts_at=?,ends_at=?,candidate_snapshot=? WHERE id=?',
            [
                $start,
                $end,
                json_encode($candidates, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                $id,
            ],
        );
    });
}
function v2SaveTerminal(array $v): void
{
    $id = clean($v['id'] ?? '') ?: uuid();
    $eid = clean($v['electionId'] ?? '');
    $name = clean($v['name'] ?? '');
    $model = $v['model'] ?? '';
    if (!$name || !in_array($model, ['standard', 'images'], true)) {
        fail('Informe nome e modelo da urna.');
    }
    transaction(function () use ($v, $id, $eid, $name, $model) {
        // Eleições são travadas antes das urnas, na mesma ordem usada para votar.
        $old = one('SELECT election_id FROM v2_terminals WHERE id=?', [$id]);
        $ids = array_filter(array_unique([$eid, $old['election_id'] ?? '']));
        sort($ids);
        $elections = [];
        foreach ($ids as $x) {
            $elections[$x] = v2Election($x, true);
        }
        $current = one('SELECT * FROM v2_terminals WHERE id=? FOR UPDATE', [$id]);
        if (
            $current &&
            $current['election_id'] &&
            ($old['election_id'] ?? null) !== $current['election_id']
        ) {
            fail('A urna foi alterada. Atualize e tente novamente.', 409);
        }
        if (
            $current &&
            $current['election_id'] &&
            in_array(
                v2Status($elections[$current['election_id']]),
                ['active', 'scheduled'],
                true,
            ) &&
            ($eid !== $current['election_id'] || $model !== $current['model'])
        ) {
            fail('Encerre a eleição atual antes de trocar esta urna.');
        }
        if ($eid && $model === 'images' && $elections[$eid]['published']) {
            foreach ($elections[$eid]['candidateSnapshot'] as $c) {
                if (!$c['image'] || ($elections[$eid]['hasVice'] && !$c['viceImage'])) {
                    fail('Esta eleição tem candidatos sem as imagens necessárias.');
                }
            }
        }
        sql(
            'INSERT INTO v2_terminals (id,name,location,model,election_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),location=VALUES(location),model=VALUES(model),election_id=VALUES(election_id)',
            [$id, $name, clean($v['location'] ?? ''), $model, $eid ?: null],
        );
    });
}
function v2Terminal(string $id, bool $lock = false): array
{
    $t = one(
        'SELECT id,name,location,model,election_id AS electionId FROM v2_terminals WHERE id=?' .
            ($lock ? ' FOR UPDATE' : ''),
        [$id],
    );
    if (!$t) {
        fail('Urna não encontrada.', 404);
    }
    return $t;
}
/** Libera a matrícula por cinco minutos, vinculada à eleição e à urna. */
function v2Authorize(string $id, array $b): array
{
    $matricula = v2Matricula($b['matricula'] ?? '');
    throttle('v2-authorize:' . $id . ':' . ($_SERVER['REMOTE_ADDR'] ?? ''), 40, 1);
    $initial = v2ResolveElection($id, clean($b['electionId'] ?? ''));
    return transaction(function () use ($id, $initial, $matricula) {
        $e = v2Election($initial['id'], true);
        v2Terminal($id, true);
        if (!v2Linked($id, $e['id']) || v2Status($e) !== 'active') {
            fail('A eleição não está aberta.', 409);
        }
        if (!$e['requireMatricula']) {
            fail('Esta eleição não exige matrícula.');
        }
        $student = one('SELECT * FROM v2_electors WHERE election_id=? AND matricula=? FOR UPDATE', [
            $e['id'],
            $matricula,
        ]);
        if (!$student) {
            fail('Matrícula não habilitada para esta eleição.', 403);
        }
        if ($student['voted']) {
            fail('Esta matrícula já votou nesta eleição.', 409);
        }
        if ($student['gate_hash'] && (int) $student['gate_expires'] > time()) {
            fail(
                'Esta matrícula já está liberada. Aguarde até 5 minutos ou peça ao responsável para cancelar a liberação.',
                409,
            );
        }
        $gate = token();
        sql(
            'UPDATE v2_electors SET gate_hash=?,gate_expires=?,terminal_id=? WHERE election_id=? AND matricula=?',
            [digest($gate), time() + 300, $id, $e['id'], $matricula],
        );
        return [
            'ok' => true,
            'gate' => $gate,
            'name' => $student['name'],
            'className' => $student['class_name'],
            'expiresIn' => 300,
        ];
    });
}
/**
 * Grava participação e voto na mesma transação. A linha de voto não recebe matrícula.
 * O requestId impede contabilizar novamente uma confirmação reenviada pela rede.
 */
function v2Vote(string $id, array $b): array
{
    $rid = clean($b['requestId'] ?? '', 36);
    $eid = clean($b['electionId'] ?? '');
    $code = clean($b['code'] ?? '', 6);
    if (
        !preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di',
            $rid,
        ) ||
        !preg_match('/^(?:0|[1-9][0-9]{0,4})$/D', $code) ||
        !empty($b['blank'])
    ) {
        fail('Confirmação ou número inválidos.');
    }
    return transaction(function () use ($id, $b, $rid, $eid, $code) {
        $e = v2Election($eid, true);
        $candidate = null;
        foreach ($e['candidateSnapshot'] as $c) {
            if ($c['code'] === $code) {
                $candidate = $c;
            }
        }
        if (!$candidate) {
            fail('Número inválido.');
        }
        // A confirmação aleatória não é gravada no cadastro de participação.
        $existing = one('SELECT election_id,candidate_id FROM v2_ballots WHERE id=?', [$rid]);
        if ($existing) {
            if (
                $existing['election_id'] === $eid &&
                $existing['candidate_id'] === $candidate['id']
            ) {
                return ['ok' => true, 'duplicate' => true];
            }
            fail('Esta confirmação já foi utilizada.', 409);
        }
        v2Terminal($id, true);
        if (!v2Linked($id, $eid) || v2Status($e) !== 'active') {
            fail('A eleição não está aberta nesta urna.', 409);
        }
        if ($e['requireMatricula']) {
            $gate = $b['gate'] ?? '';
            if (!tokenValid($gate)) {
                fail('Informe sua matrícula para liberar a urna.', 403);
            }
            $elector = one(
                'SELECT matricula,voted,gate_expires,terminal_id FROM v2_electors WHERE election_id=? AND gate_hash=? FOR UPDATE',
                [$eid, digest($gate)],
            );
            if (
                !$elector ||
                $elector['voted'] ||
                (int) $elector['gate_expires'] < time() ||
                $elector['terminal_id'] !== $id
            ) {
                fail(
                    'A liberação expirou ou já foi utilizada. Informe a matrícula novamente.',
                    403,
                );
            }
            sql(
                'UPDATE v2_electors SET voted=1,gate_hash=NULL,gate_expires=NULL,terminal_id=NULL WHERE election_id=? AND matricula=?',
                [$eid, $elector['matricula']],
            );
        }
        sql("INSERT INTO v2_ballots (id,election_id,candidate_id,kind) VALUES (?,?,?,'valid')", [
            $rid,
            $eid,
            $candidate['id'],
        ]);
        return ['ok' => true];
    });
}
/** API pública da urna: configuração, identificação, confirmação e cancelamento. */
function v2Public(string $id): never
{
    $m = method('GET', 'POST');
    $t = v2Terminal($id);
    if ($m === 'GET') {
        $choices = v2TerminalElections($id);
        $requested = clean($_GET['election'] ?? '');
        $e = $requested || count($choices) === 1 ? v2ResolveElection($id, $requested) : null;
        if ($e) {
            $e['status'] = v2Status($e);
            $e['results'] = [];
            if ($e['status'] !== 'active') {
                $e['candidateSnapshot'] = [];
            }
        }
        reply(['terminal' => $t, 'election' => $e, 'elections' => $choices]);
    }
    sameOrigin();
    $b = body();
    $action = $b['action'] ?? 'vote';
    if ($action === 'authorize') {
        reply(v2Authorize($id, $b));
    }
    if ($action === 'cancel') {
        $gate = $b['gate'] ?? '';
        if (tokenValid($gate)) {
            sql(
                'UPDATE v2_electors SET gate_hash=NULL,gate_expires=NULL,terminal_id=NULL WHERE gate_hash=? AND terminal_id=? AND voted=0',
                [digest($gate), $id],
            );
        }
        reply(['ok' => true]);
    }
    if ($action !== 'vote') {
        fail('Ação inválida.');
    }
    reply(v2Vote($id, $b));
}
/** API administrativa: a autorização é verificada antes de executar cada ação. */
function v2App(): never
{
    $m = method('GET', 'POST');
    if ($m === 'POST') {
        sameOrigin();
    }
    $me = requireAdmin(true);
    v2Schema();
    sql(
        "INSERT IGNORE INTO v2_terminals (id,name,location,model) VALUES ('urna-padrao','Urna padrão','Teclado e toque','standard'),('urna-infantil','Urna infantil','Escolha por imagens','images')",
    );
    if ($m === 'GET') {
        reply(v2State($me));
    }
    $b = body(2200000);
    $action = $b['action'] ?? '';
    $v = is_array($b['value'] ?? null) ? $b['value'] : [];
    v2CheckAction($me, $action, $b, $v);
    switch ($action) {
        case 'student':
            reply(['ok' => true] + v2SaveStudent($v));
        case 'deleteStudent':
            reply(['ok' => true] + v2DeleteStudent($b));
        case 'renameClass':
            reply(['ok' => true, 'name' => v2RenameClass($b)]);
        case 'account':
            reply(['ok' => true, 'id' => v2SaveAccount($me, $v)]);
        case 'election':
            $id = v2SaveElection($v, $me);
            reply(['ok' => true, 'id' => $id]);
        case 'candidate':
            v2SaveCandidate($v);
            break;
        case 'terminal':
            v2SaveTerminal($v);
            break;
        case 'image':
            reply(['image' => storeImageData($b['imageData'] ?? null)]);
        case 'csvPreview':
            $students = v2Csv($b['csv'] ?? '');
            reply(['rows' => $students, 'count' => count($students)]);
        case 'csvImport':
            $students = v2Csv($b['csv'] ?? '');
            v2RosterTransaction(function () use ($students) {
                foreach ($students as $s) {
                    sql(
                        'INSERT INTO v2_students (matricula,name,class_name,active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),class_name=VALUES(class_name),active=1',
                        [$s['matricula'], $s['name'], v2CanonicalClass($s['className'])],
                    );
                }
            });
            reply(['ok' => true, 'count' => count($students)]);
        case 'enroll':
            v2Enroll($b, $me);
            break;
        case 'publish':
            v2Publish($b);
            break;
        case 'electors':
            $rows = all(
                'SELECT matricula,name,class_name AS className,voted,CASE WHEN gate_hash IS NOT NULL AND gate_expires>? THEN 1 ELSE 0 END AS released FROM v2_electors WHERE election_id=? ORDER BY class_name,name',
                [time(), clean($b['electionId'] ?? '')],
            );
            reply([
                'rows' => array_values(
                    array_filter($rows, fn($s) => v2ClassAllowed($me, $s['className'])),
                ),
            ]);
        case 'unlock':
            transaction(function () use ($b, $me) {
                $id = clean($b['electionId'] ?? '');
                v2Election($id, true);
                $student = one(
                    'SELECT class_name FROM v2_electors WHERE election_id=? AND matricula=?',
                    [$id, v2Matricula($b['matricula'] ?? '')],
                );
                if ($student && !v2ClassAllowed($me, $student['class_name'])) {
                    fail('Esta turma não foi liberada.', 403);
                }
                sql(
                    'UPDATE v2_electors SET gate_hash=NULL,gate_expires=NULL,terminal_id=NULL WHERE election_id=? AND matricula=? AND voted=0',
                    [$id, v2Matricula($b['matricula'] ?? '')],
                );
            });
            break;
        case 'close':
            transaction(function () use ($b) {
                $id = clean($b['electionId'] ?? '');
                v2Election($id, true);
                sql('UPDATE v2_elections SET closed=1 WHERE id=?', [$id]);
                sql(
                    'UPDATE v2_electors SET gate_hash=NULL,gate_expires=NULL,terminal_id=NULL WHERE election_id=?',
                    [$id],
                );
            });
            break;
        case 'duplicate':
            $id = transaction(function () use ($b, $me) {
                $e = v2Election(clean($b['electionId'] ?? ''), true);
                $id = uuid();
                sql(
                    "INSERT INTO v2_elections (id,name,digits,has_vice,require_matricula,candidate_snapshot) VALUES (?,?,?,?,?,'[]')",
                    [
                        $id,
                        mb_substr($e['name'] . ' — cópia', 0, 160),
                        $e['digits'],
                        $e['hasVice'],
                        $e['requireMatricula'],
                    ],
                );
                foreach (v2Candidates($e['id']) as $c) {
                    sql(
                        'INSERT INTO v2_candidates (id,election_id,name,code,image,vice_name,vice_image,active) VALUES (?,?,?,?,?,?,?,?)',
                        [
                            uuid(),
                            $id,
                            $c['name'],
                            $c['code'],
                            $c['image'],
                            $c['viceName'],
                            $c['viceImage'],
                            $c['active'],
                        ],
                    );
                }
                sql('INSERT INTO v2_election_owners (election_id,admin_id) VALUES (?,?)', [
                    $id,
                    $me['id'],
                ]);
                return $id;
            });
            reply(['ok' => true, 'id' => $id]);
        default:
            fail('Ação desconhecida.');
    }
    reply(['ok' => true]);
}

<?php
declare(strict_types=1);
namespace Urna;

function v2ClassAliases(bool $reload = false): array
{
    static $aliases = null;
    if ($reload || $aliases === null) {
        $aliases = array_column(
            all('SELECT original_name,current_name FROM v2_class_aliases'),
            'current_name',
            'original_name',
        );
    }
    return $aliases;
}
function v2CanonicalClass(string $name): string
{
    return v2ClassAliases()[$name] ?? $name;
}
function v2ClassName(mixed $value): string
{
    if (
        !is_string($value) ||
        !trim($value) ||
        mb_strlen(trim($value)) > 80 ||
        preg_match('/[\x00-\x1f\x7f]/u', $value)
    ) {
        fail('Informe uma turma de até 80 caracteres.');
    }
    return trim($value);
}
/** Serializa importação, cadastro, exclusão e renomeação do cadastro geral. */
function v2RosterTransaction(callable $fn): mixed
{
    $key = 'urna-roster-' . substr(digest(config()['database']['name']), 0, 40);
    if ((int) (one('SELECT GET_LOCK(?,10) AS acquired', [$key])['acquired'] ?? 0) !== 1) {
        fail('O cadastro de alunos está sendo atualizado. Tente novamente.', 409);
    }
    try {
        v2ClassAliases(true);
        return transaction($fn);
    } finally {
        sql('SELECT RELEASE_LOCK(?)', [$key]);
    }
}
/** Reconhece abreviações do mesmo nome, sem tratar um nome diferente como mais completo. */
function v2ImportName(string $incoming, string $existing): string
{
    if (!$incoming) {
        return $existing;
    }
    if (!$existing) {
        return $incoming;
    }
    $tokens = function (string $name): array {
        $name = strtr(mb_strtolower($name), [
            'á' => 'a',
            'à' => 'a',
            'â' => 'a',
            'ã' => 'a',
            'ä' => 'a',
            'å' => 'a',
            'é' => 'e',
            'è' => 'e',
            'ê' => 'e',
            'ë' => 'e',
            'í' => 'i',
            'ì' => 'i',
            'î' => 'i',
            'ï' => 'i',
            'ó' => 'o',
            'ò' => 'o',
            'ô' => 'o',
            'õ' => 'o',
            'ö' => 'o',
            'ú' => 'u',
            'ù' => 'u',
            'û' => 'u',
            'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
        ]);
        return preg_split('/[^\p{L}\p{N}]+/u', $name, -1, PREG_SPLIT_NO_EMPTY);
    };
    $short = $tokens($incoming);
    $full = $tokens($existing);
    $cursor = 0;
    if ($short === $full) {
        // Uma planilha sem acentos não deve empobrecer o nome já conferido.
        preg_match_all('/[^\x00-\x7f]/u', $incoming, $newAccents);
        preg_match_all('/[^\x00-\x7f]/u', $existing, $oldAccents);
        return count($oldAccents[0]) >= count($newAccents[0]) ? $existing : $incoming;
    }
    foreach ($short as $part) {
        while (
            $cursor < count($full) &&
            $full[$cursor] !== $part &&
            !(mb_strlen($part) === 1 && str_starts_with($full[$cursor], $part))
        ) {
            $cursor++;
        }
        if ($cursor === count($full)) {
            return $incoming;
        }
        $cursor++;
    }
    return count($short) <= count($full) ? $existing : $incoming;
}
/** Mescla pela matrícula inteira; nunca substitui o cadastro pela lista inteira. */
function v2CsvPlan(array $incoming, array $existing): array
{
    $byMatricula = array_column($existing, null, 'matricula');
    $summary = ['added' => 0, 'updated' => 0, 'unchanged' => 0, 'reactivated' => 0];
    $rows = [];
    $preservedCount = 0;
    foreach ($incoming as $student) {
        $old = $byMatricula[$student['matricula']] ?? null;
        $original = $student;
        $student['name'] = v2ImportName($student['name'], $old['name'] ?? '');
        $student['className'] = v2CanonicalClass($student['className'] ?: $old['className'] ?? '');
        if (!$student['name'] || !$student['className']) {
            fail('Preencha nome e turma do novo aluno de matrícula ' . $student['matricula'] . '.');
        }
        $keptExisting = [];
        if ($old && $student['name'] !== $original['name']) {
            $keptExisting[] = 'name';
        }
        if ($old && !$original['className']) {
            $keptExisting[] = 'className';
        }
        if ($keptExisting) {
            $preservedCount++;
        }
        $change = !$old
            ? 'added'
            : ((int) $old['active'] === 0
                ? 'reactivated'
                : ($old['name'] !== $student['name'] || $old['className'] !== $student['className']
                    ? 'updated'
                    : 'unchanged'));
        $summary[$change]++;
        $rows[] = $student + ['change' => $change, 'keptExisting' => $keptExisting];
    }
    return [
        'rows' => $rows,
        'count' => count($rows),
        'summary' => $summary,
        'preservedCount' => $preservedCount,
    ];
}
function v2CsvPreview(array $incoming): array
{
    return v2CsvPlan(
        $incoming,
        all('SELECT matricula,name,class_name AS className,active FROM v2_students'),
    );
}
/** Refaz a comparação sob trava; a prévia nunca decide o resultado da gravação. */
function v2ImportCsv(array $incoming): array
{
    return v2RosterTransaction(function () use ($incoming) {
        $plan = v2CsvPreview($incoming);
        foreach ($plan['rows'] as $student) {
            if ($student['change'] === 'unchanged') {
                continue;
            }
            // A PK da matrícula e o upsert impedem duplicação também no banco.
            sql(
                'INSERT INTO v2_students (matricula,name,class_name,active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),class_name=VALUES(class_name),active=1',
                [$student['matricula'], $student['name'], $student['className']],
            );
        }
        return [
            'ok' => true,
            'count' => $plan['count'],
            'summary' => $plan['summary'],
            'preservedCount' => $plan['preservedCount'],
        ];
    });
}
/** Edita o cadastro geral; mantém a identidade quando a matrícula já é eleitora. */
function v2SaveStudent(array $v): array
{
    if (!is_string($v['name'] ?? null) || !trim($v['name']) || mb_strlen(trim($v['name'])) > 160) {
        fail('Informe o nome do aluno, com até 160 caracteres.');
    }
    $name = trim($v['name']);
    $matricula = v2Matricula($v['matricula'] ?? '');
    $class = v2ClassName($v['className'] ?? '');
    $editing = array_key_exists('originalMatricula', $v);
    $original = $editing ? v2Matricula($v['originalMatricula']) : null;
    return v2RosterTransaction(function () use ($name, $matricula, $class, $editing, $original) {
        $class = v2CanonicalClass($class);
        if ($editing) {
            $old = one(
                'SELECT matricula FROM v2_students WHERE matricula=? AND active=1 FOR UPDATE',
                [$original],
            );
            if (!$old) {
                fail('Aluno não encontrado. Atualize a lista.', 404);
            }
            if ($matricula !== $original) {
                if (one('SELECT matricula FROM v2_students WHERE matricula=?', [$matricula])) {
                    fail('Esta matrícula já está cadastrada. Edite o aluno existente.', 409);
                }
                if (
                    one('SELECT matricula FROM v2_electors WHERE matricula=? LIMIT 1', [$original])
                ) {
                    fail(
                        'Esta matrícula já está vinculada a uma eleição. Você pode editar o nome e a turma.',
                        409,
                    );
                }
            }
            sql('UPDATE v2_students SET matricula=?,name=?,class_name=? WHERE matricula=?', [
                $matricula,
                $name,
                $class,
                $original,
            ]);
        } else {
            $old = one('SELECT active FROM v2_students WHERE matricula=? FOR UPDATE', [$matricula]);
            if ($old && (int) $old['active'] === 1) {
                fail('Esta matrícula já está cadastrada. Edite o aluno existente.', 409);
            }
            sql(
                'INSERT INTO v2_students (matricula,name,class_name,active) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),class_name=VALUES(class_name),active=1',
                [$matricula, $name, $class],
            );
        }
        return ['matricula' => $matricula, 'className' => $class];
    });
}
/** Exclusão lógica: retira o aluno das listas ativas sem apagar vínculos eleitorais. */
function v2DeleteStudent(array $b): array
{
    $matricula = v2Matricula($b['matricula'] ?? '');
    $class = v2ClassName($b['className'] ?? '');
    return v2RosterTransaction(function () use ($matricula, $class) {
        $old = one('SELECT class_name FROM v2_students WHERE matricula=? AND active=1 FOR UPDATE', [
            $matricula,
        ]);
        if (!$old) {
            fail('Aluno não encontrado. Atualize a lista.', 404);
        }
        if ($old['class_name'] !== v2CanonicalClass($class)) {
            fail('O aluno mudou de turma. Atualize a lista antes de excluir.', 409);
        }
        // Election rosters and participation remain independent of the school register.
        sql('UPDATE v2_students SET active=0 WHERE matricula=?', [$matricula]);
        return ['matricula' => $matricula, 'className' => $old['class_name']];
    });
}
/** Preserva os nomes históricos e o acesso da equipe ao renomear o grupo. */
function v2RenameClass(array $b): string
{
    $from = v2ClassName($b['from'] ?? '');
    $name = v2ClassName($b['name'] ?? '');
    $result = v2RosterTransaction(function () use ($from, $name) {
        $from = v2CanonicalClass($from);
        if (
            !one('SELECT matricula FROM v2_students WHERE active=1 AND class_name=? LIMIT 1', [
                $from,
            ])
        ) {
            fail('Turma não encontrada. Atualize a lista.', 404);
        }
        if ($from === $name) {
            return $name;
        }
        $target = v2CanonicalClass($name);
        if (
            ($target !== $name && $target !== $from) ||
            one('SELECT matricula FROM v2_students WHERE class_name=? LIMIT 1', [$name])
        ) {
            fail('Já existe uma turma com esse nome. Escolha outro nome.', 409);
        }
        sql('UPDATE v2_students SET class_name=? WHERE class_name=?', [$name, $from]);
        // Old names continue resolving to this class for CSV imports and the
        // permission checks on historical, immutable election rosters.
        sql('UPDATE v2_class_aliases SET current_name=? WHERE current_name=?', [$name, $from]);
        sql(
            'INSERT INTO v2_class_aliases (original_name,current_name) VALUES (?,?) ON DUPLICATE KEY UPDATE current_name=VALUES(current_name)',
            [$from, $name],
        );
        return $name;
    });
    v2ClassAliases(true);
    return $result;
}

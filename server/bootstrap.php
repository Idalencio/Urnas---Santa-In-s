<?php
declare(strict_types=1);
namespace Urna;

use PDO;
use RuntimeException;
use Throwable;

const ROOT = __DIR__ . '/..';
final class ApiError extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}
function fail(string $message, int $status = 400): never
{
    throw new ApiError($message, $status);
}
/** Carrega a configuração privada, mantida fora da raiz pública e do Git. */
function config(): array
{
    static $c;
    if ($c === null) {
        $path = getenv('URNA_CONFIG') ?: ROOT . '/config/config.php';
        if (!is_file($path)) {
            fail('A instalação ainda não foi configurada pelo responsável técnico.', 503);
        }
        $c = require $path;
        if (!is_array($c)) {
            fail('Configuração inválida.', 503);
        }
        $url = parse_url($c['app_url'] ?? '');
        if (
            empty($url['host']) ||
            !in_array($url['scheme'] ?? '', ['https', 'http'], true) ||
            !empty($url['user']) ||
            !empty($url['query']) ||
            !empty($url['fragment']) ||
            !in_array($url['path'] ?? '', ['', '/'], true)
        ) {
            fail('Configure a URL completa do subdomínio, sem caminho.', 503);
        }
        if (($c['environment'] ?? 'production') === 'production' && $url['scheme'] !== 'https') {
            fail('Ative HTTPS e configure a URL segura do site.', 503);
        }
    }
    return $c;
}
/** Conexão PDO com parâmetros preparados e datas padronizadas em UTC. */
function db(): PDO
{
    static $db;
    if (!$db) {
        $c = config()['database'] ?? [];
        if (
            !is_array($c) ||
            !is_string($c['name'] ?? null) ||
            !is_string($c['host'] ?? null) ||
            !is_string($c['user'] ?? null) ||
            !is_string($c['password'] ?? null)
        ) {
            fail('Preencha os dados do banco em config/config.php.', 503);
        }
        if (!preg_match('/^[a-zA-Z0-9_]+$/D', $c['name'])) {
            fail('Nome do banco inválido.', 503);
        }
        try {
            $db = new PDO(
                'mysql:host=' .
                    $c['host'] .
                    ';port=' .
                    (int) ($c['port'] ?? 3306) .
                    ';dbname=' .
                    $c['name'] .
                    ';charset=utf8mb4',
                $c['user'],
                $c['password'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                    PDO::ATTR_STRINGIFY_FETCHES => false,
                ],
            );
        } catch (\PDOException) {
            fail(
                'Não foi possível conectar ao banco. Confira host, nome, usuário e senha em config/config.php.',
                503,
            );
        }
        $db->exec("SET time_zone = '+00:00'");
    }
    return $db;
}
function sql(string $query, array $args = []): \PDOStatement
{
    $s = db()->prepare($query);
    $s->execute($args);
    return $s;
}
function one(string $query, array $args = []): ?array
{
    $r = sql($query, $args)->fetch();
    return $r === false ? null : $r;
}
function all(string $query, array $args = []): array
{
    return sql($query, $args)->fetchAll();
}
/** Confirma todas as operações ou desfaz o conjunto em caso de falha. */
function transaction(callable $fn): mixed
{
    db()->beginTransaction();
    try {
        $r = $fn();
        db()->commit();
        return $r;
    } catch (Throwable $e) {
        if (db()->inTransaction()) {
            db()->rollBack();
        }
        throw $e;
    }
}
function now(int $offset = 0): string
{
    $t = microtime(true) + $offset;
    return gmdate('Y-m-d\TH:i:s', (int) $t) . sprintf('.%03dZ', (int) (($t - floor($t)) * 1000));
}
function clean(mixed $v, int $max = 160): string
{
    return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
}
function email(mixed $v): string
{
    return strtolower(clean($v, 254));
}
function validEmail(string $v): bool
{
    return (bool) filter_var($v, FILTER_VALIDATE_EMAIL) && !preg_match('/[\r\n]/', $v);
}
function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 15) | 64);
    $b[8] = chr((ord($b[8]) & 63) | 128);
    $h = bin2hex($b);
    return substr($h, 0, 8) .
        '-' .
        substr($h, 8, 4) .
        '-' .
        substr($h, 12, 4) .
        '-' .
        substr($h, 16, 4) .
        '-' .
        substr($h, 20);
}
/** Token aleatório temporário; persistir somente seu hash, nunca o valor original. */
function token(): string
{
    return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
}
function digest(string $v): string
{
    return hash('sha256', $v);
}
function tokenValid(mixed $v): bool
{
    return is_string($v) && (bool) preg_match('/^[A-Za-z0-9_-]{43}$/D', $v);
}
function origin(): string
{
    return rtrim(config()['app_url'], '/');
}
function sameOrigin(): void
{
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== origin()) {
        fail('Origem da solicitação inválida.', 403);
    }
}
function body(int $limit = 4096): array
{
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) {
        fail('Solicitação muito grande.', 413);
    }
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
        fail('Envie uma solicitação JSON.', 415);
    }
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || strlen($raw) > $limit) {
        fail('Solicitação muito grande.', 413);
    }
    try {
        $b = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        fail('Solicitação inválida.');
    }
    if (!is_array($b)) {
        fail('Solicitação inválida.');
    }
    return $b;
}
function reply(mixed $value, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit();
}
function method(string ...$allowed): string
{
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($m, $allowed, true)) {
        header('Allow: ' . implode(', ', $allowed));
        fail('Método não permitido.', 405);
    }
    return $m;
}
function errorResponse(Throwable $e): never
{
    if ($e instanceof ApiError) {
        reply(['error' => $e->getMessage()], $e->status);
    }
    if ($e instanceof \PDOException && ($e->errorInfo[1] ?? 0) === 1062) {
        reply(
            ['error' => 'Já existe um cadastro com esse número nesta urna ou com esse e-mail.'],
            400,
        );
    }
    // Não registrar corpos de requisição, senhas, tokens ou escolhas de voto.
    error_log(
        'Urna: ' .
            get_class($e) .
            ' código ' .
            $e->getCode() .
            ' driver ' .
            ($e instanceof \PDOException ? $e->errorInfo[1] ?? '-' : '-'),
    );
    reply(
        [
            'error' =>
                'Não foi possível concluir a operação. Confira a instalação e tente novamente.',
        ],
        500,
    );
}

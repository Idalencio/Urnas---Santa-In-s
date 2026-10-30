<?php
declare(strict_types=1);
// Este arquivo é copiado para public/index.php ao montar a entrega.
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/auth.php';
require __DIR__ . '/../server/voting.php';
require __DIR__ . '/../server/images.php';
require __DIR__ . '/../server/app.php';
require __DIR__ . '/../server/v2.php';
require __DIR__ . '/../server/access-v2.php';
require __DIR__ . '/../server/roster-v2.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header(
    "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
);

try {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if ($path === '/api/v2/app') {
        \Urna\v2App();
    }
    if (preg_match('#^/api/v2/urna/([a-zA-Z0-9-]+)$#D', $path, $m)) {
        \Urna\v2Public($m[1]);
    }
    if ($path === '/api/auth') {
        \Urna\authEndpoint();
    }
    if ($path === '/api/app') {
        \Urna\appEndpoint();
    }
    if (preg_match('#^/api/urna/([a-zA-Z0-9-]+)$#D', $path, $m)) {
        \Urna\terminalEndpoint($m[1]);
    }
    if ($path === '/api/images') {
        \Urna\imageEndpoint();
    }
    if (preg_match('#^/api/images/([a-zA-Z0-9-]+)$#D', $path, $m)) {
        \Urna\imageEndpoint($m[1]);
    }
    if (str_starts_with($path, '/api/')) {
        \Urna\fail('Endereço não encontrado.', 404);
    }
    \Urna\method('GET', 'HEAD');
    if (preg_match('#^/v2(?:/urna/[a-zA-Z0-9-]+)?/?$#D', $path)) {
        header('Cache-Control: no-store');
        header('Content-Type: text/html; charset=utf-8');
        readfile(__DIR__ . '/v2.html');
        exit();
    }
    if (
        !preg_match(
            '#^/(?:ativar/?|testar(?:/(?:padrao|infantil))?/?|urna/[a-zA-Z0-9-]+/?|alternativa(?:/(?:ativar|testar(?:/(?:padrao|infantil))?|urna/[a-zA-Z0-9-]+))?/?|index\.php)?$#D',
            $path,
        )
    ) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Página não encontrada.';
        exit();
    }
    header('Cache-Control: no-store');
    header('Content-Type: text/html; charset=utf-8');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
        readfile(__DIR__ . '/app.html');
    }
} catch (Throwable $e) {
    \Urna\errorResponse($e);
}

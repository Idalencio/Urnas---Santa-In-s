<?php
// Somente testes locais: php -S 127.0.0.1:8080 -t public bin/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$public = realpath(__DIR__ . '/../public');
$file = realpath($public . $path);
if (
    $file &&
    str_starts_with($file, $public . '/') &&
    is_file($file) &&
    $path !== '/index.php' &&
    $path !== '/app.html'
) {
    return false;
}
require $public . '/index.php';

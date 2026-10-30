<?php
declare(strict_types=1);
// Exclusivo para banco de teste. Não recebe credenciais pela linha de comando.
require __DIR__ . '/../server/bootstrap.php';
$c = \Urna\config();
$d = $c['database'];
if ($c['environment'] !== 'local' || $d['name'] !== 'urna_cloudpanel_test') {
    throw new RuntimeException('Use apenas environment=local e banco urna_cloudpanel_test.');
}
$pdo = new PDO(
    'mysql:host=' . $d['host'] . ';port=' . $d['port'] . ';charset=utf8mb4',
    $d['user'],
    $d['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$pdo->exec(
    'CREATE DATABASE IF NOT EXISTS urna_cloudpanel_test CHARACTER SET utf8mb4 COLLATE utf8mb4_bin',
);
$pdo->exec('USE urna_cloudpanel_test');
$pdo->exec('SET FOREIGN_KEY_CHECKS=0');
foreach ($pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $table) {
    $pdo->exec('DROP TABLE `' . str_replace('`', '``', $table) . '`');
}
$pdo->exec('SET FOREIGN_KEY_CHECKS=1');
echo "Banco exclusivo de testes preparado.\n";

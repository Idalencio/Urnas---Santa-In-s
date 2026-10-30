<?php
declare(strict_types=1);

// Este comando prepara somente o arquivo privado da instalação local.
// A senha nunca é recebida por argumento, gravada em texto ou enviada ao Git.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require_once __DIR__ . '/../server/bootstrap.php';
require_once __DIR__ . '/../server/auth.php';

function readUrnaInitialPassword(string $prompt): string
{
    fwrite(STDERR, $prompt);
    $interactive = function_exists('stream_isatty') && stream_isatty(STDIN);
    $terminalState = null;

    if ($interactive) {
        if (!function_exists('exec')) {
            throw new RuntimeException(
                'O terminal não permite ocultar a senha. Use entrada por stdin.',
            );
        }
        $terminalOutput = [];
        exec('stty -g', $terminalOutput, $terminalStatus);
        $terminalState = trim(implode('', $terminalOutput));
        if ($terminalStatus !== 0 || !$terminalState) {
            throw new RuntimeException(
                'Não foi possível proteger a entrada da senha neste terminal.',
            );
        }
        exec('stty -echo', $terminalOutput, $terminalStatus);
        if ($terminalStatus !== 0) {
            throw new RuntimeException(
                'Não foi possível ocultar a senha. Nenhum arquivo foi criado.',
            );
        }
    }

    try {
        $line = fgets(STDIN);
        if ($line === false) {
            throw new RuntimeException('Informe a senha e a confirmação pela entrada padrão.');
        }
        return rtrim($line, "\r\n");
    } finally {
        if ($interactive && $terminalState !== null) {
            exec('stty ' . escapeshellarg($terminalState));
        }
        fwrite(STDERR, PHP_EOL);
    }
}

$path = __DIR__ . '/../config/local-admin.php';
if (file_exists($path)) {
    throw new RuntimeException('local-admin.php já existe. A credencial atual foi preservada.');
}

$password = readUrnaInitialPassword('Senha inicial do admin (10 a 128 caracteres): ');
$confirmation = readUrnaInitialPassword('Repita a senha: ');
if (!hash_equals($password, $confirmation)) {
    throw new RuntimeException('As senhas não conferem. Nenhum arquivo foi criado.');
}
$hash = \Urna\hashPassword($password);
unset($password, $confirmation);
$content =
    '<?php' .
    PHP_EOL .
    'return ' .
    var_export(
        [
            'name' => 'Administrador CSI',
            'password_hash' => $hash,
        ],
        true,
    ) .
    ';' .
    PHP_EOL;

// A criação exclusiva também impede que duas execuções substituam a mesma conta.
$oldMask = umask(0077);
try {
    $file = @fopen($path, 'x');
    if (!$file) {
        throw new RuntimeException('Não foi possível criar a configuração. Confira as permissões.');
    }
    try {
        if (fwrite($file, $content) !== strlen($content)) {
            throw new RuntimeException('Não foi possível salvar toda a configuração.');
        }
    } finally {
        fclose($file);
    }
} finally {
    umask($oldMask);
}

echo 'Configuração privada criada. O usuário inicial é admin; a senha não foi exibida.' . PHP_EOL;

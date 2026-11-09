<?php
declare(strict_types=1);
require __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/../server/auth.php';
$secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
foreach (
    [
        [59, '94287082'],
        [1111111109, '07081804'],
        [1111111111, '14050471'],
        [1234567890, '89005924'],
        [2000000000, '69279037'],
        [20000000000, '65353130'],
    ]
    as [$time, $expected]
) {
    if (\Urna\mfaTotp($secret, intdiv($time, 30), 8) !== $expected) {
        throw new RuntimeException('Vetor RFC 6238 divergente.');
    }
}
if (\Urna\mfaBase32('12345678901234567890') !== $secret) {
    throw new RuntimeException('Base32 divergente.');
}
echo "TOTP PHP: 7 verificações RFC aprovadas.\n";

<?php
declare(strict_types=1);
namespace Urna;

/** Valida formato, bytes e dimensões; a imagem fica em storage/uploads. */
function storeImage(string $bytes): string
{
    if (strlen($bytes) > 2 * 1024 * 1024 || strlen($bytes) < 12) {
        fail('Envie PNG, JPEG ou WebP de até 2 MB.');
    }
    $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
    $size = @getimagesizefromstring($bytes);
    if (
        !in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true) ||
        !$size ||
        $size[0] > 6000 ||
        $size[1] > 6000 ||
        $size[0] * $size[1] > 20000000
    ) {
        fail('Envie uma imagem PNG, JPEG ou WebP válida, com até 2 MB e 20 megapixels.');
    }
    $id = uuid();
    $dir = ROOT . '/storage/uploads';
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
        fail('Armazenamento indisponível.', 503);
    }
    $path = $dir . '/' . $id;
    if (file_put_contents($path, $bytes, LOCK_EX) !== strlen($bytes)) {
        fail('Não foi possível salvar a imagem.', 503);
    }
    chmod($path, 0600);
    return '/api/images/' . $id;
}
function storeImageData(mixed $data): string
{
    if (
        !is_string($data) ||
        !preg_match('/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+\/=]+)$/D', $data, $m)
    ) {
        fail('Envie uma imagem PNG, JPEG ou WebP.');
    }
    $bytes = base64_decode($m[2], true);
    if ($bytes === false) {
        fail('Imagem inválida.');
    }
    return storeImage($bytes);
}
/** Entrega fotos ao painel ou às urnas enquanto a eleição correspondente está aberta. */
function imageEndpoint(?string $id = null): never
{
    if ($id === null) {
        method('POST');
        sameOrigin();
        $me = requireAdmin(true);
        if ($me['role'] !== 'admin') {
            fail('Acesso restrito.', 403);
        }
        $f = $_FILES['file'] ?? null;
        if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            fail('Envie PNG, JPEG ou WebP de até 2 MB.');
        }
        if ($f['size'] > 2 * 1024 * 1024) {
            fail('Arquivo muito grande.', 413);
        }
        reply(['image' => storeImage(file_get_contents($f['tmp_name']))]);
    }
    method('GET');
    if (!preg_match('/^[a-zA-Z0-9-]{1,160}$/D', $id)) {
        fail('Imagem não encontrada.', 404);
    }
    $allowed = false;
    try {
        requireAdmin();
        $allowed = true;
    } catch (ApiError) {
    }
    if (!$allowed) {
        $rows = all(
            'SELECT candidate_snapshot FROM elections WHERE closed=0 AND starts_at<=? AND ends_at>?',
            [now(), now()],
        );
        foreach ($rows as $row) {
            foreach (json_decode($row['candidate_snapshot'], true, 64, JSON_THROW_ON_ERROR) as $c) {
                if ($c['image'] === '/api/images/' . $id) {
                    $allowed = true;
                }
            }
        }
    }
    if (!$allowed) {
        try {
            $rows = all(
                'SELECT candidate_snapshot FROM v2_elections WHERE published=1 AND closed=0 AND starts_at<=? AND ends_at>?',
                [now(), now()],
            );
            foreach ($rows as $row) {
                foreach (
                    json_decode($row['candidate_snapshot'], true, 64, JSON_THROW_ON_ERROR)
                    as $c
                ) {
                    if (
                        ($c['image'] ?? '') === '/api/images/' . $id ||
                        ($c['viceImage'] ?? '') === '/api/images/' . $id
                    ) {
                        $allowed = true;
                    }
                }
            }
        } catch (\PDOException $e) {
            if (($e->errorInfo[1] ?? 0) !== 1146) {
                throw $e;
            }
        }
    }
    if (!$allowed) {
        fail('Acesso restrito.', 403);
    }
    $path = ROOT . '/storage/uploads/' . $id;
    if (!is_file($path)) {
        fail('Imagem não encontrada.', 404);
    }
    $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
    if (!in_array($mime, ['image/png', 'image/jpeg', 'image/webp'], true)) {
        fail('Imagem inválida.', 404);
    }
    header('Content-Type: ' . $mime);
    header('Cache-Control: private, max-age=60');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit();
}

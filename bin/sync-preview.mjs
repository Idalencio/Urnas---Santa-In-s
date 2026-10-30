/**
 * Mantém a interface da prévia igual à versão PHP.
 * Os serviços PHP e D1 são diferentes e devem ter suas regras atualizadas em conjunto.
 */
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const folder of ['frontend/app', 'frontend/v2']) {
  cpSync(path.join(root, folder), path.join(root, 'preview', folder), { recursive: true });
}
cpSync(path.join(root, 'frontend/public'), path.join(root, 'preview/public'), { recursive: true });
console.log('Interface e imagens de exemplo sincronizadas com preview/.');

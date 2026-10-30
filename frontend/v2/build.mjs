import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import {
  readdirSync,
  statSync,
  copyFileSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const assets = path.join(root, 'public/assets');
mkdirSync(assets, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['frontend/v2/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  jsx: 'automatic',
  target: ['safari15.4', 'chrome100'],
  outfile: 'public/assets/v2.js',
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'external',
});
copyFileSync(path.join(root, 'frontend/v2/styles.css'), path.join(assets, 'v2.css'));
const classic = readdirSync(assets)
  .filter((f) => /^index-.*\.css$/.test(f))
  .sort(
    (a, b) => statSync(path.join(assets, b)).mtimeMs - statSync(path.join(assets, a)).mtimeMs,
  )[0];
if (!classic) throw Error('Compile primeiro a interface original para obter seu CSS.');
const revision = createHash('sha256')
  .update(readFileSync(path.join(assets, 'v2.js')))
  .update(readFileSync(path.join(assets, 'v2.css')))
  .digest('hex')
  .slice(0, 12);
writeFileSync(
  path.join(root, 'public/v2.html'),
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#12358f"><title>Santa Inês · Eleições escolares V2</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/' +
    classic +
    '"><link rel="stylesheet" href="/assets/v2.css?r=' +
    revision +
    '"><script defer src="/assets/v2.js?r=' +
    revision +
    '"></script></head><body><div id="root"></div><noscript>Ative o JavaScript para usar a urna.</noscript></body></html>',
);
console.log('V2 compilada em public/.');

import { createRequire } from 'node:module';
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('wrangler')] }));
await build({
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
copyFileSync('frontend/v2/styles.css', 'public/assets/v2.css');
const revision = createHash('sha256')
  .update(readFileSync('public/assets/v2.js'))
  .update(readFileSync('public/assets/v2.css'))
  .digest('hex')
  .slice(0, 12);
const classic = readdirSync('public/assets').find((f) => /^index-.*\.css$/.test(f));
const html =
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#12358f"><title>Santa Inês · Urna V2 · Testes</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/assets/' +
  classic +
  '"><link rel="stylesheet" href="/assets/v2.css?r=' +
  revision +
  '"><script defer src="/assets/v2.js?r=' +
  revision +
  '"></script></head><body><div id="root"></div><noscript>Ative o JavaScript para usar a urna.</noscript></body></html>';
writeFileSync(
  'lib/demo-html.ts',
  'export const html=' +
    JSON.stringify(html) +
    ';\nexport function documentResponse(){return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})}\n',
);

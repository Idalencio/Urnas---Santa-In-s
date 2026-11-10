import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
let called = 0;
globalThis.__HEADER_QA_HANDLER = {
  fetch(req) {
    called++;
    return new Response(req.url.includes('/api/') ? '{}' : '<!doctype html><title>QA</title>', {
      headers: {
        'Content-Type': req.url.includes('/api/') ? 'application/json' : 'text/html',
        'Cache-Control': 'public,max-age=86400',
      },
    });
  },
};
let source = readFileSync('worker/index.ts', 'utf8')
  .replace(
    "import handler from 'vinext/server/fetch-handler';",
    'const handler=(globalThis as any).__HEADER_QA_HANDLER;',
  )
  .replace(
    "import { runWithConnectorBinding } from '../lib/connector-context';",
    'const runWithConnectorBinding=(_binding:any,fn:()=>any)=>fn();',
  )
  .replace(
    "import type { ConnectorBinding } from '../lib/connector-contract.mjs';",
    'type ConnectorBinding=any;',
  )
  .replace('import.meta.env.DEV', 'false');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { default: worker } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
let passed = 0;
function ok(c, m) {
  assert.ok(c, m);
  passed++;
}
for (const path of [
  '/.env',
  '/.git/config',
  '/config/config.php',
  '/storage/uploads/id',
  '/assets/source.js.map',
  '/%2eenv',
  '/%63onfig/config.php',
  '/%252eenv',
]) {
  const before = called,
    r = await worker.fetch(new Request('https://teste.example' + path), {}, { props: {} });
  ok(r.status === 404 && called === before, 'Arquivo interno bloqueado ' + path);
}
let r = await worker.fetch(new Request('https://teste.example/v2'), {}, { props: {} });
ok(
  r.headers.get('Content-Security-Policy').includes("script-src 'self'") &&
    !r.headers.get('Content-Security-Policy').includes("script-src 'self' 'unsafe-inline'"),
  'Scripts limitados à origem',
);
ok(
  r.headers.get('Content-Security-Policy').includes('https://chatgpt.com'),
  'Exibição privada do ChatGPT preservada',
);
ok(
  r.headers.get('Referrer-Policy') === 'no-referrer' &&
    r.headers.get('X-Content-Type-Options') === 'nosniff',
  'Cabeçalhos de referência e tipo',
);
ok(
  r.headers.get('Permissions-Policy').includes('camera=()') &&
    r.headers.get('Cross-Origin-Resource-Policy') === 'same-origin',
  'Recursos do navegador restritos',
);
ok(r.headers.get('Strict-Transport-Security') === 'max-age=31536000', 'HTTPS com HSTS');
r = await worker.fetch(new Request('https://teste.example/api/v2/app'), {}, { props: {} });
ok(r.headers.get('Cache-Control') === 'no-store', 'Dados da API não entram em cache');
r = await worker.fetch(new Request('http://teste.example/v2'), {}, { props: {} });
ok(!r.headers.has('Strict-Transport-Security'), 'Prévia HTTP local sem HSTS');
console.log(`Proteção HTTP: ${passed} verificações aprovadas.`);

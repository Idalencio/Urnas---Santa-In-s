import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const module = transformSync(
  readFileSync(new URL('../frontend/app/csv.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'esm' },
).code;
const { csvCell } = await import(
  'data:text/javascript;base64,' + Buffer.from(module).toString('base64')
);
let count = 0;
for (const value of [
  '=WEBSERVICE("https://ficticio.example")',
  '+1',
  '-1',
  '@SUM(A1)',
  '\t=1',
  '\r=1',
  '\n=1',
  '  =1',
  '\uFEFF=1',
]) {
  assert.ok(csvCell(value).startsWith('"\''));
  count++;
}
for (const [value, expected] of [
  ['José', '"José"'],
  ['00123', '"00123"'],
  ['A;B', '"A;B"'],
  ['"nome"', '"""nome"""'],
  [12, '"12"'],
  [null, '""'],
]) {
  assert.equal(csvCell(value), expected);
  count++;
}
console.log(`Exportação segura: ${count} verificações aprovadas.`);

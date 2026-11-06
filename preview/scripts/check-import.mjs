import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import assert from 'node:assert/strict';
const sql = new DatabaseSync(':memory:');
for (const f of readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sql.exec(readFileSync('drizzle/' + f, 'utf8'));
class Statement {
  constructor(q, args = []) {
    this.q = q;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.q, args);
  }
  async first() {
    return sql.prepare(this.q).get(...this.args) || null;
  }
  async run() {
    const result = sql.prepare(this.q).run(...this.args);
    return { meta: { changes: Number(result.changes) } };
  }
}
globalThis.__DEMO_TEST_ENV = {
  DB: { prepare: (q) => new Statement(q) },
  DEMO_PASSWORD: 'SenhaFicticiaQA!42',
};
let source = readFileSync('lib/demo-api.ts', 'utf8')
  .replace(/import\s*\{\s*env\s+as\s+bindings\s*\}\s*from\s*['"]cloudflare:workers['"];?/, '')
  .replace(
    /const\s+env\s*=\s*bindings\s+as\s+any;/,
    'const env=(globalThis as any).__DEMO_TEST_ENV;',
  );
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { endpoint } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
let cookie = '',
  panel = '',
  passed = 0;
async function call(path, body, auth = true) {
  const headers = {};
  if (body !== undefined) {
    headers['Origin'] = 'https://teste.example';
    headers['Content-Type'] = 'application/json';
  }
  if (auth && cookie) {
    headers.Cookie = cookie;
    headers['X-Urna-Panel'] = panel;
  }
  const r = await endpoint(
    new Request('https://teste.example' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: r.status, body: await r.json(), headers: r.headers };
}
function ok(condition, name) {
  assert.ok(condition, name);
  passed++;
}
const app = async (action, payload = {}) => call('/api/v2/app', { action, ...payload });
let r = await call('/api/auth', {
  action: 'login',
  username: 'admin',
  password: 'SenhaFicticiaQA!42',
});
assert.equal(r.status, 200);
cookie = r.headers.get('set-cookie').split(';')[0];
panel = r.body.panelKey;

const current = async () => (await call('/api/v2/app')).body;
const csv = (rows) => 'nome;turma;matricula\n' + rows.map((row) => row.join(';')).join('\n') + '\n';
const initial = await current(),
  seed = initial.elections[0];
const initialRoster = (await app('electors', { electionId: seed.id })).body.rows;
const initialCount = initial.students.length;
let file = csv([
  ['Original', 'Import A', 'IM001'],
  ['Igual', 'Import A', 'IM002'],
  ['Inativo', 'Import A', 'IM003'],
]);
r = await app('csvImport', { csv: file });
ok(r.status === 200 && r.body.summary.added === 3, 'Primeira importação adiciona matrículas novas');
await app('deleteStudent', { matricula: 'IM003', className: 'Import A' });
file = csv([
  ['Corrigido', 'Import B', 'IM001'],
  ['Igual', 'Import A', 'IM002'],
  ['Reativado', 'Import B', 'IM003'],
  ['Novo', 'Import B', 'IM004'],
]);
const before = (await current()).students;
r = await app('csvPreview', { csv: file });
ok(
  r.status === 200 &&
    JSON.stringify(r.body.summary) ===
      JSON.stringify({ added: 1, updated: 1, unchanged: 1, reactivated: 1 }),
  'Prévia compara novos, alterados, iguais e inativos',
);
ok(
  r.body.rows.map((x) => x.change).join(',') === 'updated,unchanged,reactivated,added',
  'Situação individual de cada matrícula',
);
ok(
  JSON.stringify((await current()).students) === JSON.stringify(before),
  'Prévia não modifica cadastro',
);
r = await app('csvImport', { csv: file });
ok(
  r.status === 200 &&
    JSON.stringify(r.body.summary) ===
      JSON.stringify({ added: 1, updated: 1, unchanged: 1, reactivated: 1 }),
  'Resultado real confirma as quatro situações',
);
let after = await current();
ok(
  after.students.length === initialCount + 4 &&
    new Set(after.students.map((x) => x.matricula)).size === after.students.length,
  'Uma linha por matrícula após atualização',
);
ok(
  after.students.find((x) => x.matricula === 'IM001').name === 'Corrigido' &&
    after.students.find((x) => x.matricula === 'IM001').className === 'Import B',
  'Mesmo aluno tem nome e turma atualizados',
);
ok(
  after.students.filter((x) => x.matricula === 'IM003').length === 1,
  'Reativação recupera a matrícula sem duplicar',
);
r = await app('csvImport', { csv: file });
ok(
  r.status === 200 &&
    r.body.summary.unchanged === 4 &&
    r.body.summary.added === 0 &&
    r.body.summary.updated === 0,
  'Reimportar o mesmo arquivo mantém os quatro alunos',
);
ok(
  (await app('csvImport', { csv: csv([['Novo', 'Import B', 'IM005']]) })).body.summary.added === 1,
  'Mesmo nome com outra matrícula é outro aluno',
);
const stable = (await current()).students;
const invalid = csv([
  ['Primeiro', 'Import A', 'IM004'],
  ['Repetido', 'Import B', ' IM004 '],
]);
ok(
  (await app('csvPreview', { csv: invalid })).status === 400 &&
    (await app('csvImport', { csv: invalid })).status === 400,
  'Duplicidade dentro do arquivo é recusada',
);
ok(
  JSON.stringify((await current()).students) === JSON.stringify(stable),
  'Arquivo com duplicidade não altera ninguém',
);
await app('csvImport', {
  csv: csv([
    ['Zeros', 'Import A', '00101'],
    ['Sem zeros', 'Import A', '101'],
  ]),
});
ok(
  (await current()).students.some((x) => x.matricula === '00101') &&
    (await current()).students.some((x) => x.matricula === '101'),
  'Zeros à esquerda fazem parte da identidade',
);
await app('csvPreview', { csv: csv([['Novo', 'Import B', 'IM004']]) });
await app('student', {
  value: {
    originalMatricula: 'IM004',
    matricula: 'IM004',
    name: 'Mudou depois da prévia',
    className: 'Import B',
  },
});
r = await app('csvImport', { csv: csv([['Novo', 'Import B', 'IM004']]) });
ok(
  r.body.summary.updated === 1 && r.body.summary.unchanged === 0,
  'Gravação compara novamente após uma prévia antiga',
);
ok(
  (await current()).students.some((x) => x.matricula === 'IM005'),
  'Ausentes do arquivo permanecem no cadastro',
);
await app('renameClass', { from: 'Import A', name: 'Import C' });
r = await app('csvPreview', { csv: csv([['Igual', 'Import A', 'IM002']]) });
ok(
  r.body.rows[0].className === 'Import C' && r.body.summary.unchanged === 1,
  'Nomes históricos de turma resolvidos antes da comparação',
);
const shared = csv([['Concorrente', 'Import C', 'IMCONC']]);
const both = await Promise.all([
  app('csvImport', { csv: shared }),
  app('csvImport', { csv: shared }),
]);
ok(
  both.every((x) => x.status === 200) &&
    both.reduce((n, x) => n + x.body.summary.added, 0) === 1 &&
    both.reduce((n, x) => n + x.body.summary.unchanged, 0) === 1,
  'Importações simultâneas recalculam resultado sem duplicar',
);
ok(
  (await current()).students.filter((x) => x.matricula === 'IMCONC').length === 1,
  'Concorrência deixa só um aluno',
);
await app('csvImport', { csv: csv([['Cadastro atual', 'Import C', '1001']]) });
ok(
  JSON.stringify((await app('electors', { electionId: seed.id })).body.rows) ===
    JSON.stringify(initialRoster),
  'Cadastro geral não reescreve eleitorado publicado',
);
console.log(`Importação comparada: ${passed} verificações aprovadas.`);

import { imageSize } from 'image-size';
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
  async all() {
    return { results: sql.prepare(this.q).all(...this.args) };
  }
  async first() {
    return sql.prepare(this.q).get(...this.args) || null;
  }
  async run() {
    const result = sql.prepare(this.q).run(...this.args);
    return { meta: { changes: Number(result.changes) } };
  }
}
globalThis.__URNA_IMAGE_SIZE = imageSize;
globalThis.__DEMO_TEST_ENV = {
  DB: {
    prepare: (q) => new Statement(q),
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.run());
        sql.exec('COMMIT');
        return results;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  },
  DEMO_PASSWORD: 'SenhaFicticiaQA!42',
};
let source = readFileSync('lib/demo-api.ts', 'utf8')
  .replace(
    "import { imageSize } from 'image-size';",
    'const imageSize=(globalThis as any).__URNA_IMAGE_SIZE;',
  )
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
// Mesma política de completude exercitada no serviço PHP, usando apenas nomes fictícios.
const full = csv([
  ['João Pedro da Silva', 'Completa A', 'CM001'],
  ['Maria Silva', 'Completa A', 'CM002'],
]);
await app('csvImport', { csv: full });
const partial = csv([
  ['Joao P. Silva', '', 'CM001'],
  ['Maria de Souza Silva', 'Completa B', 'CM002'],
]);
r = await app('csvPreview', { csv: partial });
ok(
  r.status === 200 &&
    r.body.rows[0].name === 'João Pedro da Silva' &&
    r.body.rows[0].className === 'Completa A' &&
    r.body.rows[0].change === 'unchanged',
  'Prévia mantém nome completo e turma vazia',
);
ok(
  r.body.preservedCount === 1 && r.body.rows[0].keptExisting.join(',') === 'name,className',
  'Prévia identifica dados preservados',
);
ok(
  r.body.rows[1].name === 'Maria de Souza Silva' &&
    r.body.rows[1].className === 'Completa B' &&
    r.body.rows[1].change === 'updated',
  'Prévia permite enriquecer nome e mudar turma',
);
r = await app('csvImport', { csv: partial });
ok(r.status === 200 && r.body.preservedCount === 1, 'Gravação confirma dados preservados');
let merged = (await current()).students;
ok(
  merged.find((x) => x.matricula === 'CM001').name === 'João Pedro da Silva' &&
    merged.find((x) => x.matricula === 'CM001').className === 'Completa A',
  'Nome completo e acentos sobrevivem à lista abreviada',
);
ok(
  merged.find((x) => x.matricula === 'CM002').name === 'Maria de Souza Silva',
  'Nome mais completo do arquivo é aproveitado',
);
r = await app('csvImport', { csv: csv([['João Silva', 'Completa B', 'CM001']]) });
merged = (await current()).students;
ok(
  r.status === 200 &&
    r.body.summary.updated === 1 &&
    merged.find((x) => x.matricula === 'CM001').name === 'João Pedro da Silva' &&
    merged.find((x) => x.matricula === 'CM001').className === 'Completa B',
  'Turma atualiza sem encurtar nome',
);
r = await app('csvImport', { csv: csv([['', '', 'CM001']]) });
ok(
  r.status === 200 && r.body.summary.unchanged === 1 && r.body.preservedCount === 1,
  'Campos vazios existentes não apagam cadastro',
);
r = await app('csvImport', { csv: csv([['JOAO PEDRO DA SILVA', '', 'CM001']]) });
ok(
  r.status === 200 &&
    (await current()).students.find((x) => x.matricula === 'CM001').name === 'João Pedro da Silva',
  'Acentos e apresentação já conferidos são preservados',
);
const completeBefore = (await current()).students;
const incomplete = csv([
  ['Válido', 'Completa A', 'CMNEW'],
  ['', '', 'CMINVALID'],
]);
ok(
  (await app('csvPreview', { csv: incomplete })).status === 400 &&
    (await app('csvImport', { csv: incomplete })).status === 400,
  'Aluno novo incompleto recusado na prévia e confirmação',
);
ok(
  JSON.stringify((await current()).students) === JSON.stringify(completeBefore),
  'Linha incompleta não grava parcialmente',
);
await app('deleteStudent', { matricula: 'CM001', className: 'Completa B' });
r = await app('csvImport', { csv: csv([['', '', 'CM001']]) });
ok(
  r.status === 200 &&
    r.body.summary.reactivated === 1 &&
    (await current()).students.find((x) => x.matricula === 'CM001').name === 'João Pedro da Silva',
  'Reativação reaproveita cadastro completo',
);
const concurrentFiles = [
  csv([['Ana C.', 'Completa A', 'CMCONC']]),
  csv([['Ana Carolina Oliveira', 'Completa A', 'CMCONC']]),
];
const mergedResponses = await Promise.all(concurrentFiles.map((csv) => app('csvImport', { csv })));
ok(
  mergedResponses.every((x) => x.status === 200) &&
    (await current()).students.find((x) => x.matricula === 'CMCONC').name ===
      'Ana Carolina Oliveira',
  'Listas concorrentes mantêm o nome completo',
);
ok(
  (await current()).students.filter((x) => x.matricula === 'CMCONC').length === 1,
  'Mescla concorrente mantém matrícula única',
);
console.log(`Importação comparada: ${passed} verificações aprovadas.`);

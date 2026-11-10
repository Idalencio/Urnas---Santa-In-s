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
const initial = await current(),
  published = initial.elections[0];
const create = async () => (await app('duplicate', { electionId: published.id })).body.id;
const remove = (id) => app('deleteElection', { electionId: id });
ok((await remove(published.id)).status === 409, 'Publicada não pode ser excluída');
const id = await create();
await app('enroll', { electionId: id, classes: ['6A'] });
const value = {
  name: 'Equipe exclusão',
  username: 'exclusao.qa',
  password: 'TesteExcluir!123',
  role: 'staff',
  active: 1,
  permissions: [],
  classes: null,
  electionIds: [id],
};
const uid = (await app('account', { value })).body.id;
const adminSession = { cookie, panel };
r = await call(
  '/api/auth',
  { action: 'login', username: value.username, password: value.password },
  false,
);
const teamSession = { cookie: r.headers.get('set-cookie').split(';')[0], panel: r.body.panelKey };
async function teamRemove(target) {
  const prev = { cookie, panel };
  cookie = teamSession.cookie;
  panel = teamSession.panel;
  try {
    return await remove(target);
  } finally {
    cookie = prev.cookie;
    panel = prev.panel;
  }
}
ok((await teamRemove(id)).status === 403, 'Sem permissão não exclui nem eleição atribuída');
await app('account', {
  value: { ...value, id: uid, password: '', permissions: ['manageElections'] },
});
const foreign = await create();
ok((await teamRemove(foreign)).status === 403, 'Permissão não libera eleição alheia');
const before = await current();
ok((await teamRemove(id)).status === 200, 'Equipe autorizada exclui rascunho atribuído');
let after = await current();
ok(!after.elections.some((e) => e.id === id), 'Rascunho removido do painel');
ok(!after.accounts.find((a) => a.id === uid).electionIds.includes(id), 'Atribuição removida');
ok(
  JSON.stringify(after.students) === JSON.stringify(before.students),
  'Cadastro de alunos preservado',
);
ok(
  JSON.stringify(after.terminals) === JSON.stringify(before.terminals),
  'Urnas compartilhadas preservadas',
);
ok(
  JSON.stringify(after.elections.find((e) => e.id === published.id)) ===
    JSON.stringify(before.elections.find((e) => e.id === published.id)),
  'Eleição publicada e resultado preservados',
);
ok((await remove(id)).status === 404, 'Repetição não apaga outra eleição');
ok((await remove('inexistente')).status === 404, 'Identificador desconhecido recusado');
let raw = JSON.parse(sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value);
ok(
  !raw.electors[id] && !raw.elections.some((e) => e.id === id),
  'Eleitorado e candidatos do rascunho removidos',
);
const closed = await create();
await app('close', { electionId: closed });
ok((await remove(closed)).status === 409, 'Encerrada não pode ser excluída');
const inconsistent = await create();
raw = JSON.parse(sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value);
raw.ballots.push({
  id: crypto.randomUUID(),
  electionId: inconsistent,
  candidateId: raw.elections.find((e) => e.id === inconsistent).candidates[0].id,
  kind: 'valid',
});
sql
  .prepare("UPDATE demo_state SET value=?,revision=revision+1 WHERE id='main'")
  .run(JSON.stringify(raw));
ok((await remove(inconsistent)).status === 409, 'Rascunho inconsistente com voto protegido');
const race = await create();
await app('enroll', { electionId: race, classes: ['6A'] });
const outcomes = await Promise.all([
  app('publish', {
    electionId: race,
    models: ['standard'],
    startsAt: new Date(Date.now() - 1000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
  }),
  remove(race),
]);
ok(
  outcomes.filter((r) => r.status === 200).length === 1,
  'Publicar e excluir simultaneamente: apenas uma ação vence',
);
const survivor = (await current()).elections.find((e) => e.id === race);
ok(!survivor || survivor.published === 1, 'Concorrência não deixa rascunho parcialmente removido');
ok((await remove(foreign)).status === 200, 'Administrador exclui rascunho');
console.log(`Exclusão de eleições: ${passed} verificações aprovadas.`);

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

const iso = (n) => new Date(Date.now() + n * 1000).toISOString();
const get = (id, auth = true) => call('/api/v2/tally?election=' + id, undefined, auth);
const need = async (action, data) => {
  const r = await app(action, data);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
async function setup(name, requireMatricula = 1) {
  const { id } = await need('election', {
    value: { name, digits: 3, hasVice: 1, requireMatricula },
  });
  for (const code of ['1', '12', '123'])
    await need('candidate', {
      value: {
        electionId: id,
        name: 'Candidato ' + code,
        code,
        image: '/characters/lion.svg',
        viceName: 'Vice ' + code,
        viceImage: '/characters/owl.svg',
        active: 1,
      },
    });
  return id;
}
const publish = (id, start = -60, end = 3600) =>
  need('publish', { electionId: id, models: ['standard'], startsAt: iso(start), endsAt: iso(end) });
async function vote(id, code, matricula) {
  const body = { action: 'vote', electionId: id, code, requestId: crypto.randomUUID() };
  if (matricula) {
    const r = await call(
      '/api/v2/urna/urna-padrao',
      { action: 'authorize', electionId: id, matricula },
      false,
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    body.gate = r.body.gate;
  }
  const r = await call('/api/v2/urna/urna-padrao', body, false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return body;
}
await need('csvImport', {
  csv: 'nome;turma;matricula\nEleitor privado A;Apuração QA;TAL001\nEleitor privado B;Apuração QA;TAL002\n',
});
const eid = await setup('Apuração QA');
await need('enroll', { electionId: eid, classes: ['Apuração QA'] });
ok((await get(eid)).status === 409, 'Rascunho sem apuração');
await publish(eid);
ok((await get(eid, false)).status === 401, 'Apuração exige login');
const savedPanel = panel;
panel = '';
ok((await get(eid)).status === 401, 'Apuração exige chave do painel');
panel = savedPanel;
ok((await call('/api/v2/tally?election=' + eid, {})).status === 405, 'Método de escrita recusado');
r = await get(eid);
let d = r.body;
ok(
  r.status === 200 &&
    d.election.status === 'active' &&
    r.headers.get('Cache-Control') === 'no-store',
  'Apuração aberta e sem cache',
);
ok(
  d.candidates.length === 3 &&
    d.candidates.every((c) => c.votes === 0 && c.viceName && c.viceImage),
  'Três candidatos e vices, inclusive sem votos',
);
ok(
  JSON.stringify(d.totals) === JSON.stringify({ votes: 0, eligible: 2, voted: 0 }),
  'Totais iniciais coerentes',
);
const first = await vote(eid, '1', 'TAL001');
d = (await get(eid)).body;
ok(
  d.totals.votes === 1 &&
    d.totals.eligible === 2 &&
    d.totals.voted === 1 &&
    d.candidates.find((c) => c.code === '1').votes === 1,
  'Novo voto aparece na consulta seguinte',
);
assert.equal((await call('/api/v2/urna/urna-padrao', first, false)).status, 200);
ok((await get(eid)).body.totals.votes === 1, 'Reenvio idempotente não duplica apuração');
await vote(eid, '12', 'TAL002');
d = (await get(eid)).body;
ok(
  d.candidates
    .map((c) => c.votes)
    .sort()
    .join() === '0,1,1' && d.totals.voted === 2,
  'Empate mantém votos de ambos',
);
ok(
  ['TAL001', 'TAL002', 'Eleitor privado', 'matricula', 'gate', 'students', 'electors'].every(
    (x) => !JSON.stringify(d).includes(x),
  ),
  'Sem identificação individual de eleitores',
);
ok(Number.isFinite(Date.parse(d.generatedAt)), 'Data da consulta informada');
const second = await setup('Apuração independente', 0);
await publish(second);
await vote(second, '123');
ok(
  (await get(second)).body.totals.votes === 1 && (await get(eid)).body.totals.votes === 2,
  'Eleição separada, mesma urna',
);
const account = {
  name: 'Consulta apuração',
  username: 'tally.qa',
  role: 'staff',
  active: 1,
  permissions: [],
  classes: [],
  electionIds: [eid],
  password: 'SenhaApuracaoQA!42',
};
const { id: aid } = await need('account', { value: account });
const adminCookie = cookie,
  adminPanel = panel;
r = await call(
  '/api/auth',
  { action: 'login', username: account.username, password: account.password },
  false,
);
assert.equal(r.status, 200);
cookie = r.headers.get('set-cookie').split(';')[0];
panel = r.body.panelKey;
const staffCookie = cookie,
  staffPanel = panel;
ok((await get(eid)).status === 403, 'Sem permissão de resultados é bloqueado');
cookie = adminCookie;
panel = adminPanel;
await need('account', {
  value: { ...account, id: aid, password: '', permissions: ['viewResults'] },
});
cookie = staffCookie;
panel = staffPanel;
ok((await get(eid)).status === 200, 'Permissão libera eleição atribuída');
ok((await get(second)).status === 403, 'Permissão não libera eleição alheia');
cookie = adminCookie;
panel = adminPanel;
await need('account', { value: { ...account, id: aid, password: '', permissions: [] } });
cookie = staffCookie;
panel = staffPanel;
ok((await get(eid)).status === 403, 'Revogação vale na consulta seguinte');
cookie = adminCookie;
panel = adminPanel;
await need('close', { electionId: eid });
const final = (await get(eid)).body;
ok(
  final.election.status === 'closed' && final.totals.votes === 2,
  'Encerrada mostra o resultado final',
);
ok(
  JSON.stringify((await get(eid)).body.candidates) === JSON.stringify(final.candidates) &&
    (await get(eid)).body.totals.votes === 2,
  'Consulta final não muda votos',
);
const scheduled = await setup('Apuração agendada', 0);
await publish(scheduled, 60);
ok(
  (await get(scheduled)).body.election.status === 'scheduled' &&
    (await get(scheduled)).body.totals.votes === 0,
  'Eleição agendada sem votos',
);
const expired = await setup('Apuração encerramento por horário', 0);
await publish(expired, -60, 1);
const realNow = Date.now;
Date.now = () => realNow() + 2000;
try {
  ok(
    (await get(expired)).body.election.status === 'closed',
    'Encerramento pelo horário reconhecido',
  );
} finally {
  Date.now = realNow;
}
ok((await get(crypto.randomUUID())).status === 404, 'Eleição desconhecida recusada');
console.log(`Apuração D1: ${passed} verificações aprovadas.`);

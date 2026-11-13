// Seis eleições em urnas compartilhadas, com dados inteiramente fictícios.
import { imageSize } from 'image-size';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import assert from 'node:assert/strict';
const directory = mkdtempSync(path.join(tmpdir(), 'urna-multi-'));
const databasePath = path.join(directory, 'test.sqlite');
const sql = new DatabaseSync(databasePath);
process.on('exit', () => {
  try {
    sql.close();
  } catch {}
  rmSync(directory, { recursive: true, force: true });
});
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
const adminSession = { cookie, panel };
// Cenários completos com alunos fictícios em SQLite descartável.
const iso = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
async function need(action, payload = {}) {
  const r = await app(action, payload);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

const className = 'Paralelas QA D1';
const matriculas = Array.from({ length: 13 }, (_, i) => 'PARD1' + String(i + 1).padStart(3, '0'));
await need('csvImport', {
  csv:
    'nome;turma;matricula\n' +
    matriculas
      .slice(0, 12)
      .map((m, i) => `Aluno paralelo ${i + 1};${className};${m}`)
      .join('\n'),
});
const codes = ['1', '7', '12', '45', '80', '123'];
const ids = [];
for (let i = 0; i < 6; i++) {
  const { id } = await need('election', {
    value: { name: `Paralelas QA D1 ${i + 1}`, digits: 3, hasVice: 1, requireMatricula: 1 },
  });
  ids.push(id);
  for (let j = 0; j < codes.length; j++) {
    await need('candidate', {
      value: {
        electionId: id,
        name: `Candidato ${i + 1}.${j + 1}`,
        code: codes[j],
        image: '/characters/lion.svg',
        viceName: `Vice ${i + 1}.${j + 1}`,
        viceImage: '/characters/owl.svg',
        active: 1,
      },
    });
  }
  await need('enroll', { electionId: id, classes: [className] });
  await need('publish', {
    electionId: id,
    models: ['standard', 'images'],
    startsAt: iso(-60),
    endsAt: iso(3600),
  });
}
const elections = (await call('/api/v2/app')).body.elections.filter((e) => ids.includes(e.id));
const tokens = ids.map((id) => elections.find((e) => e.id === id).publicToken);
const publicTally = async (token) => {
  const r = await call('/api/v2/public-tally?token=' + token, undefined, false);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const urn = (id, body, model = 'urna-padrao') =>
  call('/api/v2/urna/' + model + (id ? '?election=' + id : ''), body, false);
ok(elections.length === 6, 'Seis eleições publicadas sem substituir umas às outras');
ok(
  elections.every(
    (e) =>
      e.candidateSnapshot.length === 6 &&
      e.candidateSnapshot.every((c) => c.viceName && c.viceImage),
  ),
  'Seis duplas completas em cada eleição',
);
ok(new Set(tokens).size === 6, 'Cada eleição tem link público próprio');
for (const model of ['urna-padrao', 'urna-infantil']) {
  const r = await urn('', undefined, model);
  ok(
    ids.every((id) => r.body.elections.some((e) => e.id === id && e.status === 'active')),
    'As seis abertas aparecem em ' + model,
  );
  ok(r.body.election === null, 'Urna exige escolher entre as eleições: ' + model);
}
const initial = await Promise.all(tokens.map(publicTally));
ok(
  initial.every((r) => r.totals.votes === 0 && r.totals.eligible === 12 && r.totals.voted === 0),
  'Apurações iniciam zeradas e independentes',
);
const gates = [];
for (let i = 0; i < ids.length; i++) {
  const model = ['urna-padrao', 'urna-infantil'][i % 2];
  const r = await urn(
    '',
    { action: 'authorize', electionId: ids[i], matricula: matriculas[0] },
    model,
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
  gates.push({ model, gate: r.body.gate });
}
ok(gates.length === 6, 'Mesma matrícula pode ser liberada nas seis eleições');
ok(new Set(gates.map((r) => r.gate)).size === 6, 'Liberações são diferentes por eleição');
ok(
  (
    await urn('', {
      action: 'vote',
      electionId: ids[0],
      code: codes[0],
      gate: gates[1].gate,
      requestId: crypto.randomUUID(),
    })
  ).status === 403,
  'Liberação de outra eleição é bloqueada',
);
const jobs = ids.map((id, i) => ({
  i,
  ballot: {
    action: 'vote',
    electionId: id,
    code: codes[i],
    gate: gates[i].gate,
    requestId: crypto.randomUUID(),
  },
}));
jobs.push(
  ...Array.from({ length: 11 }, () => ({
    i: 5,
    ballot: { ...jobs[5].ballot, requestId: crypto.randomUUID() },
  })),
);
const cast = async (job) => ({ ...job, response: await urn('', job.ballot, gates[job.i].model) });
const responses = await Promise.all(jobs.map(cast));
ok(
  responses.every((r) => [200, 403].includes(r.response.status)),
  'Votos simultâneos não produzem erro interno',
);
for (let i = 0; i < 6; i++) {
  ok(
    responses.filter((r) => r.i === i && r.response.status === 200).length === 1,
    `Eleição ${i + 1} registra uma única participação na corrida`,
  );
}
const winning = responses.find((r) => r.i === 5 && r.response.status === 200);
const replays = await Promise.all(Array.from({ length: 12 }, () => cast(winning)));
ok(
  replays.every((r) => r.response.status === 200 && r.response.body.duplicate === true),
  'Reenvios concorrentes são idempotentes',
);
const repeats = await Promise.all(
  ids.map((id, i) =>
    urn('', { action: 'authorize', electionId: id, matricula: matriculas[0] }, gates[i].model),
  ),
);
ok(
  repeats.every((r) => r.status === 409),
  'Matrícula já utilizada não libera segunda votação',
);
const extra = [];
for (let i = 0; i < 6; i++) {
  for (let j = 1; j <= i; j++) {
    const r = await urn(
      '',
      { action: 'authorize', electionId: ids[i], matricula: matriculas[j] },
      gates[i].model,
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    extra.push({
      i,
      ballot: {
        action: 'vote',
        electionId: ids[i],
        code: codes[i],
        gate: r.body.gate,
        requestId: crypto.randomUUID(),
      },
    });
  }
}
const additional = await Promise.all(extra.map(cast));
ok(
  additional.every((r) => r.response.status === 200),
  'Quinze votos adicionais concorrentes são confirmados',
);
for (let i = 0; i < 6; i++) {
  const tally = await publicTally(tokens[i]);
  const own = elections
    .find((e) => e.id === ids[i])
    .candidateSnapshot.find((c) => c.code === codes[i]).id;
  ok(
    tally.totals.votes === i + 1 &&
      tally.totals.voted === i + 1 &&
      tally.totals.eligible === 12 &&
      tally.candidates.every((c) => c.votes === (c.id === own ? i + 1 : 0)),
    `Apuração ${i + 1} preserva total, participação e candidato corretos`,
  );
}
const before = (await call('/api/v2/app')).body.students.length;
await need('csvImport', {
  csv: `nome;turma;matricula\nAluno paralelo 1 da Silva;${className};${matriculas[0]}\nNovo aluno paralelo;${className};${matriculas[12]}\n`,
});
const updated = (await call('/api/v2/app')).body;
ok(
  updated.students.length === before + 1 &&
    updated.students.filter((s) => s.className === className).length === 13,
  'Importação parcial mantém os alunos ausentes sem duplicar',
);
const afterImport = await Promise.all(tokens.map(publicTally));
ok(
  afterImport.every(
    (r, i) => r.totals.votes === i + 1 && r.totals.voted === i + 1 && r.totals.eligible === 12,
  ),
  'Importação durante votação preserva as seis listas e os votos',
);
const readState = (db = sql) =>
  JSON.parse(db.prepare("SELECT value FROM demo_state WHERE id='main'").get().value);
const raw = readState();
const ballots = raw.ballots.filter((b) => ids.includes(b.electionId));
ok(
  ballots.length === 21 &&
    ids.every((id, i) => ballots.filter((b) => b.electionId === id).length === i + 1) &&
    ballots.every((b) =>
      raw.elections
        .find((e) => e.id === b.electionId)
        .candidateSnapshot.some((c) => c.id === b.candidateId),
    ),
  'D1 armazena exatamente 21 votos separados pelas seis eleições',
);
ok(
  ids.every(
    (id, i) =>
      raw.electors[id].length === 12 &&
      new Set(raw.electors[id].map((r) => r.matricula)).size === 12 &&
      raw.electors[id].filter((r) => r.voted).length === i + 1,
  ),
  'D1 mantém 72 habilitações e 21 participações sem duplicidade',
);
const students = raw.students.filter((s) => s.className === className);
ok(
  students.length === 13 && new Set(students.map((s) => s.matricula)).size === 13,
  'D1 mantém matrícula única na lista atualizada',
);
ok(
  ballots.every((b) => Object.keys(b).sort().join(',') === 'candidateId,electionId,id,kind'),
  'Votos não armazenam identidade ou matrícula',
);
await need('close', { electionId: ids[0] });
await need('deleteElection', { electionId: ids[0] });
const remaining = (await urn()).body.elections;
ok(
  ids.slice(1).every((id) => remaining.some((e) => e.id === id && e.status === 'active')) &&
    !remaining.some((e) => e.id === ids[0]),
  'Encerrar e excluir uma eleição mantém as outras cinco abertas',
);
const final = await publicTally(tokens[0]);
ok(
  final.election.status === 'closed' && final.totals.votes === 1,
  'Resultado excluído segue preservado no link público',
);
const history = (await call('/api/v2/election-history')).body.rows.filter((e) =>
  ids.includes(e.id),
);
ok(
  history.length === 6 && history.reduce((sum, e) => sum + e.voteCount, 0) === 21,
  'Arquivo administrativo conserva as seis eleições e seus 21 votos',
);
sql.close();
const reopened = new DatabaseSync(databasePath);
try {
  const saved = readState(reopened);
  ok(
    saved.ballots.filter((b) => ids.includes(b.electionId)).length === 21 &&
      ids.every((id, i) => saved.electors[id].filter((r) => r.voted).length === i + 1),
    'Reabrir o banco preserva votos e participação',
  );
  ok(
    reopened.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
    'Integridade física do banco SQLite aprovada',
  );
} finally {
  reopened.close();
}
console.log(
  `Múltiplas eleições D1: ${passed} verificações aprovadas. 6 eleições, 36 duplas, 72 habilitações e 21 votos válidos.`,
);

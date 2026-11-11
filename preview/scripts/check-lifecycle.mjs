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
const adminSession = { cookie, panel };
// Cenários completos com alunos fictícios em SQLite descartável.
const iso = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
async function need(action, payload = {}) {
  const r = await app(action, payload);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
async function login(username, password) {
  const r = await call('/api/auth', { action: 'login', username, password }, false);
  assert.equal(r.status, 200);
  return { cookie: r.headers.get('set-cookie').split(';')[0], panel: r.body.panelKey };
}
async function as(session, fn) {
  const prev = { cookie, panel };
  cookie = session.cookie;
  panel = session.panel;
  try {
    return await fn();
  } finally {
    cookie = prev.cookie;
    panel = prev.panel;
  }
}
await need('csvImport', {
  csv: 'nome;turma;matricula\nAluno privado A;Seleção A;SEL001\nAluna privada B;Seleção A;SEL002\nAluno privado C;Seleção A;SEL003\nOutro privado;Seleção B;SEL004\n',
});
const value = {
  name: 'Organizadora QA',
  username: 'organiza.qa',
  password: 'SenhaOrganiza!42',
  role: 'staff',
  active: 1,
  permissions: ['manageElections'],
  classes: ['Seleção A'],
  electionIds: [],
};
const aid = (await need('account', { value })).id;
const staff = await login(value.username, value.password);
const team = (action, payload) =>
  as(staff, () => (action ? app(action, payload) : call('/api/v2/app')));
const create = { name: 'Eleição completa QA', digits: 3, hasVice: 1, requireMatricula: 1 };
const own = (await team('election', { value: create })).body.id;
assert.ok(own);
ok((await team()).body.me.permissions.length === 4, 'Permissão única sincroniza todas as etapas');
ok((await team()).body.elections.length === 1, 'Equipe vê somente eleição própria');
const foreign = (await need('election', { value: { ...create, name: 'Eleição administrativa' } }))
  .id;
await need('account', { value: { ...value, id: aid, password: '', electionIds: [foreign] } });
ok(
  !(await team()).body.elections.some((e) => e.id === foreign),
  'Atribuição antiga não amplia visibilidade',
);
ok(
  (await team('roster', { electionId: foreign })).status === 403,
  'Lista de eleitores alheia protegida',
);
const roster = (await team('roster', { electionId: own })).body.rows;
ok(
  roster.length === 3 && roster.every((r) => r.className === 'Seleção A'),
  'Seleção mostra apenas turma permitida',
);
ok(
  (await team('enroll', { electionId: own, classes: ['Seleção A'] })).status === 200,
  'Seleciona turma inteira',
);
ok(
  (
    await team('enroll', {
      electionId: own,
      classes: ['Seleção A'],
      matriculas: ['SEL001', 'SEL002', 'SEL002'],
    })
  ).status === 200,
  'Desmarca aluno e ignora duplicidade na seleção',
);
ok(
  (await team('electors', { electionId: own })).body.rows.length === 2,
  'Somente alunos marcados são eleitores',
);
ok(
  (await team('enroll', { electionId: own, classes: ['Seleção A'], matriculas: ['SEL004'] }))
    .status === 403,
  'Não aceita matrícula de outra turma',
);
ok(
  (await team('electors', { electionId: own })).body.rows.length === 2,
  'Falha não altera seleção anterior',
);
ok(
  (await team('enroll', { electionId: own, classes: [], matriculas: [] })).status === 200 &&
    (await team('electors', { electionId: own })).body.rows.length === 0,
  'Pode desmarcar todos no preparo',
);
await team('enroll', { electionId: own, classes: ['Seleção A'], matriculas: ['SEL001', 'SEL003'] });
const images = new Map();
globalThis.__DEMO_TEST_ENV.BUCKET = {
  async put(id, data, options) {
    images.set(id, { body: data, httpMetadata: options.httpMetadata });
  },
  async get(id) {
    return images.get(id) || null;
  },
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iOc0AAAAASUVORK5CYII=';
const photo = (await team('image', { imageData: png })).body.image;
const privatePhoto = (await need('image', { imageData: png })).image;
const photoRead = (path) => endpoint(new Request('https://teste.example' + path));
const c = {
  electionId: own,
  name: 'Candidata QA',
  code: '7',
  active: 1,
  image: photo,
  viceName: 'Vice QA',
  viceImage: '/characters/owl.svg',
};
assert.equal((await team('candidate', { value: c })).status, 200);
const period = {
  electionId: own,
  models: ['standard', 'images'],
  startsAt: iso(120),
  endsAt: iso(3600),
};
ok((await team('publish', period)).status === 200, 'Equipe agenda a própria eleição completa');
let ownState = (await team()).body.elections.find((e) => e.id === own);
const link = ownState.publicToken;
ok(/^[a-f0-9]{64}$/.test(link), 'Link público aleatório por eleição');
const publicGet = () => call('/api/v2/public-tally?token=' + link, undefined, false);
r = await publicGet();
ok(
  r.status === 200 && r.body.election.status === 'scheduled',
  'Apuração pública funciona sem sessão',
);
ok(
  (await photoRead(r.body.candidates[0].image)).status === 200,
  'Foto da apuração agendada é pública apenas pelo link',
);
ok(
  (await photoRead(privatePhoto + '?tally=' + link)).status === 403,
  'Link não abre fotos de outra eleição',
);
ok(
  !JSON.stringify(r.body).includes('SEL001') &&
    !JSON.stringify(r.body).includes('Aluno privado') &&
    !('students' in r.body),
  'Página pública não recebe dados individuais dos alunos',
);
ok(
  (await call('/api/v2/public-tally?token=' + '0'.repeat(64), undefined, false)).status === 404,
  'Link desconhecido é recusado',
);
ok(
  (await call('/api/v2/public-tally?election=' + own, undefined, false)).status === 404,
  'Não enumera apuração pelo ID interno',
);
ok(
  (await call('/api/v2/public-tally?token=' + link, {}, false)).status === 405,
  'Apuração pública não aceita escrita',
);
ok((await call('/api/v2/app', undefined, false)).status === 401, 'Painel continua exigindo login');
ok(
  (await call('/api/v2/election-history', undefined, false)).status === 401,
  'Arquivo administrativo exige login',
);
ok(
  (await as(staff, () => call('/api/v2/election-history'))).status === 403 &&
    (await as(staff, () => call('/api/v2/audit'))).status === 403,
  'Histórico e arquivo exclusivos de administradores',
);
for (const [action, payload] of [
  ['student', { value: { name: 'Negado', matricula: 'X', className: 'Seleção A' } }],
  ['renameClass', { from: 'Seleção A', name: 'Nova' }],
  ['account', { value }],
  ['csvImport', { csv: 'x' }],
  ['deleteStudent', { matricula: 'SEL001' }],
])
  ok((await team(action, payload)).status === 403, 'Organizador não administra ' + action);
ok(
  (await team('election', { value: { ...create, id: own, name: 'Eleição agendada atualizada' } }))
    .status === 200,
  'Agendada permite alterar configuração',
);
const candidateId = ownState.candidates[0].id;
ok(
  (
    await team('candidate', {
      value: {
        ...c,
        id: candidateId,
        code: '8',
        name: 'Candidata atualizada',
        viceName: 'Vice atualizado',
      },
    })
  ).status === 200,
  'Agendada permite alterar candidato e vice',
);
ok(
  (await publicGet()).body.candidates[0].code === '8' &&
    (await publicGet()).body.candidates[0].viceName === 'Vice atualizado',
  'Fotografia pública acompanha edição agendada',
);
ok(
  (await team('enroll', { electionId: own, classes: ['Seleção A'], matriculas: ['SEL001'] }))
    .status === 200,
  'Agendada permite desmarcar alunos',
);
ok(
  (await team('enroll', { electionId: own, classes: [], matriculas: [] })).status === 400 &&
    (await publicGet()).body.totals.eligible === 1,
  'Não deixa eleição agendada inválida sem eleitores',
);
ok(
  (await team('candidate', { value: { ...c, id: candidateId, active: 0 } })).status === 400,
  'Não deixa agendada sem candidato ativo',
);
ok(
  (await team('publish', { ...period, startsAt: iso(180) })).status === 200,
  'Permite reagendar antes da abertura',
);
ok(
  (await team()).body.elections.find((e) => e.id === own).publicToken === link,
  'Reagendamento preserva o link compartilhado',
);
const realNow = Date.now;
Date.now = () => realNow() + 190000;
try {
  ok(
    (await publicGet()).body.election.status === 'active',
    'Apuração acompanha abertura pelo relógio',
  );
  for (const [action, payload] of [
    ['election', { value: { ...create, id: own } }],
    ['candidate', { value: { ...c, id: candidateId } }],
    ['enroll', { electionId: own, classes: ['Seleção A'], matriculas: ['SEL001', 'SEL002'] }],
    ['publish', { ...period, startsAt: iso(30), endsAt: iso(3600) }],
  ])
    ok((await team(action, payload)).status === 409, 'Eleição aberta bloqueia ' + action);
  const terminal = '/api/v2/urna/urna-padrao';
  ok(
    (await call(terminal, { action: 'authorize', electionId: own, matricula: 'SEL003' }, false))
      .status !== 200,
    'Aluno desmarcado não consegue liberar a urna',
  );
  const gate = await call(
    terminal,
    { action: 'authorize', electionId: own, matricula: 'SEL001' },
    false,
  );
  ok(gate.status === 200, 'Aluno selecionado libera a urna');
  const ballot = {
    action: 'vote',
    electionId: own,
    gate: gate.body.gate,
    code: '8',
    requestId: crypto.randomUUID(),
  };
  ok((await call(terminal, ballot, false)).status === 200, 'Voto válido registrado');
  ok(
    (await call(terminal, ballot, false)).status === 200 &&
      (await publicGet()).body.totals.votes === 1,
    'Reenvio não duplica voto na apuração pública',
  );
  ok(
    (await call(terminal, { action: 'authorize', electionId: own, matricula: 'SEL001' }, false))
      .status === 409,
    'Mesmo aluno não vota duas vezes',
  );
  ok(
    (await team('deleteElection', { electionId: own })).status === 409,
    'Votação ativa não pode ser excluída',
  );
  ok(
    (await team('close', { electionId: own })).status === 200,
    'Organizador encerra própria eleição',
  );
  ok(
    (await photoRead((await publicGet()).body.candidates[0].image)).status === 200,
    'Foto continua disponível na apuração encerrada',
  );
  ok(
    (await publicGet()).body.election.status === 'closed' &&
      (await publicGet()).body.totals.votes === 1,
    'Link público mostra resultado final',
  );
  ok(
    (await team('deleteElection', { electionId: own })).status === 200,
    'Organizador exclui eleição encerrada das listas',
  );
  ok(
    !(await team()).body.elections.some((e) => e.id === own) &&
      !(await call('/api/v2/app')).body.elections.some((e) => e.id === own),
    'Excluída sai das listas de trabalho de todos',
  );
  const history = await call('/api/v2/election-history');
  const archived = history.body.rows.find((e) => e.id === own);
  ok(
    history.status === 200 && !!archived.deletedAt && archived.voteCount === 1,
    'Arquivo administrativo preserva exclusão e total de votos',
  );
  ok(
    history.body.rows.some((e) => e.id === foreign && !e.deletedAt),
    'Arquivo também inclui eleições não excluídas',
  );
  ok(
    (await call('/api/v2/tally?election=' + own)).body.totals.votes === 1,
    'Administrador consulta apuração excluída',
  );
  ok(
    (await as(staff, () => call('/api/v2/tally?election=' + own))).status === 403,
    'Eleição excluída deixa de ser gerenciada pela equipe',
  );
  ok(
    (await publicGet()).body.totals.votes === 1,
    'Exclusão não quebra link de resultado final já compartilhado',
  );
  const raw = JSON.parse(sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value);
  ok(
    raw.ballots.filter((b) => b.electionId === own).length === 1 &&
      raw.electors[own][0].voted === 1,
    'Voto e participação são preservados na exclusão',
  );
} finally {
  Date.now = realNow;
}
const cancelled = (
  await team('election', {
    value: { name: 'Agendamento cancelado', digits: 2, hasVice: 0, requireMatricula: 0 },
  })
).body.id;
await team('candidate', {
  value: { electionId: cancelled, name: 'Candidato cancelado', code: '1', active: 1 },
});
await team('publish', {
  electionId: cancelled,
  models: ['standard'],
  startsAt: iso(60),
  endsAt: iso(3600),
});
const cancelledLink = (await team()).body.elections.find((e) => e.id === cancelled).publicToken;
ok(
  (await team('deleteElection', { electionId: cancelled })).status === 200,
  'Pode excluir agendada sem votos',
);
Date.now = () => realNow() + 90000;
try {
  ok(
    (await call('/api/v2/urna/urna-padrao?election=' + cancelled, undefined, false)).status === 409,
    'Agendada excluída não reabre pelo endereço antigo',
  );
  ok(
    (
      await call(
        '/api/v2/urna/urna-padrao',
        { action: 'vote', electionId: cancelled, code: '1', requestId: crypto.randomUUID() },
        false,
      )
    ).status === 409,
    'Agendada excluída não recebe voto após horário original',
  );
  ok(
    (await call('/api/v2/public-tally?token=' + cancelledLink, undefined, false)).body.election
      .status === 'closed',
    'Link de agendamento excluído mostra apuração encerrada',
  );
} finally {
  Date.now = realNow;
}
console.log(`Ciclo da eleição D1: ${passed} verificações aprovadas.`);

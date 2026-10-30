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
const adminSession = { cookie, panel };
const bulk =
  'nome;turma;matricula\nAluna A;Equipe A;EQ001\nAluno B;Equipe A;EQ002\nAluna C;Equipe B;EQ003\n';
ok((await app('csvImport', { csv: bulk })).status === 200, 'Importar todas as turmas');
ok(
  (await call('/api/v2/app')).body.classes.find((c) => c.name === 'Equipe A').count === 2,
  'Classes agrupadas e contadas',
);
await app('csvImport', { csv: 'nome;turma;matricula\nAluna A atualizada;Equipe A;EQ001\n' });
ok(
  (await call('/api/v2/app')).body.classes.find((c) => c.name === 'Equipe A').count === 2,
  'Reimportar não duplica',
);
const value = {
  name: 'Equipe QA',
  username: 'equipe.qa',
  password: 'EquipeSeguro!123',
  role: 'staff',
  active: 1,
  permissions: [],
  classes: ['Equipe A'],
  electionIds: [],
};
r = await app('account', { value });
ok(r.status === 200, 'Admin cria conta sem permissões');
value.id = r.body.id;
value.password = '';
async function withSession(session, fn) {
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
r = await call(
  '/api/auth',
  { action: 'login', username: 'equipe.qa', password: 'EquipeSeguro!123' },
  false,
);
ok(r.status === 200, 'Login da equipe');
const teamSession = { cookie: r.headers.get('set-cookie').split(';')[0], panel: r.body.panelKey };
const team = async (action, payload = {}) =>
  withSession(teamSession, () => (action ? app(action, payload) : call('/api/v2/app')));
let st = (await team()).body;
ok(
  st.classes.length === 1 &&
    st.classes[0].name === 'Equipe A' &&
    st.students.length === 0 &&
    st.accounts.length === 0 &&
    st.elections.length === 0,
  'Equipe só vê turmas permitidas',
);
ok(
  !JSON.stringify((await call('/api/v2/app')).body.accounts).includes('password'),
  'Hashes e senhas não expostos',
);
ok(
  (await team('election', { value: { name: 'Negada', digits: 5 } })).status === 403,
  'Sem permissão não cria eleição',
);
ok(
  (await team('csvImport', { csv: bulk })).status === 403 &&
    (await team('csvPreview', { csv: bulk })).status === 403,
  'Só admin importa',
);
ok((await team('account', { value })).status === 403, 'Equipe não eleva privilégios');
value.permissions = ['manageElections', 'manageVoters'];
assert.equal((await app('account', { value })).status, 200);
ok(
  (await team()).body.me.permissions.includes('manageElections'),
  'Sessão reflete permissões novas',
);
r = await team('election', {
  value: { name: 'Eleição da equipe', digits: 5, hasVice: 1, requireMatricula: 1 },
});
ok(r.status === 200, 'Equipe cria eleição própria');
const eid = r.body.id;
ok((await team()).body.elections.length === 1, 'Eleição de outra equipe não é exposta');
const foreign = (await call('/api/v2/app')).body.elections.find((e) => e.id !== eid);
ok(
  (await team('electors', { electionId: foreign.id })).status === 403 &&
    (await team('candidate', { value: { electionId: foreign.id } })).status === 403 &&
    (await team('duplicate', { electionId: foreign.id })).status === 403,
  'Acesso direto a eleição alheia bloqueado',
);
ok(
  (await team('enroll', { electionId: eid, classes: [] })).status === 403,
  'Sem turma explícita não seleciona tudo',
);
ok(
  (await team('enroll', { electionId: eid, classes: ['Equipe B'] })).status === 403,
  'Turma não autorizada recusada',
);
ok(
  (await team('enroll', { electionId: eid, classes: ['Equipe A'] })).status === 200,
  'Escolher turma autorizada',
);
st = (await team('electors', { electionId: eid })).body;
ok(
  st.rows.length === 2 && st.rows.every((r) => r.matricula.startsWith('EQ')),
  'Alunos do cadastro geral vinculados',
);
ok(
  (await team()).body.elections[0].electorClasses[0] === 'Equipe A',
  'Seleção de turma persistida',
);
ok(
  (
    await team('candidate', {
      value: {
        electionId: eid,
        name: 'Leão QA',
        code: '1',
        image: '/characters/lion.svg',
        viceName: 'Coruja QA',
        viceImage: '/characters/owl.svg',
        active: 1,
      },
    })
  ).status === 200,
  'Editar candidatos permitido',
);
const period = {
  electionId: eid,
  models: ['standard', 'images'],
  startsAt: new Date(Date.now() - 5000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
};
ok((await team('publish', period)).status === 403, 'Publicar sem permissão recusado');
value.permissions.push('publishElections');
assert.equal((await app('account', { value })).status, 200);
ok((await team('publish', period)).status === 200, 'Admin libera publicação');
ok((await team()).body.elections[0].results.length === 0, 'Resultados escondidos');
value.permissions.push('viewResults');
await app('account', { value });
ok((await team()).body.elections[0].results.length === 1, 'Resultados liberados separadamente');
value.permissions = [];
await app('account', { value });
ok(
  (await team('close', { electionId: eid })).status === 403 &&
    (await team('electors', { electionId: eid })).status === 403,
  'Revogação imediata na sessão existente',
);
value.permissions = ['manageVoters'];
value.electionIds = [foreign.id];
await app('account', { value });
ok(
  (await team()).body.elections.some((e) => e.id === foreign.id),
  'Admin atribui eleição existente',
);
ok(
  (await team('electors', { electionId: foreign.id })).body.rows.length === 0,
  'Não expõe eleitores de outras turmas',
);
value.classes = null;
await app('account', { value });
ok(
  (await team()).body.classes.length === (await call('/api/v2/app')).body.classes.length,
  'Acesso explícito a todas as turmas',
);
value.active = 0;
await app('account', { value });
ok(
  (await team()).status === 401 &&
    (
      await call(
        '/api/auth',
        { action: 'login', username: value.username, password: 'EquipeSeguro!123' },
        false,
      )
    ).status === 401,
  'Desativar conta encerra acesso',
);
value.active = 1;
value.password = 'NovaEquipeSeguro!123';
await app('account', { value });
ok(
  (
    await call(
      '/api/auth',
      { action: 'login', username: value.username, password: 'EquipeSeguro!123' },
      false,
    )
  ).status === 401,
  'Senha antiga inválida após redefinição',
);
r = await call(
  '/api/auth',
  { action: 'login', username: value.username, password: value.password },
  false,
);
ok(r.status === 200, 'Senha nova funciona');
ok(
  (await app('account', { value: { ...value, id: '' } })).status === 400,
  'Usuário duplicado recusado',
);
const owner = (await call('/api/v2/app')).body.accounts.find((a) => a.owner);
ok(
  (await app('account', { value: { ...owner, active: 0 } })).status === 400,
  'Administrador principal protegido',
);
// Browser sessions bind both app account and trusted private Site identity.
async function visitor(path, body, key = '') {
  const response = await endpoint(
    new Request('https://teste.example' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'https://teste.example',
        'Content-Type': 'application/json',
        'oai-authenticated-user-id': 'staff-browser',
        'X-Urna-Panel': key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}
r = await visitor('/api/auth', {
  action: 'login',
  username: value.username,
  password: value.password,
});
ok(r.status === 200, 'Equipe autentica no navegador privado');
const vk = r.body.panelKey;
ok(
  (await visitor('/api/v2/app', undefined, vk)).body.me.role === 'staff',
  'Identidade nativa não eleva equipe para admin',
);
r = await visitor(
  '/api/auth',
  {
    action: 'password',
    currentPassword: value.password,
    newPassword: 'SenhaPessoalQA!42',
    confirmPassword: 'SenhaPessoalQA!42',
  },
  vk,
);
ok(r.status === 200, 'Equipe altera própria senha');
ok(
  (await visitor('/api/v2/app', undefined, vk)).status === 401,
  'Senha pessoal encerra sessões antigas',
);
ok(
  (await visitor('/api/v2/app', undefined, r.body.panelKey)).status === 200,
  'Nova sessão da equipe válida',
);
// Existing admin sessions predate account_id and must remain compatible.
sql
  .prepare('UPDATE demo_sessions SET account_id=NULL WHERE id=?')
  .run(
    await crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(adminSession.cookie.split('=')[1]))
      .then((b) => Buffer.from(b).toString('hex')),
  );
ok(
  (await call('/api/v2/app')).body.me.role === 'admin',
  'Sessão anterior da conta admin preservada',
);
console.log(`Equipe: ${passed} verificações aprovadas.`);

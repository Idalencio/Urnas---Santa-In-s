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
ok((await call('/api/v2/app')).status === 401, 'Painel protegido');
ok(
  (await call('/api/auth', { action: 'login', username: 'admin', password: 'errada' })).status ===
    401,
  'Senha incorreta',
);
let r = await call('/api/auth', {
  action: 'login',
  username: 'admin',
  password: 'SenhaFicticiaQA!42',
});
ok(r.status === 200, 'Login');
cookie = r.headers.get('set-cookie').split(';')[0];
panel = r.body.panelKey;
ok(r.headers.get('set-cookie').includes('HttpOnly'), 'Cookie HttpOnly');
r = await call('/api/v2/app');
ok(r.body.students.length === 3 && r.body.terminals.length === 2, 'Dados fictícios preparados');
const e = r.body.elections[0];
ok(e.candidateSnapshot.map((c) => c.code).join(',') === '1,12', 'Números sem prefixo');
let v = await call('/api/v2/urna/urna-padrao', { action: 'authorize', matricula: '1003' }, false);
ok(v.status === 200, 'Liberação por matrícula');
const gate = v.body.gate;
ok(
  (await call('/api/v2/urna/urna-infantil', { action: 'authorize', matricula: '1003' }, false))
    .status === 409,
  'Sem liberação simultânea',
);
const ballot = { requestId: crypto.randomUUID(), electionId: e.id, code: '12', gate };
ok(
  (await call('/api/v2/urna/urna-infantil', ballot, false)).status === 403,
  'Liberação vinculada à urna',
);
const results = await Promise.all(
  Array.from({ length: 12 }, () =>
    call('/api/v2/urna/urna-padrao', { ...ballot, requestId: crypto.randomUUID() }, false),
  ),
);
ok(results.filter((r) => r.status === 200).length === 1, 'Concorrência: 12 confirmações, um voto');
ok(
  (await call('/api/v2/urna/urna-padrao', { action: 'authorize', matricula: '1003' }, false))
    .status === 409,
  'Matrícula já utilizada',
);
r = await call('/api/v2/app');
ok(
  r.body.elections[0].votedCount === 1 &&
    r.body.elections[0].results.reduce((n, r) => n + r.total, 0) === 1,
  'Apuração e participação',
);
ok(
  !r.body.students.find((s) => s.matricula === '1001').voted,
  'Matrícula 1001 permanece disponível',
);
r = await app('csvPreview', { csv: 'nome;turma;matricula\nAna;6A;001\n' });
ok(r.status === 200 && r.body.rows[0].matricula === '001', 'Importação preserva zeros');
ok(
  (await app('csvPreview', { csv: 'nome;turma;matricula\nAna;6A;001\nBia;6B;001\n' })).status ===
    400,
  'Duplicidades recusadas',
);
r = await app('duplicate', { electionId: e.id });
const copy = r.body.id;
ok(r.status === 200, 'Duplicar eleição');
r = await app('enroll', { electionId: copy, classes: [] });
ok(r.status === 200, 'Eleitores por eleição');
r = await app('terminal', {
  value: { name: 'Urna adicional', model: 'standard', location: 'Teste', electionId: copy },
});
ok(r.status === 200, 'Nova urna');
r = await app('publish', {
  electionId: copy,
  startsAt: new Date(Date.now() - 1000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
});
ok(r.status === 200, 'Publicar cópia');
r = await call('/api/v2/app');
const t = r.body.terminals.find((t) => t.electionId === copy);
r = await call('/api/v2/urna/' + t.id, { action: 'authorize', matricula: '1003' }, false);
ok(r.status === 200, 'Mesmo aluno em outra eleição');
const voterData = JSON.parse(
  sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value,
);
ok(
  voterData.ballots.every((b) => !('matricula' in b) && !('name' in b) && !('gate' in b)),
  'Voto sem identificação do eleitor',
);
// Six complete slates must survive storage and publication in both urn models.
const six = await app('election', {
  value: { name: 'Seis chapas QA', digits: 5, hasVice: 1, requireMatricula: 1 },
});
const sixId = six.body.id;
for (const code of ['1', '12', '23', '34', '45', '56']) {
  ok(
    (
      await app('candidate', {
        value: {
          electionId: sixId,
          name: 'Prefeito ' + code,
          code,
          image: '/characters/lion.svg',
          viceName: 'Vice ' + code,
          viceImage: '/characters/owl.svg',
          active: 1,
        },
      })
    ).status === 200,
    'Chapa completa ' + code,
  );
}
await app('enroll', { electionId: sixId, classes: [] });
for (const model of ['standard', 'images'])
  await app('terminal', {
    value: { name: 'Urna seis ' + model, location: 'QA', model, electionId: sixId },
  });
ok(
  (
    await app('publish', {
      electionId: sixId,
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    })
  ).status === 200,
  'Publicar seis chapas',
);
const sixTerminal = (await call('/api/v2/app')).body.terminals.find((t) => t.electionId === sixId);
const sixPublic = await call('/api/v2/urna/' + sixTerminal.id, undefined, false);
ok(
  sixPublic.body.election.candidateSnapshot.length === 6 &&
    sixPublic.body.election.candidateSnapshot.every(
      (c) => c.name && c.image && c.viceName && c.viceImage,
    ),
  'Seis duplas com nome e fotos na urna pública',
);
// Regressão: as urnas padrão ocupadas não impedem a escolha de modelos em outra eleição.
const guided = await app('duplicate', { electionId: sixId }),
  guidedId = guided.body.id;
await app('enroll', { electionId: guidedId, classes: [] });
const beforeModels = (await call('/api/v2/app')).body.terminals;
ok(
  (
    await app('publish', {
      electionId: guidedId,
      models: [],
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    })
  ).status === 400,
  'Sem modelo não publica',
);
ok(
  (await call('/api/v2/app')).body.terminals.length === beforeModels.length,
  'Falha não cria links',
);
ok(
  (
    await app('publish', {
      electionId: guidedId,
      models: ['standard', 'images'],
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    })
  ).status === 200,
  'Publicar com escolha direta dos modelos',
);
const afterModels = (await call('/api/v2/app')).body.terminals;
ok(
  (await call('/api/v2/app')).body.elections.find((e) => e.id === guidedId).terminalIds.length ===
    2,
  'Duas urnas compartilhadas vinculadas',
);
ok(afterModels.length === beforeModels.length, 'Publicação reutiliza as mesmas urnas');
ok(
  beforeModels.every((t) => afterModels.find((x) => x.id === t.id).electionId === t.electionId),
  'Urnas ocupadas preservadas',
);
ok(
  (
    await app('publish', {
      electionId: guidedId,
      models: ['standard'],
      startsAt: new Date(Date.now() - 1000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    })
  ).status === 409,
  'Reenvio não duplica publicação',
);
const sharedChoices = await call('/api/v2/urna/urna-padrao', undefined, false);
ok(
  sharedChoices.body.election === null &&
    sharedChoices.body.elections.some((x) => x.id === guidedId) &&
    sharedChoices.body.elections.some((x) => x.id === e.id),
  'Urna oferece mais de uma eleição aberta',
);
const sharedGateA = await call(
  '/api/v2/urna/urna-padrao',
  { action: 'authorize', electionId: guidedId, matricula: '1001' },
  false,
);
const sharedGateB = await call(
  '/api/v2/urna/urna-padrao',
  { action: 'authorize', electionId: e.id, matricula: '1001' },
  false,
);
ok(
  sharedGateA.status === 200 && sharedGateB.status === 200,
  'Aluno pode participar de duas eleições na mesma urna',
);
ok(
  (
    await call(
      '/api/v2/urna/urna-padrao',
      {
        requestId: crypto.randomUUID(),
        electionId: guidedId,
        code: '1',
        gate: sharedGateB.body.gate,
      },
      false,
    )
  ).status === 403,
  'Liberação não cruza eleições',
);
ok(
  (
    await call(
      '/api/v2/urna/urna-padrao',
      {
        requestId: crypto.randomUUID(),
        electionId: guidedId,
        code: '1',
        gate: sharedGateA.body.gate,
      },
      false,
    )
  ).status === 200,
  'Primeiro voto na urna compartilhada',
);
ok(
  (
    await call(
      '/api/v2/urna/urna-padrao',
      { requestId: crypto.randomUUID(), electionId: e.id, code: '1', gate: sharedGateB.body.gate },
      false,
    )
  ).status === 200,
  'Segundo voto em outra eleição da mesma urna',
);
ok(
  (
    await call(
      '/api/v2/urna/urna-padrao',
      { action: 'authorize', electionId: guidedId, matricula: '1001' },
      false,
    )
  ).status === 409,
  'Sem repetir voto na mesma eleição',
);
await app('close', { electionId: guidedId });
ok(
  (await call('/api/v2/urna/urna-padrao', undefined, false)).body.elections.some(
    (x) => x.id === e.id,
  ),
  'Encerrar uma eleição não fecha a outra',
);
// Reproduce hosted browsers: trusted Sites identity + panel key, no app cookie.
async function browser(path, body, identity = 'visitor-a', key = '', sessionCookie = '') {
  const headers = {
    Origin: 'https://teste.example',
    'Content-Type': 'application/json',
    'X-Urna-Panel': key,
  };
  if (identity) headers['oai-authenticated-user-id'] = identity;
  if (sessionCookie) headers.Cookie = sessionCookie;
  const response = await endpoint(
    new Request('https://teste.example' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json(), headers: response.headers };
}
ok(
  (await browser('/api/v2/app')).status === 401,
  'ChatGPT identity alone does not grant panel access',
);
const login = await browser('/api/auth', {
  action: 'login',
  username: 'admin',
  password: 'SenhaFicticiaQA!42',
});
const key = login.body.panelKey,
  browserCookie = login.headers.get('set-cookie').split(';')[0];
ok(login.status === 200, 'Browser password login');
ok(
  (await browser('/api/v2/app', undefined, 'visitor-a', key)).status === 200,
  'Panel opens without app cookie',
);
ok(
  (await browser('/api/v2/app', undefined, 'visitor-a', 'wrong')).status === 401,
  'Wrong panel key denied',
);
ok(
  (await browser('/api/v2/app', undefined, 'visitor-b', key, browserCookie)).status === 401,
  'Session cannot cross Sites identities',
);
ok(
  (await browser('/api/v2/app', undefined, '', key, browserCookie)).status === 401,
  'Identity-bound session cannot be replayed without identity',
);
ok(
  (await browser('/api/auth', { action: 'logout' }, 'visitor-a')).status === 200,
  'Logout without app cookie',
);
ok(
  (await browser('/api/v2/app', undefined, 'visitor-a', key)).status === 401,
  'Logout revokes browser session',
);
const second = await browser('/api/auth', {
  action: 'login',
  username: 'admin',
  password: 'SenhaFicticiaQA!42',
});
const secondKey = second.body.panelKey;
ok(
  (
    await browser(
      '/api/auth',
      {
        action: 'password',
        currentPassword: 'SenhaFicticiaQA!42',
        newPassword: 'OutraSenhaQA!42',
        confirmPassword: 'OutraSenhaQA!42',
      },
      'visitor-a',
      secondKey,
    )
  ).status === 200,
  'Password change without app cookie',
);
ok(
  (await browser('/api/v2/app', undefined, 'visitor-a', secondKey)).status === 401,
  'Password change revokes old session',
);
console.log(`Demo: ${passed} verificações aprovadas.`);

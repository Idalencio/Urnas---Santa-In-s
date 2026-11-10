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
const objects = new Map();
globalThis.__DEMO_TEST_ENV.BUCKET = {
  async put(id, data, options) {
    objects.set(id, { body: data, httpMetadata: options.httpMetadata });
  },
  async get(id) {
    return objects.get(id) || null;
  },
};
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tNEAAAAASUVORK5CYII=';
const PW = 'SenhaFicticiaQA!42',
  auth = (action, payload = {}) => call('/api/auth', { action, ...payload }),
  app = (action, payload = {}) => call('/api/v2/app', { action, ...payload });
function use(r) {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  cookie = r.headers.get('set-cookie').split(';')[0];
  panel = r.body.panelKey;
}
function saved() {
  return { cookie, panel };
}
function restore(v) {
  ({ cookie, panel } = v);
}
let r = await auth('login', { username: 'admin', password: PW });
use(r);
let owner = saved();
ok(!!r.body.panelKey && !r.body.mfaRequired, 'Login sem segundo fator');
for (const action of ['mfaStatus', 'mfaBegin', 'mfaConfirm', 'mfaRecovery', 'mfaDisable'])
  ok((await auth(action)).status === 410, 'Operação retirada: ' + action);
// Recreate an old encrypted configuration in a disposable JSON state; next read retires it.
let old = JSON.parse(sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value),
  ballots = JSON.stringify(old.ballots),
  students = JSON.stringify(old.students);
old.mfa = {
  'demo-admin': { enabled: true, secret: 'seed-ficticio-cifrado', recovery: ['hash-ficticio'] },
};
sql.prepare("UPDATE demo_state SET value=? WHERE id='main'").run(JSON.stringify(old));
ok(
  (await call('/api/v2/app')).status === 401,
  'Retirada da configuração antiga revoga sessão anterior',
);
r = await auth('login', { username: 'admin', password: PW });
use(r);
owner = saved();
let current = JSON.parse(sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value);
ok(
  !Object.hasOwn(current, 'mfa') &&
    JSON.stringify(current.ballots) === ballots &&
    JSON.stringify(current.students) === students,
  'Retirada elimina credenciais antigas e preserva dados',
);
async function staff(username) {
  restore(owner);
  let a = await app('account', {
    value: {
      name: username,
      username,
      password: 'FicticiaPrivacidade!42',
      role: 'staff',
      active: 1,
      permissions: ['manageElections', 'manageVoters', 'publishElections', 'viewResults'],
      classes: null,
      electionIds: [],
    },
  });
  assert.equal(a.status, 200);
  use(await auth('login', { username, password: 'FicticiaPrivacidade!42' }));
  return { id: a.body.id, ...saved() };
}
const team = await staff('equipe.qa'),
  other = await staff('outra.qa');
restore(team);
r = await call('/api/v2/app');
ok(
  r.body.students.length === 0 && r.body.accounts.length === 0,
  'Equipe sem cadastro geral nem contas',
);
ok((await call('/api/v2/audit')).status === 403, 'Histórico exclusivo de administrador');
ok(
  (await call('/api/v2/audit?action=account&actor=' + team.id)).status === 403,
  'Filtros não contornam acesso ao histórico',
);
restore(owner);
r = await call('/api/v2/audit');
ok(
  r.status === 200 && r.body.rows.some((r) => r.action === 'securityUpdated'),
  'Histórico de atualização disponível ao administrador',
);
ok((await call('/api/v2/audit', undefined, false)).status === 401, 'Histórico exige login');
ok((await call('/api/v2/audit', {})).status === 405, 'Histórico somente leitura');
r = await app('image', { imageData: 'data:image/png;base64,' + PNG });
assert.equal(r.status, 200, JSON.stringify(r.body));
const image = r.body.image;
ok((await call(image, undefined, false)).status === 403, 'Envio sem vínculo não é público');
r = await app('election', {
  value: { name: 'Privada QA', digits: 2, hasVice: 0, requireMatricula: 0 },
});
const privateId = r.body.id;
assert.equal(r.status, 200);
r = await app('candidate', {
  value: {
    electionId: privateId,
    name: 'Privado',
    code: '1',
    image,
    viceName: '',
    viceImage: '',
    active: 1,
  },
});
assert.equal(r.status, 200);
restore(team);
ok((await call(image)).status === 403, 'Equipe não lê foto de eleição alheia');
r = await app('election', {
  value: { name: 'Da equipe', digits: 2, hasVice: 0, requireMatricula: 0 },
});
assert.equal(r.status, 200);
const eid = r.body.id;
r = await app('candidate', {
  value: {
    electionId: eid,
    name: 'Tentativa',
    code: '1',
    image,
    viceName: '',
    viceImage: '',
    active: 1,
  },
});
ok(r.status === 403, 'Equipe não associa foto alheia');
r = await app('image', { imageData: 'data:image/png;base64,' + PNG });
assert.equal(r.status, 200);
const ownImage = r.body.image;
// Image bodies are binary. Use endpoint directly to verify owner and cache instead of the JSON test helper.
async function photo(path, auth = true) {
  return endpoint(
    new Request('https://teste.example' + path, {
      headers: auth ? { Cookie: cookie, 'X-Urna-Panel': panel } : {},
    }),
  );
}
r = await photo(ownImage);
ok(
  r.status === 200 &&
    r.headers.get('Cache-Control') === 'no-store' &&
    r.headers.get('X-Content-Type-Options') === 'nosniff',
  'Foto do próprio envio sem cache',
);
restore(other);
ok((await photo(ownImage)).status === 403, 'Outra conta não lê envio privado');
restore(owner);
for (const [mime, text] of [
  ['image/png', '<html><script>alert(1)</script></html>'],
  ['image/jpeg', '<?php echo 1; ?>'],
  ['image/webp', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
])
  ok(
    (
      await app('image', {
        imageData: 'data:' + mime + ';base64,' + Buffer.from(text).toString('base64'),
      })
    ).status === 400,
    'Recusa conteúdo falso ' + mime,
  );
ok(
  (await app('image', { imageData: 'data:image/svg+xml;base64,PHN2Zy8+' })).status === 400,
  'Recusa SVG',
);
ok(
  (await app('image', { imageData: 'data:image/jpeg;base64,' + PNG })).status === 400,
  'Recusa MIME divergente dos bytes',
);
let oversized = Buffer.from(PNG, 'base64');
oversized.writeUInt32BE(7000, 16);
ok(
  (await app('image', { imageData: 'data:image/png;base64,' + oversized.toString('base64') }))
    .status === 400,
  'Recusa dimensões excessivas',
);
await app('csvImport', { csv: 'nome;turma;matricula\nNome Privado QA;Turma Privada QA;PRIV001\n' });
r = await app('election', {
  value: { name: 'Privacidade pública', digits: 2, hasVice: 0, requireMatricula: 1 },
});
assert.equal(r.status, 200);
const publicId = r.body.id;
await app('candidate', {
  value: {
    electionId: publicId,
    name: 'Chapa pública',
    code: '1',
    image,
    viceName: '',
    viceImage: '',
    active: 1,
  },
});
await app('enroll', { electionId: publicId, classes: ['Turma Privada QA'] });
r = await app('publish', {
  electionId: publicId,
  models: ['standard'],
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
});
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await call('/api/v2/urna/urna-padrao?election=' + publicId, undefined, false);
let raw = JSON.stringify(r.body);
ok(
  r.status === 200 &&
    ![
      'PRIV001',
      'Nome Privado QA',
      'Turma Privada QA',
      'password',
      'panelKey',
      'gateHash',
      'students',
      'electors',
      'imageOwners',
    ].some((x) => raw.includes(x)),
  'Urna pública sem cadastro privado',
);
r = await call(
  '/api/v2/urna/urna-padrao',
  { action: 'authorize', electionId: publicId, matricula: 'PRIV001' },
  false,
);
ok(
  r.status === 200 &&
    JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(['expiresIn', 'gate', 'ok']),
  'Liberação sem nome ou turma',
);
ok((await photo(image, false)).status === 200, 'Foto publicada permanece disponível');
const malformed = async (body, headers = {}) =>
  endpoint(
    new Request('https://teste.example/api/auth', {
      method: 'POST',
      headers: { Origin: 'https://teste.example', 'Content-Type': 'application/json', ...headers },
      body,
    }),
  );
for (const body of ['null', '[]', '"texto"', '{broken'])
  ok((await malformed(body)).status === 400, 'Recusa JSON inválido ' + body);
ok(
  (await malformed('{}', { 'Content-Type': 'text/plain' })).status === 415,
  'Recusa tipo de conteúdo inadequado',
);
ok((await malformed('x'.repeat(5000))).status === 413, 'Limite de corpo sem Content-Length');
r = await endpoint(
  new Request('https://teste.example/api/v2/app', {
    method: 'DELETE',
    headers: { Cookie: cookie, 'X-Urna-Panel': panel },
  }),
);
ok(r.status === 405, 'Método de escrita desconhecido recusado');
r = await endpoint(
  new Request('https://teste.example/api/v2/app', {
    method: 'POST',
    headers: {
      Origin: 'https://outro.example',
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-Urna-Panel': panel,
    },
    body: '{}',
  }),
);
ok(r.status === 403, 'Origem externa bloqueada');
r = await auth('login', { username: "' OR 1=1 --", password: 'incorreta' });
ok(
  r.status === 401 && !JSON.stringify(r.body).includes('SQL'),
  'SQL na entrada não contorna login',
);
// Administrative data and its audit record must continue rolling back together.
raw = sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value;
sql.exec(
  "CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
);
r = await app('election', {
  value: { name: 'Não confirmar', digits: 2, hasVice: 0, requireMatricula: 0 },
});
ok(
  r.status === 500 &&
    sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value === raw,
  'Falha de histórico desfaz alteração',
);
sql.exec('DROP TRIGGER reject_audit');
r = await call('/api/v2/audit');
raw = JSON.stringify(r.body);
ok(
  ![
    PW,
    'FicticiaPrivacidade!42',
    'panelKey',
    'gateHash',
    'seed-ficticio-cifrado',
    'candidateId',
  ].some((x) => raw.includes(x)),
  'Histórico sem credenciais ou escolhas de voto',
);
restore(team);
const oldSession = saved();
r = await auth('password', {
  currentPassword: 'FicticiaPrivacidade!42',
  newPassword: 'NovaFicticiaPrivacidade!42',
  confirmPassword: 'NovaFicticiaPrivacidade!42',
});
use(r);
ok(!!r.body.panelKey && !r.body.mfaRequired, 'Senha alterada sem segundo fator');
restore(oldSession);
ok((await call('/api/v2/app')).status === 401, 'Troca de senha revoga sessões');
use(await auth('login', { username: 'equipe.qa', password: 'NovaFicticiaPrivacidade!42' }));
console.log(`Proteção de dados D1: ${passed} verificações aprovadas.`);

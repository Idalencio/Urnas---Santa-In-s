import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
  MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
  DEMO_PASSWORD: 'SenhaFicticiaQA!42',
};
let source = readFileSync('lib/demo-api.ts', 'utf8')
  .replace(/import\s*\{\s*env\s+as\s+bindings\s*\}\s*from\s*['"]cloudflare:workers['"];?/, '')
  .replace(
    /const\s+env\s*=\s*bindings\s+as\s+any;/,
    'const env=(globalThis as any).__DEMO_TEST_ENV;',
  );
source += '\nexport {totp};';
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { endpoint, totp } = await import(
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
function otp(secret, step = Math.floor(Date.now() / 30000)) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(counter).digest(),
    i = h[19] & 15;
  return String((h.readUInt32BE(i) & 0x7fffffff) % 1000000).padStart(6, '0');
}
for (const [time, expected] of [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
])
  ok(
    (await totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', Math.floor(time / 30), 8)) === expected,
    'RFC 6238 ' + time,
  );
function use(r) {
  assert.equal(r.status, 200, JSON.stringify(r.body));
  cookie = r.headers.get('set-cookie').split(';')[0];
  panel = r.body.panelKey;
}
const auth = (action, payload = {}) => call('/api/auth', { action, ...payload }),
  app = (action, payload = {}) => call('/api/v2/app', { action, ...payload });
const PW = 'SenhaFicticiaQA!42';
let r = await auth('login', { username: 'admin', password: PW });
use(r);
const owner = { cookie, panel };
ok((await auth('mfaStatus')).body.enabled === false, 'MFA inicialmente opcional');
ok((await auth('mfaBegin', { currentPassword: 'errada' })).status === 401, 'Exige senha atual');
r = await auth('mfaBegin', { currentPassword: PW });
assert.equal(r.status, 200);
const seed = r.body.secret;
ok(seed.length === 32 && r.body.uri.startsWith('otpauth://totp/'), 'Enrollment TOTP interoperável');
const before = sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value;
ok(
  !before.includes(seed) && JSON.parse(before).mfa['demo-admin'].pending.startsWith('v1:'),
  'Seed criptografado em repouso',
);
r = await auth('login', { username: 'admin', password: PW });
use(r);
ok(
  (await auth('mfaConfirm', { currentPassword: PW, code: otp(seed) })).status === 409,
  'Enrollment vinculado à aba',
);
({ cookie, panel } = owner);
ok(
  (await auth('mfaConfirm', { currentPassword: PW, code: 'x' })).status === 401,
  'Código incorreto não ativa MFA',
);
const realNow = Date.now;
let now = Date.now();
Date.now = () => now;
now += 601000;
ok(
  (await auth('mfaConfirm', { currentPassword: PW, code: otp(seed) })).status === 409,
  'Enrollment expira após 10 minutos',
);
now -= 601000;
r = await auth('mfaBegin', { currentPassword: PW });
assert.equal(r.status, 200);
const secret = r.body.secret;
r = await auth('mfaConfirm', {
  currentPassword: PW,
  code: otp(secret, Math.floor(now / 30000) - 1),
});
const codes = r.body.codes;
use(r);
const secured = { cookie, panel };
ok(codes.length === 10 && r.body.enabled, 'Ativação com dez códigos de recuperação');
({ cookie, panel } = owner);
ok((await call('/api/v2/app')).status === 401, 'Sessão antiga revogada');
({ cookie, panel } = secured);
let raw = sql.prepare("SELECT value FROM demo_state WHERE id='main'").get().value;
ok(
  ![secret, ...codes, ...codes.map((c) => c.replace(/-/g, ''))].some((x) => raw.includes(x)),
  'Segredo cifrado e recuperação com hash',
);
r = await auth('login', { username: 'admin', password: PW });
ok(
  r.status === 200 && r.body.mfaRequired && !r.body.panelKey && !r.headers.get('set-cookie'),
  'Senha isolada não cria sessão',
);
ok(
  (await auth('login', { username: 'admin', password: PW, code: 'bad' })).status === 401,
  'Código inválido recusado',
);
const current = otp(secret);
r = await auth('login', { username: 'admin', password: PW, code: current });
ok(r.status === 200 && !!r.body.panelKey, 'TOTP permite acesso');
ok(
  (await auth('login', { username: 'admin', password: PW, code: current })).status === 401,
  'TOTP não reutilizável',
);
r = await auth('login', { username: 'admin', password: PW, code: codes[0] });
use(r);
ok((await auth('mfaStatus')).body.remaining === 9, 'Recuperação decrementada');
ok(
  (await auth('login', { username: 'admin', password: PW, code: codes[0] })).status === 401,
  'Recuperação de uso único',
);
ok(
  (
    await auth('password', {
      currentPassword: PW,
      newPassword: 'NovaFicticiaSeguro!42',
      confirmPassword: 'NovaFicticiaSeguro!42',
    })
  ).status === 401,
  'Troca de senha exige segundo fator',
);
now += 900001;
r = await auth('mfaRecovery', { currentPassword: PW, code: codes[1] });
use(r);
const fresh = r.body.codes;
ok(fresh.length === 10 && !fresh.some((c) => codes.includes(c)), 'Renovação gera outros códigos');
ok(
  (await auth('login', { username: 'admin', password: PW, code: codes[2] })).status === 401,
  'Renovação revoga códigos antigos',
);
sql.exec(
  "CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
);
r = await auth('mfaDisable', { currentPassword: PW, code: fresh[0] });
ok(r.status === 500, 'Falha no histórico impede desativação');
ok(
  (await auth('mfaStatus')).body.enabled && (await auth('mfaStatus')).body.remaining === 10,
  'Falha preserva MFA e recuperação',
);
sql.exec('DROP TRIGGER reject_audit');
r = await auth('mfaDisable', { currentPassword: PW, code: fresh[0] });
use(r);
ok(!r.body.enabled && r.body.codes.length === 0, 'Desativação confirmada');
r = await app('election', {
  value: { name: 'Histórico QA', digits: 2, hasVice: 0, requireMatricula: 0 },
});
assert.equal(r.status, 200);
const eid = r.body.id;
await app('deleteElection', { electionId: eid });
r = await call('/api/v2/audit?election=' + eid);
ok(
  r.status === 200 &&
    ['election', 'deleteElection'].every((a) => r.body.rows.some((r) => r.action === a)),
  'Histórico mantém eleição criada e excluída',
);
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
  'Falha no log desfaz alteração',
);
sql.exec('DROP TRIGGER reject_audit');
const csv = 'nome;turma;matricula\nRegistro QA;QA;SEC001\n';
await app('csvImport', { csv });
await app('csvImport', { csv });
r = await call('/api/v2/audit?action=csvImport');
ok(
  r.body.total === 2 && r.body.rows.every((r) => r.details.summary),
  'Importação idêntica registrada',
);
r = await call('/api/v2/audit');
raw = JSON.stringify(r.body);
ok(
  ['mfaConfirm', 'mfaRecovery', 'mfaDisable', 'login'].every((a) =>
    r.body.rows.some((r) => r.action === a),
  ),
  'Mudanças de segurança auditadas',
);
ok(
  ![PW, secret, seed, ...codes, ...fresh, 'panelKey', 'candidateId', 'gateHash'].some((x) =>
    raw.includes(x),
  ),
  'Histórico sem credenciais ou escolhas de voto',
);
ok((await call('/api/v2/audit', undefined, false)).status === 401, 'Histórico exige login');
ok((await call('/api/v2/audit', {})).status === 405, 'Histórico somente leitura');
ok((await call('/api/v2/audit?from=2026-02-31')).status === 400, 'Data inválida recusada');
r = await app('account', {
  value: {
    name: 'Equipe QA',
    username: 'audit.qa',
    password: 'FicticiaStaff!42',
    role: 'staff',
    active: 1,
    permissions: [],
    classes: [],
    electionIds: [],
  },
});
assert.equal(r.status, 200);
r = await auth('login', { username: 'audit.qa', password: 'FicticiaStaff!42' });
use(r);
ok((await call('/api/v2/audit')).status === 403, 'Equipe sem acesso ao histórico');
Date.now = realNow;
console.log(`Segurança D1: ${passed} verificações aprovadas.`);

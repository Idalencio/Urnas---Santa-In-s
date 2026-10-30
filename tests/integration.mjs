import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const php = process.env.PHP_BIN || 'php',
  base = process.env.TEST_URL || 'http://127.0.0.1:8087';
const invoke = (...args) => execFileSync(php, args, { encoding: 'utf8', env: process.env });
const query = (code) =>
  invoke('-r', 'require "server/bootstrap.php"; require "server/auth.php"; ' + code);
const password = readFileSync('ACESSO-ADMIN.txt', 'utf8').match(/^Senha inicial: (.+)$/m)[1];
invoke('tests/reset.php');
query('foreach(glob(Urna\\ROOT."/storage/login-limits/*.json") as $f)file_put_contents($f,"{}");');
const server = spawn(
  php,
  ['-S', '127.0.0.1:' + new URL(base).port, '-t', 'public', 'bin/dev-router.php'],
  {
    env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  },
);
let errors = '',
  checks = 0;
server.stderr.on('data', (b) => (errors += b));
function ok(v, m) {
  assert.ok(v, m);
  checks++;
}
function eq(v, w, m) {
  assert.deepEqual(v, w, m);
  checks++;
}
async function request(path, { data, session, origin = base } = {}) {
  const headers = { Accept: 'application/json' };
  if (session) {
    headers.Cookie = session.cookie;
    headers['X-Urna-Panel'] = session.key;
  }
  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers.Origin = origin;
  }
  const r = await fetch(base + path, {
    method: data !== undefined ? 'POST' : 'GET',
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, cookie: r.headers.get('set-cookie'), headers: r.headers };
}
const call = (data, session) => request('/api/app', { data, session });
const auth = (data, session) => request('/api/auth', { data, session });
const sess = (r) => ({ cookie: r.cookie.split(';')[0], key: r.json.panelKey });
async function login(pass = password) {
  const r = await auth({ action: 'login', username: 'admin', password: pass });
  eq(r.status, 200, 'Login local');
  return sess(r);
}
async function state(session) {
  const r = await request('/api/app', { session });
  eq(r.status, 200, 'Estado autenticado');
  return r.json;
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  eq((await request('/api/app')).status, 401, 'Painel privado antes da instalação');
  const root = await request('/');
  eq(root.status, 200, 'Interface compilada');
  ok(root.text.includes('/assets/'), 'Assets presentes');
  for (const path of [
    '/config/config.php',
    '/config/local-admin.php',
    '/ACESSO-ADMIN.txt',
    '/server/auth.php',
  ])
    eq((await request(path)).status, 404, 'Arquivo privado: ' + path);
  eq(
    (await auth({ action: 'login', username: 'admin', password: 'errada' })).status,
    401,
    'Senha incorreta antes de instalar',
  );
  eq(
    JSON.parse(query('echo json_encode(Urna\\all("SHOW TABLES"));')).length,
    0,
    'Senha incorreta não cria tabelas',
  );
  eq(
    (await auth({ action: 'login', username: 'outro', password })).status,
    401,
    'Somente usuário admin',
  );
  eq(
    (
      await request('/api/auth', {
        data: { action: 'login', username: 'admin', password },
        origin: 'https://outro.example',
      })
    ).status,
    403,
    'Login exige origem correta',
  );
  const first = await Promise.all(
    Array.from({ length: 3 }, () => auth({ action: 'login', username: 'admin', password })),
  );
  ok(
    first.every((r) => r.status === 200),
    'Primeiros logins concorrentes criam uma única conta',
  );
  let owner = await login();
  let data = await state(owner);
  eq(data.me.username, 'admin', 'Usuário local');
  eq(data.terminals.length, 2, 'Duas urnas prontas');
  eq(data.candidates.length, 0, 'Sem candidatos fictícios');
  eq(data.elections.length, 0, 'Sem eleições fictícias');
  eq(data.mail, null, 'Sem SMTP');
  eq(
    JSON.parse(
      query('echo json_encode(Urna\\all("SELECT id FROM administrators WHERE active=1"));'),
    ).length,
    1,
    'Uma conta ativa',
  );
  ok(!JSON.stringify(data).includes('password_hash'), 'Hash não exposto');
  eq(
    (await request('/api/app', { session: { ...owner, key: '' } })).status,
    401,
    'Urna pública não herda acesso ao painel',
  );
  for (const action of ['inspect', 'activate', 'forgot'])
    eq(
      (await auth({ action, email: 'x@example.org', token: 'qualquer', password })).status,
      410,
      'Autenticação antiga desabilitada: ' + action,
    );
  for (const action of ['admin', 'invite', 'owner', 'mail'])
    eq(
      (
        await call(
          {
            action,
            value: { name: 'Outra', email: 'outra@example.org', role: 'admin', active: 1 },
          },
          owner,
        )
      ).status,
      403,
      'Acesso único: ' + action,
    );
  eq(
    (await call({ action: 'toggle', entity: 'administrators', id: data.me.id }, owner)).status,
    403,
    'Não desativa conta local',
  );
  eq(
    (await call({ action: 'candidate', value: { name: 'Sem urna', code: 1, active: 1 } }, owner))
      .status,
    400,
    'Candidato exige urna',
  );
  eq(
    (
      await call(
        {
          action: 'candidate',
          value: { name: 'Número inválido', code: 10, terminalId: 'urna-padrao', active: 1 },
        },
        owner,
      )
    ).status,
    400,
    'Um dígito apenas',
  );
  for (const [tid, name] of [
    ['urna-padrao', 'Leão padrão'],
    ['urna-infantil', 'Leão infantil'],
  ])
    eq(
      (
        await call(
          {
            action: 'candidate',
            value: { name, code: 1, terminalId: tid, image: '/characters/lion.svg', active: 1 },
          },
          owner,
        )
      ).status,
      200,
      'Número 1 independente: ' + tid,
    );
  data = await state(owner);
  const a = data.candidates.find((c) => c.terminalId === 'urna-padrao'),
    b = data.candidates.find((c) => c.terminalId === 'urna-infantil');
  eq(a.code, '01', 'Zero automático');
  ok(a.id !== b.id, 'Candidatos separados');
  eq(
    (
      await call(
        {
          action: 'candidate',
          value: { name: 'Duplicado', code: 1, terminalId: a.terminalId, active: 1 },
        },
        owner,
      )
    ).status,
    400,
    'Sem duplicar número na mesma urna',
  );
  eq(
    (await call({ action: 'candidate', value: { ...a, terminalId: b.terminalId } }, owner)).status,
    400,
    'Sem mover candidato entre urnas',
  );
  const period = {
    startsAt: new Date(Date.now() - 1000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
  };
  eq(
    (
      await call(
        {
          action: 'election',
          value: { name: 'Misturada', terminalId: a.terminalId, candidateIds: [b.id], ...period },
        },
        owner,
      )
    ).status,
    400,
    'Só candidatos da urna',
  );
  for (const c of [a, b])
    eq(
      (
        await call(
          {
            action: 'election',
            value: {
              name: 'Votação ' + c.terminalId,
              terminalId: c.terminalId,
              candidateIds: [c.id],
              ...period,
            },
          },
          owner,
        )
      ).status,
      200,
      'Criar votação: ' + c.terminalId,
    );
  data = await state(owner);
  const ea = data.elections.find((e) => e.terminalId === a.terminalId),
    eb = data.elections.find((e) => e.terminalId === b.terminalId);
  const publicData = await request('/api/urna/' + a.terminalId);
  eq(publicData.status, 200, 'Urna pública');
  eq(publicData.json.election.candidateSnapshot[0].id, a.id, 'Candidato público correto');
  eq(publicData.json.election.results, [], 'Sem resultados públicos');
  ok(!('me' in publicData.json), 'Sem conta exposta na urna');
  const endpoint = '/api/urna/' + a.terminalId;
  eq(
    (await request(endpoint, { data: { requestId: randomUUID(), electionId: eb.id, code: '01' } }))
      .status,
    400,
    'Voto na urna correta',
  );
  eq(
    (await request(endpoint, { data: { requestId: randomUUID(), electionId: ea.id, code: '09' } }))
      .status,
    400,
    'Número inexistente não vota',
  );
  eq(
    (
      await request(endpoint, {
        data: { requestId: randomUUID(), electionId: ea.id, code: '01', blank: true },
      })
    ).status,
    400,
    'Sem voto branco',
  );
  eq(
    (
      await request(endpoint, {
        data: { requestId: randomUUID(), electionId: ea.id, code: '01' },
        origin: 'https://outro.example',
      })
    ).status,
    403,
    'Voto exige origem correta',
  );
  const vote = { requestId: randomUUID(), electionId: ea.id, code: '01' };
  const votes = await Promise.all(
    Array.from({ length: 8 }, () => request(endpoint, { data: vote })),
  );
  ok(
    votes.every((r) => r.status === 200),
    'Votação concorrente',
  );
  eq(votes.filter((r) => !r.json.duplicate).length, 1, 'Um voto sem duplicação');
  eq(
    (
      await request('/api/urna/' + b.terminalId, {
        data: { requestId: randomUUID(), electionId: eb.id, code: '01' },
      })
    ).status,
    200,
    'Voto infantil',
  );
  eq(
    (await request('/api/urna/' + b.terminalId, { data: { ...vote, electionId: eb.id } })).status,
    409,
    'Não reaproveita confirmação em outra urna',
  );
  const image = await call(
    {
      action: 'image',
      imageData:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK28AAAAASUVORK5CYII=',
    },
    owner,
  );
  eq(image.status, 200, 'Upload privado');
  eq((await request(image.json.image, { session: owner })).status, 200, 'Administrador vê imagem');
  eq((await request(image.json.image)).status, 403, 'Imagem sem uso protegida');
  eq(
    (
      await call(
        { action: 'candidate', value: { ...a, name: 'Nome novo', image: image.json.image } },
        owner,
      )
    ).status,
    200,
    'Editar candidato',
  );
  data = await state(owner);
  eq(
    data.elections.find((e) => e.id === ea.id).candidateSnapshot[0].name,
    a.name,
    'Snapshot preservado',
  );
  eq(data.elections.find((e) => e.id === ea.id).results[0].total, 1, 'Apuração padrão');
  eq(data.elections.find((e) => e.id === eb.id).results[0].candidateId, b.id, 'Apuração infantil');
  eq((await call({ action: 'archive', id: ea.id }, owner)).status, 400, 'Só arquiva encerradas');
  eq((await call({ action: 'close', id: ea.id }, owner)).status, 200, 'Encerrar');
  eq((await call({ action: 'archive', id: ea.id }, owner)).status, 200, 'Arquivar');
  eq(
    (await request(endpoint, { data: { ...vote, requestId: randomUUID() } })).status,
    400,
    'Encerrada não recebe voto',
  );
  const change = {
    action: 'password',
    currentPassword: password,
    newPassword: 'Nova senha segura 2026!',
    confirmPassword: 'Nova senha segura 2026!',
  };
  eq((await auth(change)).status, 401, 'Troca exige sessão');
  eq((await auth(change, { ...owner, key: '' })).status, 401, 'Troca exige chave da aba');
  eq(
    (await auth({ ...change, currentPassword: 'errada' }, owner)).status,
    401,
    'Troca exige senha atual',
  );
  eq(
    (await auth({ ...change, newPassword: 'curta', confirmPassword: 'curta' }, owner)).status,
    400,
    'Senha curta recusada',
  );
  eq(
    (await auth({ ...change, confirmPassword: 'diferente' }, owner)).status,
    400,
    'Confirmação obrigatória',
  );
  const changed = await auth(change, owner);
  eq(changed.status, 200, 'Troca de senha');
  const current = sess(changed);
  eq((await request('/api/app', { session: owner })).status, 401, 'Troca revoga sessão antiga');
  eq((await request('/api/app', { session: current })).status, 200, 'Sessão renovada funciona');
  eq(
    (await auth({ action: 'login', username: 'admin', password })).status,
    401,
    'Senha inicial não volta após troca',
  );
  const second = await login(change.newPassword);
  invoke('bin/console.php', 'install');
  invoke('bin/console.php', 'install');
  invoke('bin/console.php', 'check');
  eq(
    (await state(second)).elections.find((e) => e.id === ea.id).results[0].total,
    1,
    'Reinstalar mantém apuração',
  );
  const before = query('echo json_encode(Urna\\all("SELECT * FROM ballots ORDER BY id"));');
  const legacyCookie = 'L'.repeat(43),
    legacyPanel = 'P'.repeat(43);
  query(
    `Urna\\sql("DELETE FROM admin_sessions"); Urna\\sql("DELETE FROM admin_passwords WHERE admin_id=?",[Urna\\LOCAL_ADMIN_ID]); Urna\\sql("DELETE FROM administrators WHERE id=?",[Urna\\LOCAL_ADMIN_ID]); Urna\\sql("INSERT INTO administrators (id,name,email,role,active,owner) VALUES ('legacy','Antigo','antigo@example.org','admin',1,1)"); Urna\\sql("INSERT INTO admin_passwords (admin_id,hash,version,updated_at) VALUES (?,?,1,?)",['legacy',Urna\\hashPassword('Senha antiga segura!'),Urna\\now()]); Urna\\sql("INSERT INTO admin_sessions (id,admin_id,version,expires_at,panel_hash) VALUES (?,?,1,?,?)",[Urna\\digest('${legacyCookie}'),'legacy',Urna\\now(3600),Urna\\digest('${legacyPanel}')]); Urna\\sql("INSERT INTO admin_invitations (id,admin_id,token_hash,expires_at,used,delivery,created_at) VALUES (?,?,?,?,0,'pending',?)",['legacy-invite','legacy',Urna\\digest('legacy-token'),Urna\\now(3600),Urna\\now()]);`,
  );
  eq(
    (
      await request('/api/app', {
        session: { cookie: 'urna_session_local=' + legacyCookie, key: legacyPanel },
      })
    ).status,
    401,
    'Sessões legadas bloqueadas',
  );
  eq(
    (
      await auth({
        action: 'login',
        username: 'antigo@example.org',
        email: 'antigo@example.org',
        password: 'Senha antiga segura!',
      })
    ).status,
    401,
    'Login legado bloqueado',
  );
  const migrated = await login();
  eq(
    query('echo json_encode(Urna\\all("SELECT * FROM ballots ORDER BY id"));'),
    before,
    'Atualização preserva votos',
  );
  eq(
    JSON.parse(
      query(
        'echo json_encode(Urna\\one("SELECT active,owner FROM administrators WHERE id=?",["legacy"]));',
      ),
    ),
    { active: 0, owner: 0 },
    'Conta antiga desativada',
  );
  eq(
    JSON.parse(
      query(
        'echo json_encode(Urna\\one("SELECT used FROM admin_invitations WHERE id=?",["legacy-invite"]));',
      ),
    ).used,
    1,
    'Convite antigo revogado',
  );
  invoke('bin/console.php', 'reset-password');
  eq((await request('/api/app', { session: migrated })).status, 401, 'Recuperação revoga sessões');
  const restored = await login();
  eq((await auth({ action: 'logout' }, restored)).status, 200, 'Sair');
  eq((await request('/api/app', { session: restored })).status, 401, 'Logout efetivo');
  eq(
    JSON.parse(query('echo json_encode(Urna\\all("SHOW COLUMNS FROM ballots"));')).map(
      (f) => f.Field,
    ),
    ['id', 'election_id', 'candidate_id', 'kind'],
    'Votos sem identificação de eleitor',
  );
  query(
    'foreach(glob(Urna\\ROOT."/storage/login-limits/*.json") as $f)file_put_contents($f,"{}");',
  );
  for (let i = 0; i < 12; i++)
    eq(
      (await auth({ action: 'login', username: i % 2 ? 'admin' : 'outro', password: 'errada' }))
        .status,
      401,
      'Tentativa incorreta ' + i,
    );
  eq(
    (await auth({ action: 'login', username: 'admin', password })).status,
    429,
    'Limite não pode ser contornado alternando usuários',
  );
  invoke('bin/console.php', 'cleanup');
  console.log(
    JSON.stringify({
      checks,
      status: 'aprovado',
      runtime: 'PHP 8.3 e MariaDB 10.11',
      coverage: [
        'instalação automática',
        'admin único',
        'troca e recuperação de senha',
        'atualização preservando votos',
        'votação concorrente',
        'isolamento das urnas',
        'imagens',
        'sessão',
        'limite de tentativas',
      ],
    }),
  );
} catch (e) {
  console.error(e);
  console.error(errors.slice(-2500));
  process.exitCode = 1;
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
}

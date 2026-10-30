import { env as bindings } from 'cloudflare:workers';
const env = bindings as any;
const enc = new TextEncoder();
const DB = () => env.DB as D1Database;
const uuid = () => crypto.randomUUID();
const date = (n = 0) => new Date(Date.now() + n).toISOString();
function fail(message: string, status = 400): never {
  throw Object.assign(Error(message), { status });
}
const clean = (v: any, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clone = (v: any) => JSON.parse(JSON.stringify(v));
function json(value: any, status = 200, headers: any = {}) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}
async function hash(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
function token() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
async function passHash(password: string, salt = token()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return (
    salt + ':' + [...new Uint8Array(bits)].map((x) => x.toString(16).padStart(2, '0')).join('')
  );
}
async function verifyPass(password: any, expected: string) {
  return (
    typeof password === 'string' &&
    password.length <= 128 &&
    (await passHash(password, expected.split(':')[0])) === expected
  );
}
function status(e: any) {
  return e.closed
    ? 'closed'
    : !e.published
      ? 'draft'
      : date() >= e.endsAt
        ? 'closed'
        : date() < e.startsAt
          ? 'scheduled'
          : 'active';
}
function election(s: any, id: string) {
  const e = s.elections.find((e: any) => e.id === id);
  if (!e) fail('Eleição não encontrada.', 404);
  return e;
}
function draft(s: any, id: string) {
  const e = election(s, id);
  if (e.published || e.closed) fail('Esta eleição já foi publicada. Duplique-a para alterar.', 409);
  return e;
}
function terminal(s: any, id: string) {
  const t = s.terminals.find((t: any) => t.id === id);
  if (!t) fail('Urna não encontrada.', 404);
  return t;
}
function linked(s: any, tid: string, eid: string) {
  return (
    terminal(s, tid).electionId === eid || (s.electionTerminalLinks?.[eid] || []).includes(tid)
  );
}
function electionTerminals(s: any, eid: string) {
  return s.terminals.filter((t: any) => linked(s, t.id, eid));
}
function terminalChoices(s: any, tid: string) {
  return s.elections
    .filter((e: any) => linked(s, tid, e.id) && ['active', 'scheduled'].includes(status(e)))
    .map((e: any) => ({
      id: e.id,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      status: status(e),
    }));
}
function resolveElection(s: any, tid: string, requested: string) {
  const choices = terminalChoices(s, tid);
  if (!requested) {
    if (!choices.length) fail('Não há eleição aberta nesta urna.', 409);
    if (choices.length !== 1) fail('Escolha uma eleição nesta urna.');
    requested = choices[0].id;
  }
  if (!linked(s, tid, requested)) fail('Esta eleição não está disponível nesta urna.', 409);
  return election(s, requested);
}
function matricula(v: any) {
  const m = clean(v, 81);
  if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,79}$/.test(m)) fail('Matrícula inválida.');
  return m;
}
/** Lê o documento JSON e sua revisão; este banco de teste é separado do MySQL. */
async function load() {
  const r = await DB()
    .prepare("SELECT value,revision FROM demo_state WHERE id='main'")
    .first<any>();
  if (!r) fail('Entre no painel para preparar o ambiente de testes.', 503);
  return { s: JSON.parse(r.value), revision: r.revision, raw: r.value };
}
/** Compare-and-swap: repete a leitura se outra escrita mudou a revisão do estado. */
async function mutate(fn: (s: any) => any) {
  for (let i = 0; i < 15; i++) {
    const { s, revision, raw } = await load();
    const result = fn(s);
    const value = JSON.stringify(s);
    if (value === raw) return result;
    const r = await DB()
      .prepare("UPDATE demo_state SET value=?,revision=revision+1 WHERE id='main' AND revision=?")
      .bind(value, revision)
      .run();
    if (r.meta.changes === 1) return result;
  }
  fail('Há outra operação em andamento. Tente novamente.', 409);
}
async function seed() {
  if (await DB().prepare("SELECT id FROM demo_state WHERE id='main'").first()) return;
  const eid = uuid();
  const candidates = [
    {
      id: uuid(),
      electionId: eid,
      name: 'Leão · exemplo',
      code: '1',
      image: '/characters/lion.svg',
      viceName: 'Coruja · vice',
      viceImage: '/characters/owl.svg',
      active: 1,
    },
    {
      id: uuid(),
      electionId: eid,
      name: 'Raposa · exemplo',
      code: '12',
      image: '/characters/fox.svg',
      viceName: 'Leão · vice',
      viceImage: '/characters/lion.svg',
      active: 1,
    },
  ];
  const students = [
    { matricula: '1001', name: 'Ana · teste', className: '6A' },
    { matricula: '1002', name: 'Bruno · teste', className: '6A' },
    { matricula: '1003', name: 'Carla · teste', className: '6B' },
  ];
  const state = {
    password: await passHash(env.DEMO_PASSWORD),
    authVersion: 1,
    elections: [
      {
        id: eid,
        name: 'Eleição de demonstração',
        digits: 5,
        hasVice: 1,
        requireMatricula: 1,
        published: 1,
        closed: 0,
        startsAt: date(-60000),
        endsAt: date(30 * 86400000),
        candidateSnapshot: clone(candidates),
        candidates,
      },
    ],
    students,
    terminals: [
      {
        id: 'urna-padrao',
        name: 'Urna padrão',
        location: 'Ambiente de testes',
        model: 'standard',
        electionId: eid,
      },
      {
        id: 'urna-infantil',
        name: 'Urna infantil',
        location: 'Ambiente de testes',
        model: 'images',
        electionId: eid,
      },
    ],
    electors: {
      [eid]: students.map((s) => ({
        ...s,
        voted: 0,
        gateHash: null,
        expires: 0,
        terminalId: null,
      })),
    },
    ballots: [],
  };
  await DB()
    .prepare("INSERT OR IGNORE INTO demo_state (id,revision,value) VALUES ('main',0,?)")
    .bind(JSON.stringify(state))
    .run();
}
async function throttle(id: string) {
  const now = Date.now();
  const k = await hash(id);
  await DB()
    .prepare(
      'INSERT INTO demo_limits (id,attempts,until) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN until<? THEN 1 ELSE attempts+1 END,until=CASE WHEN until<? THEN ? ELSE until END',
    )
    .bind(k, now + 60000, now, now, now + 60000)
    .run();
  const r = await DB().prepare('SELECT attempts FROM demo_limits WHERE id=?').bind(k).first<any>();
  if (r.attempts > 45) fail('Muitas tentativas. Aguarde um minuto.', 429);
}
const PERMISSIONS = ['manageElections', 'manageVoters', 'publishElections', 'viewResults'];
function account(s: any, id: string) {
  if (id === 'demo-admin')
    return {
      id,
      name: s.adminName || 'Administrador de testes',
      username: 'admin',
      role: 'admin',
      active: 1,
      owner: 1,
      permissions: PERMISSIONS,
      classes: null,
      electionIds: [],
      password: s.password,
      authVersion: s.authVersion,
    };
  const a = (s.accounts || []).find((a: any) => a.id === id);
  if (!a || !a.active) fail('Sua sessão expirou. Entre novamente.', 401);
  return a;
}
function canonicalClass(s: any, name: string): string {
  return (s.classAliases || []).find((a: any) => a.name === name)?.currentName || name;
}
function className(v: any): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 80 || /[\x00-\x1f\x7f]/.test(v))
    fail('Informe uma turma de até 80 caracteres.');
  return v.trim();
}
function matriculaLocked(s: any, m: string) {
  return (Object.values(s.electors) as any[][]).some((rows) => rows.some((r) => r.matricula === m));
}
function activeStudents(s: any): any[] {
  return s.students.filter((r: any) => r.active !== 0);
}
function saveStudent(s: any, v: any) {
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 160)
    fail('Informe o nome do aluno, com até 160 caracteres.');
  const name = v.name.trim(),
    m = matricula(v.matricula),
    group = canonicalClass(s, className(v.className)),
    editing = Object.prototype.hasOwnProperty.call(v, 'originalMatricula'),
    original = editing ? matricula(v.originalMatricula) : null;
  if (editing) {
    const old = activeStudents(s).find((r: any) => r.matricula === original);
    if (!old) fail('Aluno não encontrado. Atualize a lista.', 404);
    if (m !== original) {
      if (s.students.some((r: any) => r.matricula === m))
        fail('Esta matrícula já está cadastrada. Edite o aluno existente.', 409);
      if (matriculaLocked(s, original!))
        fail(
          'Esta matrícula já está vinculada a uma eleição. Você pode editar o nome e a turma.',
          409,
        );
    }
    Object.assign(old, { matricula: m, name, className: group });
  } else {
    const old = s.students.find((r: any) => r.matricula === m);
    if (old && old.active !== 0)
      fail('Esta matrícula já está cadastrada. Edite o aluno existente.', 409);
    const value = { matricula: m, name, className: group, active: 1 };
    if (old) Object.assign(old, value);
    else s.students.push(value);
  }
  return { ok: true, matricula: m, className: group };
}
/** Remove do cadastro ativo e preserva as listas já salvas e a participação. */
function deleteStudent(s: any, b: any) {
  const m = matricula(b.matricula),
    group = canonicalClass(s, className(b.className)),
    old = activeStudents(s).find((r: any) => r.matricula === m);
  if (!old) fail('Aluno não encontrado. Atualize a lista.', 404);
  if (old.className !== group)
    fail('O aluno mudou de turma. Atualize a lista antes de excluir.', 409);
  old.active = 0;
  return { ok: true, matricula: m, className: old.className };
}
function renameClass(s: any, b: any) {
  const from = canonicalClass(s, className(b.from)),
    name = className(b.name);
  if (!activeStudents(s).some((r: any) => r.className === from))
    fail('Turma não encontrada. Atualize a lista.', 404);
  if (from === name) return { ok: true, name };
  const target = canonicalClass(s, name);
  if ((target !== name && target !== from) || s.students.some((r: any) => r.className === name))
    fail('Já existe uma turma com esse nome. Escolha outro nome.', 409);
  for (const row of s.students) if (row.className === from) row.className = name;
  s.classAliases ||= [];
  for (const a of s.classAliases) if (a.currentName === from) a.currentName = name;
  const alias = s.classAliases.find((a: any) => a.name === from);
  if (alias) alias.currentName = name;
  else s.classAliases.push({ name: from, currentName: name });
  return { ok: true, name };
}
function profile(a: any, s: any) {
  return {
    id: a.id,
    name: a.name,
    username: a.username,
    role: a.role,
    active: a.active,
    owner: a.owner || 0,
    permissions: a.role === 'admin' ? PERMISSIONS : a.permissions || [],
    classes:
      a.role === 'admin'
        ? null
        : a.classes === null
          ? null
          : [...new Set((a.classes || []).map((c: string) => canonicalClass(s, c)))],
    electionIds: a.role === 'admin' ? [] : a.electionIds || [],
  };
}
function can(me: any, p: string) {
  return me.role === 'admin' || (me.permissions || []).includes(p);
}
function classAllowed(me: any, c: string, s: any) {
  return (
    me.role === 'admin' ||
    me.classes === null ||
    (me.classes || []).some((x: string) => canonicalClass(s, x) === canonicalClass(s, c))
  );
}
function hasElection(me: any, e: any) {
  return me.role === 'admin' || e.ownerId === me.id || (me.electionIds || []).includes(e.id);
}
/** A API valida permissões e escopos em toda operação, inclusive chamadas diretas. */
function access(s: any, me: any, action: string, b: any) {
  if (
    [
      'account',
      'csvImport',
      'csvPreview',
      'terminal',
      'student',
      'renameClass',
      'deleteStudent',
    ].includes(action)
  ) {
    if (me.role !== 'admin') fail('Somente administradores podem fazer esta ação.', 403);
    return;
  }
  const permission = (
    {
      election: 'manageElections',
      candidate: 'manageElections',
      duplicate: 'manageElections',
      image: 'manageElections',
      enroll: 'manageVoters',
      electors: 'manageVoters',
      unlock: 'manageVoters',
      publish: 'publishElections',
      close: 'publishElections',
    } as any
  )[action];
  if (!permission) fail('Ação inválida.');
  if (!can(me, permission)) fail('O administrador não liberou esta ação para sua conta.', 403);
  const v = b.value || {},
    id = action === 'election' ? v.id : action === 'candidate' ? v.electionId : b.electionId;
  if (id) {
    const e = election(s, id);
    if (!hasElection(me, e)) fail('Esta eleição não foi liberada para sua conta.', 403);
  }
  if (
    action === 'publish' &&
    (s.electors[id] || []).some((r: any) => !classAllowed(me, r.className, s))
  )
    fail('Há turmas fora do seu acesso. Peça ao administrador para publicar esta eleição.', 403);
}
async function user(req: Request, panel = true) {
  const visitor = req.headers.get('oai-authenticated-user-id'),
    panelHash = await hash(req.headers.get('x-urna-panel') || '');
  let r: any = null;
  if (visitor) {
    r = panel
      ? await DB()
          .prepare(
            'SELECT * FROM demo_sessions WHERE visitor_hash=? AND panel_hash=? AND expires>? ORDER BY expires DESC LIMIT 1',
          )
          .bind(await hash(visitor), panelHash, Date.now())
          .first<any>()
      : await DB()
          .prepare(
            'SELECT * FROM demo_sessions WHERE visitor_hash=? AND expires>? ORDER BY expires DESC LIMIT 1',
          )
          .bind(await hash(visitor), Date.now())
          .first<any>();
  } else {
    const m = (req.headers.get('cookie') || '').match(
      /(?:^|;\s*)__Host-urna_demo=([A-Za-z0-9_-]+)/,
    );
    if (m)
      r = await DB()
        .prepare('SELECT * FROM demo_sessions WHERE id=? AND visitor_hash IS NULL AND expires>?')
        .bind(await hash(m[1]), Date.now())
        .first<any>();
  }
  if (!r) fail('Sua sessão expirou. Entre novamente.', 401);
  const { s } = await load(),
    a = account(s, r.account_id || 'demo-admin');
  if (a.authVersion !== r.version) fail('Entre novamente.', 401);
  if (panel && panelHash !== r.panel_hash) fail('Entre no painel nesta aba.', 401);
  return profile(a, s);
}
async function session(version: number, req: Request, accountId = 'demo-admin') {
  const value = token(),
    panel = token(),
    visitor = req.headers.get('oai-authenticated-user-id');
  await DB()
    .prepare(
      'INSERT INTO demo_sessions (id,panel_hash,visitor_hash,expires,version,account_id) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      await hash(value),
      await hash(panel),
      visitor ? await hash(visitor) : null,
      Date.now() + 43200000,
      version,
      accountId,
    )
    .run();
  return json({ ok: true, panelKey: panel }, 200, {
    'Set-Cookie':
      '__Host-urna_demo=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200',
  });
}
function state(s: any, me: any) {
  const locked = new Set(
    (Object.values(s.electors) as any[][]).flatMap((rows) => rows.map((r) => r.matricula)),
  );
  const students = activeStudents(s),
    classes = [...new Set(students.map((r: any) => r.className))]
      .filter((c: any) => classAllowed(me, c, s))
      .sort()
      .map((name) => ({ name, count: students.filter((r: any) => r.className === name).length }));
  return {
    me,
    classes,
    accounts:
      me.role === 'admin'
        ? [
            profile(account(s, 'demo-admin'), s),
            ...(s.accounts || []).map((a: any) => profile(a, s)),
          ]
        : [],
    students:
      me.role === 'admin'
        ? students.map((r: any) => ({ ...r, matriculaLocked: locked.has(r.matricula) }))
        : [],
    terminals: s.terminals.map((t: any) => ({
      ...t,
      electionId: t.electionId && hasElection(me, election(s, t.electionId)) ? t.electionId : null,
    })),
    elections: s.elections
      .filter((e: any) => hasElection(me, e))
      .map((e: any) => ({
        ...e,
        terminalIds: electionTerminals(s, e.id).map((t: any) => t.id),
        electorClasses: [
          ...new Set(
            (s.electors[e.id] || []).map((r: any) =>
              e.published ? r.className : canonicalClass(s, r.className),
            ),
          ),
        ].sort(),
        electorCount: (s.electors[e.id] || []).length,
        votedCount: (s.electors[e.id] || []).filter((x: any) => x.voted).length,
        results: can(me, 'viewResults')
          ? e.candidateSnapshot.map((c: any) => ({
              candidateId: c.id,
              kind: 'valid',
              total: s.ballots.filter((b: any) => b.electionId === e.id && b.candidateId === c.id)
                .length,
            }))
          : [],
      })),
  };
}
function saveAccount(s: any, me: any, v: any, password: string | null) {
  const id = clean(v.id) || uuid(),
    name = clean(v.name),
    username = clean(v.username, 81).toLowerCase(),
    role = v.role || 'staff',
    permissions = v.permissions || [],
    classes = v.classes === undefined ? [] : v.classes,
    electionIds = v.electionIds || [],
    active = v.active ? 1 : 0;
  if (!name || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(username) || !['admin', 'staff'].includes(role))
    fail('Informe nome e usuário de 3 a 80 caracteres, sem espaços ou acentos.');
  if (!Array.isArray(permissions) || permissions.some((p: any) => !PERMISSIONS.includes(p)))
    fail('Permissões inválidas.');
  if (
    classes !== null &&
    (!Array.isArray(classes) ||
      classes.length > 500 ||
      classes.some((c: any) => typeof c !== 'string' || !c.trim() || c.length > 80))
  )
    fail('Selecione as turmas permitidas.');
  if (
    !Array.isArray(electionIds) ||
    electionIds.length > 1000 ||
    electionIds.some((x: any) => typeof x !== 'string')
  )
    fail('Selecione as eleições permitidas.');
  for (const eid of electionIds) election(s, eid);
  if ((id === 'demo-admin' || id === me.id) && (role !== 'admin' || !active))
    fail('Você não pode desativar ou retirar o acesso administrativo desta conta.');
  if (id === 'demo-admin' && username !== 'admin') fail('O usuário principal permanece admin.');
  s.accounts ||= [];
  const old = id === 'demo-admin' ? account(s, id) : s.accounts.find((a: any) => a.id === id);
  if (v.id && !old) fail('Conta não encontrada.', 404);
  if (!old && !password) fail('Defina uma senha com pelo menos 10 caracteres.');
  if (
    (username === 'admin' && id !== 'demo-admin') ||
    s.accounts.some((a: any) => a.username === username && a.id !== id)
  )
    fail('Este usuário já existe.');
  if (id === 'demo-admin') {
    s.adminName = name;
    if (password) {
      s.password = password;
      s.authVersion++;
    }
    return { ok: true, id };
  }
  const value = {
    id,
    name,
    username,
    role,
    active,
    owner: 0,
    permissions: [...new Set(permissions)],
    classes: classes === null ? null : [...new Set(classes)],
    electionIds: [...new Set(electionIds)],
    password: password || old?.password,
    authVersion: (old?.authVersion || 1) + (old && (password || !active) ? 1 : 0),
  };
  if (old) Object.assign(old, value);
  else s.accounts.push(value);
  return { ok: true, id };
}
function csvRows(text: any) {
  if (typeof text !== 'string' || enc.encode(text).length > 1500000)
    fail('Envie CSV UTF-8 de até 1,5 MB.');
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0];
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) fail('CSV com aspas não encerradas.');
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  const header = (rows.shift() || []).map((h) =>
    h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  );
  const cols = ['nome', 'turma', 'matricula'].map((h) => header.indexOf(h));
  if (cols.some((n) => n < 0)) fail('Use as colunas nome, turma e matricula.');
  if (!rows.length || rows.length > 10000) fail('Importe de 1 a 10.000 alunos.');
  const seen = new Set();
  return rows.map((r, i) => {
    const name = clean(r[cols[0]]),
      className = clean(r[cols[1]], 80),
      m = matricula(r[cols[2]]);
    if (!name || !className) fail('Confira nome e turma na linha ' + (i + 2));
    if (seen.has(m)) fail('Matrícula repetida na linha ' + (i + 2));
    seen.add(m);
    return { name, className, matricula: m };
  });
}
function validImage(s: string) {
  return (
    !s || /^\/characters\/(lion|owl|fox)\.svg$/.test(s) || /^\/api\/images\/[a-f0-9-]{36}$/.test(s)
  );
}
async function upload(b: any) {
  const match =
    typeof b.imageData === 'string' &&
    b.imageData.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) fail('Escolha PNG, JPG ou WebP.');
  const data = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  if (data.length > 2097152 || data.length < 12) fail('Envie imagem de até 2 MB.');
  const id = uuid();
  await env.BUCKET.put(id, data, { httpMetadata: { contentType: match[1] } });
  return { image: '/api/images/' + id };
}
async function admin(req: Request, b: any) {
  const me = await user(req),
    action = b.action,
    v = b.value || {};
  const snapshot = (await load()).s;
  access(snapshot, me, action, b);
  let preparedHash: string | null = null;
  if (action === 'account' && v.password) {
    if (typeof v.password !== 'string' || v.password.length < 10 || v.password.length > 128)
      fail('Use uma senha com 10 a 128 caracteres.');
    preparedHash = await passHash(v.password);
  }
  if (action === 'image') return json(await upload(b));
  if (action === 'csvPreview') {
    const rows = csvRows(b.csv);
    return json({ rows, count: rows.length });
  }
  if (action === 'electors') {
    const { s } = await load();
    return json({
      rows: (s.electors[b.electionId] || [])
        .filter((r: any) => classAllowed(me, r.className, s))
        .map((r: any) => ({
          matricula: r.matricula,
          name: r.name,
          className: r.className,
          voted: r.voted,
          released: r.gateHash && r.expires > Date.now() ? 1 : 0,
        })),
    });
  }
  const students = action === 'csvImport' ? csvRows(b.csv) : null;
  const result = await mutate((s) => {
    const current = profile(account(s, me.id), s);
    access(s, current, action, b);
    if (action === 'student') return saveStudent(s, v);
    if (action === 'deleteStudent') return deleteStudent(s, b);
    if (action === 'renameClass') return renameClass(s, b);
    if (action === 'account') return saveAccount(s, current, v, preparedHash);
    if (action === 'election') {
      const name = clean(v.name),
        digits = Number(v.digits);
      if (!name || !Number.isInteger(digits) || digits < 1 || digits > 5)
        fail('Informe nome e limite de 1 a 5 dígitos.');
      if (v.id) {
        const e = draft(s, v.id);
        if (e.candidates.some((c: any) => c.code.length > digits))
          fail('Um candidato excede o limite escolhido.');
        Object.assign(e, {
          name,
          digits,
          hasVice: v.hasVice ? 1 : 0,
          requireMatricula: v.requireMatricula ? 1 : 0,
        });
        return { ok: true, id: e.id };
      }
      const id = uuid();
      s.elections.push({
        id,
        ownerId: me.id,
        name,
        digits,
        hasVice: v.hasVice ? 1 : 0,
        requireMatricula: v.requireMatricula ? 1 : 0,
        published: 0,
        closed: 0,
        startsAt: null,
        endsAt: null,
        candidateSnapshot: [],
        candidates: [],
      });
      return { ok: true, id };
    }
    if (action === 'candidate') {
      const e = draft(s, v.electionId),
        name = clean(v.name),
        code = clean(v.code, 6),
        image = clean(v.image, 250),
        viceName = clean(v.viceName),
        viceImage = clean(v.viceImage, 250);
      if (!name || !/^(0|[1-9][0-9]{0,4})$/.test(code) || code.length > e.digits)
        fail('Informe nome e número válido, sem zero automático.');
      if (e.hasVice && !viceName) fail('Informe o vice.');
      if (!validImage(image) || !validImage(viceImage)) fail('Imagem inválida.');
      if (e.candidates.some((c: any) => c.code === code && c.id !== v.id))
        fail('Número já cadastrado nesta eleição.');
      const c = {
        id: v.id || uuid(),
        electionId: e.id,
        name,
        code,
        image,
        viceName: e.hasVice ? viceName : '',
        viceImage: e.hasVice ? viceImage : '',
        active: v.active ? 1 : 0,
      };
      if (v.id) {
        const i = e.candidates.findIndex((x: any) => x.id === v.id);
        if (i < 0) fail('Candidato não pertence à eleição.');
        e.candidates[i] = c;
      } else e.candidates.push(c);
      return { ok: true };
    }
    if (action === 'csvImport') {
      for (const incoming of students!) {
        const row = { ...incoming, className: canonicalClass(s, incoming.className) };
        const i = s.students.findIndex((x: any) => x.matricula === row.matricula);
        if (i < 0) s.students.push(row);
        else s.students[i] = row;
      }
      return { ok: true, count: students!.length };
    }
    if (action === 'enroll') {
      const e = draft(s, b.electionId),
        classes = b.classes || [];
      if (
        !Array.isArray(classes) ||
        classes.length > 500 ||
        classes.some((c: any) => typeof c !== 'string')
      )
        fail('Selecione as turmas.');
      if (
        current.role !== 'admin' &&
        (!classes.length || classes.some((c: string) => !classAllowed(current, c, s)))
      )
        fail('Selecione apenas as turmas liberadas para sua conta.', 403);
      const resolved = classes.map((c: string) => canonicalClass(s, c));
      const rows = activeStudents(s).filter(
        (r: any) => !resolved.length || resolved.includes(r.className),
      );
      if (!rows.length) fail('Não há alunos nas turmas selecionadas.');
      s.electors[e.id] = rows.map((r: any) => ({
        ...r,
        voted: 0,
        gateHash: null,
        expires: 0,
        terminalId: null,
      }));
      return { ok: true };
    }
    if (action === 'terminal') {
      const id = v.id || uuid(),
        old = s.terminals.find((t: any) => t.id === id),
        name = clean(v.name);
      if (!name || !['standard', 'images'].includes(v.model)) fail('Informe nome e modelo.');
      if (
        old?.electionId &&
        ['active', 'scheduled'].includes(status(election(s, old.electionId))) &&
        (old.electionId !== (v.electionId || null) || old.model !== v.model)
      )
        fail('Encerre a eleição antes de trocar a urna.');
      const e = v.electionId ? election(s, v.electionId) : null;
      if (
        e?.published &&
        v.model === 'images' &&
        e.candidateSnapshot.some((c: any) => !c.image || (e.hasVice && !c.viceImage))
      )
        fail('Esta eleição exige fotos dos candidatos e dos vices.');
      const t = {
        id,
        name,
        location: clean(v.location),
        model: v.model,
        electionId: v.electionId || null,
      };
      if (old) Object.assign(old, t);
      else s.terminals.push(t);
      return { ok: true };
    }
    if (action === 'publish') {
      const e = draft(s, b.electionId);
      const start = new Date(b.startsAt),
        end = new Date(b.endsAt);
      if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || +end <= Date.now())
        fail('Confira o período.');
      const candidates = e.candidates
        .filter((c: any) => c.active)
        .map((c: any) => ({
          ...c,
          viceName: e.hasVice ? c.viceName : '',
          viceImage: e.hasVice ? c.viceImage : '',
        }));
      if (!candidates.length || (e.hasVice && candidates.some((c: any) => !c.viceName)))
        fail('Confira os candidatos e vices.');
      if (e.requireMatricula && !(s.electors[e.id] || []).length)
        fail('Selecione os eleitores desta eleição.');
      const terms = electionTerminals(s, e.id),
        models = b.models;
      if (
        models !== undefined &&
        (!Array.isArray(models) ||
          !models.length ||
          models.length > 2 ||
          new Set(models).size !== models.length ||
          models.some((m: any) => !['standard', 'images'].includes(m)))
      )
        fail('Escolha a urna com teclado, por imagens ou as duas.');
      const chosen = models || [...new Set(terms.map((t: any) => t.model))];
      if (!chosen.length) fail('Escolha uma urna antes de publicar.');
      if (chosen.includes('images')) {
        const missing = candidates.find((c: any) => !c.image || (e.hasVice && !c.viceImage));
        if (missing)
          fail('Complete as fotos do prefeito e do vice da chapa número ' + missing.code + '.');
      }
      if (models) {
        s.electionTerminalLinks ||= {};
        s.electionTerminalLinks[e.id] = models.map((model: string) =>
          model === 'images' ? 'urna-infantil' : 'urna-padrao',
        );
        for (const t of terms)
          if (t.electionId === e.id && !models.includes(t.model)) t.electionId = null;
      }
      Object.assign(e, {
        published: 1,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        candidateSnapshot: clone(candidates),
      });
      return { ok: true };
    }
    if (action === 'close') {
      election(s, b.electionId).closed = 1;
      for (const r of s.electors[b.electionId] || [])
        Object.assign(r, { gateHash: null, expires: 0, terminalId: null });
      return { ok: true };
    }
    if (action === 'unlock') {
      election(s, b.electionId);
      const r = (s.electors[b.electionId] || []).find((r: any) => r.matricula === b.matricula);
      if (r && !classAllowed(current, r.className, s)) fail('Esta turma não foi liberada.', 403);
      if (r && !r.voted) Object.assign(r, { gateHash: null, expires: 0, terminalId: null });
      return { ok: true };
    }
    if (action === 'duplicate') {
      const old = election(s, b.electionId),
        id = uuid();
      s.elections.push({
        ...clone(old),
        id,
        ownerId: me.id,
        name: (old.name + ' — cópia').slice(0, 160),
        published: 0,
        closed: 0,
        startsAt: null,
        endsAt: null,
        candidateSnapshot: [],
        candidates: old.candidates.map((c: any) => ({ ...c, id: uuid(), electionId: id })),
      });
      return { ok: true, id };
    }
    fail('Ação inválida.');
  });
  return json(result);
}
/** Votação do adaptador: a participação e o voto são atualizados no mesmo estado. */
async function publicTerminal(req: Request, id: string, b: any) {
  if (req.method === 'GET') {
    const { s } = await load(),
      t = terminal(s, id),
      choices = terminalChoices(s, id),
      requested = new URL(req.url).searchParams.get('election') || '',
      e = requested || choices.length === 1 ? clone(resolveElection(s, id, requested)) : null;
    if (e) {
      delete e.candidates;
      delete e.ownerId;
      e.results = [];
      e.status = status(e);
      if (e.status !== 'active') e.candidateSnapshot = [];
    }
    return json({ terminal: t, election: e, elections: choices });
  }
  const action = b.action || 'vote';
  let gate: string | null = null,
    gateHash: string | null = null;
  if (action === 'authorize') {
    matricula(b.matricula);
    await throttle('gate:' + id + ':' + (req.headers.get('cf-connecting-ip') || ''));
    gate = token();
    gateHash = await hash(gate);
  }
  const providedHash = typeof b.gate === 'string' ? await hash(b.gate) : '';
  const result = await mutate((s) => {
    const t = terminal(s, id);
    if (action === 'cancel') {
      for (const list of Object.values(s.electors) as any[])
        for (const r of list)
          if (!r.voted && r.terminalId === id && r.gateHash === providedHash)
            Object.assign(r, { gateHash: null, expires: 0, terminalId: null });
      return { ok: true };
    }
    const e = resolveElection(s, id, clean(b.electionId));
    if (action === 'authorize') {
      if (status(e) !== 'active') fail('A eleição não está aberta.', 409);
      if (!e.requireMatricula) fail('Esta eleição não exige matrícula.');
      const r = (s.electors[e.id] || []).find((r: any) => r.matricula === b.matricula);
      if (!r) fail('Matrícula não habilitada para esta eleição.', 403);
      if (r.voted) fail('Esta matrícula já votou nesta eleição.', 409);
      if (r.gateHash && r.expires > Date.now())
        fail(
          'Esta matrícula já está liberada. Aguarde até 5 minutos ou peça o cancelamento ao responsável.',
          409,
        );
      Object.assign(r, { gateHash, expires: Date.now() + 300000, terminalId: id });
      return { ok: true, gate, name: r.name, className: r.className, expiresIn: 300 };
    }
    if (action !== 'vote') fail('Ação inválida.');
    if (
      !/^[a-f0-9-]{36}$/i.test(b.requestId || '') ||
      !/^(0|[1-9][0-9]{0,4})$/.test(b.code || '') ||
      b.blank
    )
      fail('Número ou confirmação inválidos.');
    const chosen = election(s, b.electionId);
    const c = chosen.candidateSnapshot.find((c: any) => c.code === b.code);
    if (!c) fail('Número inválido.');
    const old = s.ballots.find((r: any) => r.id === b.requestId);
    if (old) {
      if (old.electionId === chosen.id && old.candidateId === c.id)
        return { ok: true, duplicate: true };
      fail('Esta confirmação já foi utilizada.', 409);
    }
    if (chosen.id !== e.id || status(e) !== 'active')
      fail('A eleição não está aberta nesta urna.', 409);
    if (e.requireMatricula) {
      const r = (s.electors[e.id] || []).find(
        (r: any) => r.gateHash === providedHash && providedHash,
      );
      if (!r || r.voted || r.expires <= Date.now() || r.terminalId !== id)
        fail('A liberação expirou ou foi utilizada. Informe a matrícula novamente.', 403);
      Object.assign(r, { voted: 1, gateHash: null, expires: 0, terminalId: null });
    }
    s.ballots.push({ id: b.requestId, electionId: e.id, candidateId: c.id, kind: 'valid' });
    return { ok: true };
  });
  return json(result);
}
export async function endpoint(req: Request) {
  try {
    const path = new URL(req.url).pathname;
    let b: any = {};
    if (req.method === 'POST') {
      if (req.headers.get('origin') !== new URL(req.url).origin)
        fail('Origem da solicitação inválida.', 403);
      if (Number(req.headers.get('content-length') || 0) > 2850000)
        fail('Arquivo muito grande.', 413);
      const raw = await req.text();
      if (enc.encode(raw).length > 2850000) fail('Arquivo muito grande.', 413);
      try {
        b = JSON.parse(raw);
      } catch {
        fail('JSON inválido.');
      }
    }
    if (path === '/api/auth') {
      if (req.method !== 'POST') fail('Método não permitido.', 405);
      if (b.action === 'login') {
        await throttle('login:' + (req.headers.get('cf-connecting-ip') || ''));
        if (!env.DEMO_PASSWORD) fail('Acesso de teste ainda não configurado.', 503);
        await seed();
        const { s } = await load();
        const username = clean(b.username, 80).toLowerCase(),
          a =
            username === 'admin'
              ? account(s, 'demo-admin')
              : (s.accounts || []).find((a: any) => a.username === username && a.active);
        if (!a || !(await verifyPass(b.password, a.password)))
          fail('Usuário ou senha incorretos.', 401);
        return await session(a.authVersion, req, a.id);
      }
      if (b.action === 'logout') {
        const visitor = req.headers.get('oai-authenticated-user-id');
        if (visitor)
          await DB()
            .prepare('DELETE FROM demo_sessions WHERE visitor_hash=?')
            .bind(await hash(visitor))
            .run();
        else {
          const m = (req.headers.get('cookie') || '').match(/__Host-urna_demo=([A-Za-z0-9_-]+)/);
          if (m)
            await DB()
              .prepare('DELETE FROM demo_sessions WHERE id=? AND visitor_hash IS NULL')
              .bind(await hash(m[1]))
              .run();
        }
        return json({ ok: true }, 200, {
          'Set-Cookie': '__Host-urna_demo=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0',
        });
      }
      if (b.action === 'password') {
        const me = await user(req),
          { s } = await load(),
          a = account(s, me.id);
        if (!(await verifyPass(b.currentPassword, a.password))) fail('Senha atual incorreta.');
        if (
          typeof b.newPassword !== 'string' ||
          b.newPassword.length < 10 ||
          b.newPassword.length > 128 ||
          b.newPassword !== b.confirmPassword
        )
          fail('Use senhas iguais, de 10 a 128 caracteres.');
        const password = await passHash(b.newPassword),
          version = await mutate((st) => {
            const target = me.id === 'demo-admin' ? st : account(st, me.id);
            if (target.password !== a.password) fail('A senha foi alterada. Entre novamente.', 409);
            target.password = password;
            return ++target.authVersion;
          });
        return await session(version, req, me.id);
      }
      fail('Ação inválida.');
    }
    if (path === '/api/v2/app') {
      if (req.method === 'GET') {
        const me = await user(req);
        return json(state((await load()).s, me));
      }
      return await admin(req, b);
    }
    const t = path.match(/^\/api\/v2\/urna\/([a-zA-Z0-9-]+)$/);
    if (t) return await publicTerminal(req, t[1], b);
    const image = path.match(/^\/api\/images\/([a-zA-Z0-9-]+)$/);
    if (image && req.method === 'GET') {
      let allowed = false;
      try {
        await user(req, false);
        allowed = true;
      } catch {}
      if (!allowed) {
        const { s } = await load();
        allowed = s.elections.some(
          (e: any) =>
            status(e) === 'active' &&
            e.candidateSnapshot.some((c: any) => [c.image, c.viceImage].includes(path)),
        );
      }
      if (!allowed) fail('Imagem não disponível.', 403);
      const object = await env.BUCKET.get(image[1]);
      if (!object) fail('Imagem não encontrada.', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'image/png',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=60',
        },
      });
    }
    fail('Endereço não encontrado.', 404);
  } catch (e: any) {
    return json(
      { error: e.status ? e.message : 'Não foi possível concluir. Tente novamente.' },
      e.status || 500,
    );
  }
}

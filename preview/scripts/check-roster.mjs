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
const initial = (await call('/api/v2/app')).body,
  seed = initial.elections[0],
  initialRows = (await app('electors', { electionId: seed.id })).body.rows;
const student = (value) => app('student', { value });
const current = async () => (await call('/api/v2/app')).body;
const count = async (c) => (await current()).classes.find((x) => x.name === c)?.count || 0;
ok(
  (await student({ name: 'Aluna manual', matricula: '00901', className: '6A' })).status === 200,
  'Aluno manual em turma existente',
);
ok((await count('6A')) === 3, 'Contagem da turma atualizada');
ok(
  (await student({ name: 'Outro aluno', matricula: '00902', className: '6A' })).status === 200,
  'Segundo aluno sem arquivo',
);
ok(
  (await student({ name: 'Nova turma', matricula: '00903', className: '7A' })).status === 200 &&
    (await count('7A')) === 1,
  'Primeiro aluno cria turma separada',
);
const beforeInvalid = (await current()).students;
for (const value of [
  { name: '', matricula: '00999', className: '6A' },
  { name: 'Erro', matricula: '00 99', className: '6A' },
  { name: 'Erro', matricula: '00999', className: '' },
  { name: 'Erro', matricula: '00999', className: 'x'.repeat(81) },
  { name: 'Erro', matricula: '00999', className: '6\nA' },
])
  ok((await student(value)).status === 400, 'Campos inválidos recusados');
ok(
  JSON.stringify((await current()).students) === JSON.stringify(beforeInvalid),
  'Falhas não alteram cadastro',
);
ok(
  (await student({ name: 'Duplicado', matricula: '00901', className: '7A' })).status === 409,
  'Matrícula duplicada recusada',
);
ok(
  (
    await student({
      originalMatricula: '00901',
      name: 'Nome corrigido',
      matricula: '00901',
      className: '7A',
    })
  ).status === 200,
  'Editar nome e transferir turma',
);
ok(
  (await current()).students.find((x) => x.matricula === '00901').name === 'Nome corrigido' &&
    (await count('7A')) === 2,
  'Transferência e nome persistidos',
);
ok(
  (
    await student({
      originalMatricula: '00903',
      name: 'Nova turma',
      matricula: '000903',
      className: '7A',
    })
  ).status === 200,
  'Corrigir matrícula antes de usar em eleição',
);
ok(
  !(await current()).students.some((x) => x.matricula === '00903') &&
    (await current()).students.some((x) => x.matricula === '000903'),
  'Zeros preservados após correção',
);
ok(
  (
    await student({
      originalMatricula: 'ausente',
      name: 'Erro',
      matricula: 'ausente',
      className: '6A',
    })
  ).status === 404,
  'Edição exige aluno existente',
);
ok(
  (await student({ originalMatricula: '00902', name: 'Erro', matricula: '00901', className: '6A' }))
    .status === 409,
  'Correção não toma matrícula de outro aluno',
);
ok(
  (await current()).students.find((x) => x.matricula === '1001').matriculaLocked,
  'Matrícula de eleitor identificada como protegida',
);
ok(
  (await student({ originalMatricula: '1001', name: 'Erro', matricula: '1009', className: '6A' }))
    .status === 409,
  'Não muda identidade já vinculada à eleição',
);
ok(
  (
    await student({
      originalMatricula: '1001',
      name: 'Cadastro atualizado',
      matricula: '1001',
      className: '6B',
    })
  ).status === 200,
  'Nome e turma do cadastro geral continuam editáveis',
);
ok(
  JSON.stringify((await app('electors', { electionId: seed.id })).body.rows) ===
    JSON.stringify(initialRows),
  'Eleitorado publicado preservado',
);
const user = {
  name: 'Equipe turma QA',
  username: 'turma.qa',
  password: 'TurmasSeguro!123',
  role: 'staff',
  active: 1,
  permissions: ['manageVoters'],
  classes: ['6A'],
  electionIds: [seed.id],
};
ok((await app('account', { value: user })).status === 200, 'Conta com turma específica preparada');
r = await call(
  '/api/auth',
  { action: 'login', username: user.username, password: user.password },
  false,
);
const staff = { cookie: r.headers.get('set-cookie').split(';')[0], panel: r.body.panelKey };
const team = async (action, payload = {}) => {
  const prev = { cookie, panel };
  cookie = staff.cookie;
  panel = staff.panel;
  try {
    return action ? await app(action, payload) : await call('/api/v2/app');
  } finally {
    cookie = prev.cookie;
    panel = prev.panel;
  }
};
ok(
  (await team('student', { value: { name: 'Bloqueado', matricula: '999', className: '6A' } }))
    .status === 403 && (await team('renameClass', { from: '6A', name: '6Z' })).status === 403,
  'Cadastro geral só para administradores',
);
ok((await app('renameClass', { from: '6A', name: '6C' })).status === 200, 'Renomear turma');
ok((await count('6A')) === 0 && (await count('6C')) === 2, 'Turma renomeada sem duplicar alunos');
ok(
  (await team()).body.me.classes[0] === '6C' &&
    (await team()).body.classes.some((c) => c.name === '6C'),
  'Permissões acompanham nome novo',
);
ok(
  (await team('electors', { electionId: seed.id })).body.rows.length === 2,
  'Equipe mantém acesso ao eleitorado histórico',
);
ok(
  JSON.stringify((await app('electors', { electionId: seed.id })).body.rows) ===
    JSON.stringify(initialRows),
  'Renomear não reescreve lista publicada',
);
const beforeConflict = (await current()).students;
ok(
  (await app('renameClass', { from: '6C', name: '7A' })).status === 409 &&
    JSON.stringify((await current()).students) === JSON.stringify(beforeConflict),
  'Turmas existentes não são fundidas por engano',
);
ok(
  (await app('renameClass', { from: 'inexistente', name: '9A' })).status === 404,
  'Renomear exige turma existente',
);
ok((await app('renameClass', { from: '6C', name: '' })).status === 400, 'Nome vazio recusado');
ok(
  (await app('csvImport', { csv: 'nome;turma;matricula\nImportado;6A;00904\n' })).status === 200 &&
    (await current()).students.find((x) => x.matricula === '00904').className === '6C',
  'CSV com nome antigo reconhece turma renomeada',
);
ok(
  (await student({ name: 'Manual antigo', matricula: '00906', className: '6A' })).body.className ===
    '6C',
  'Cadastro manual também reconhece nome antigo',
);
ok(
  (await app('renameClass', { from: '6C', name: '6D' })).status === 200 &&
    (await team()).body.me.classes[0] === '6D',
  'Renomeações consecutivas preservam permissões',
);
ok(
  (await app('renameClass', { from: '6D', name: '6A' })).status === 200 &&
    (await team()).body.me.classes[0] === '6A',
  'É possível retornar ao nome anterior',
);
const copy = (await app('duplicate', { electionId: seed.id })).body.id;
await app('enroll', { electionId: copy, classes: ['6C'] });
let draft = (await current()).elections.find((e) => e.id === copy);
ok(
  draft.electorClasses[0] === '6A' && draft.electorCount === 4,
  'Selecionar turma antiga usa cadastro atual',
);
await student({ name: 'Adicionado depois', matricula: '00905', className: '6A' });
ok(
  (await current()).elections.find((e) => e.id === copy).electorCount === 4,
  'Cadastro não altera eleitorado silenciosamente',
);
await app('enroll', { electionId: copy, classes: ['6A'] });
ok(
  (await current()).elections.find((e) => e.id === copy).electorCount === 5,
  'Atualizar turmas inclui aluno manual no rascunho',
);
ok(
  (await current()).elections.find((e) => e.id === seed.id).electorCount === 3,
  'Eleição publicada permanece com lista original',
);
ok(
  (
    await student({
      originalMatricula: '00905',
      name: 'Adicionado depois',
      matricula: '000905',
      className: '6A',
    })
  ).status === 409,
  'Matrícula vinculada ao rascunho também fica protegida',
);
ok(
  (await team('deleteStudent', { matricula: '00905', className: '6A' })).status === 403,
  'Equipe não exclui aluno',
);
for (const payload of [
  { matricula: '', className: '6A' },
  { matricula: '00905', className: '' },
  { matricula: '00 905', className: '6A' },
])
  ok((await app('deleteStudent', payload)).status === 400, 'Exclusão valida matrícula e turma');
ok(
  (await app('deleteStudent', { matricula: 'ausente', className: '6A' })).status === 404,
  'Excluir exige aluno existente',
);
const rosterBefore = (await current()).students;
ok(
  (await app('deleteStudent', { matricula: '00905', className: '7A' })).status === 409 &&
    JSON.stringify((await current()).students) === JSON.stringify(rosterBefore),
  'Turma desatualizada impede exclusão',
);
const draftBefore = (await app('electors', { electionId: copy })).body.rows;
ok(
  (await app('deleteStudent', { matricula: '00905', className: '6A' })).status === 200 &&
    (await count('6A')) === 4,
  'Administrador exclui aluno',
);
ok(
  !(await current()).students.some((x) => x.matricula === '00905') &&
    (await current()).students.length === rosterBefore.length - 1,
  'Excluído sai do cadastro e demais alunos permanecem',
);
ok(
  JSON.stringify((await app('electors', { electionId: copy })).body.rows) ===
    JSON.stringify(draftBefore),
  'Exclusão não muda rascunho silenciosamente',
);
ok(
  (await app('enroll', { electionId: copy, classes: ['6A'] })).status === 200 &&
    !(await app('electors', { electionId: copy })).body.rows.some((x) => x.matricula === '00905'),
  'Atualização explícita retira excluído do rascunho',
);
ok(
  (await app('deleteStudent', { matricula: '00905', className: '6A' })).status === 404,
  'Segunda exclusão recusada',
);
ok(
  (await student({ originalMatricula: '00905', name: 'Erro', matricula: '00905', className: '6A' }))
    .status === 404,
  'Edição não reativa aluno excluído',
);
ok(
  (await student({ name: 'Reincluído', matricula: '00905', className: '6C' })).status === 200 &&
    (await count('6A')) === 5,
  'Cadastro manual reinclui matrícula e reconhece turma antiga',
);
ok(
  (await current()).students.filter((x) => x.matricula === '00905').length === 1,
  'Reinclusão não duplica aluno',
);
await app('deleteStudent', { matricula: '00905', className: '6C' });
ok(
  (await app('csvImport', { csv: 'nome;turma;matricula\nReincluído CSV;6A;00905\n' })).status ===
    200 && (await current()).students.some((x) => x.matricula === '00905'),
  'CSV reinclui aluno excluído',
);
await student({ name: 'Aluno isolado', matricula: 'solo', className: 'Turma isolada QA' });
ok(
  (await app('deleteStudent', { matricula: 'solo', className: 'Turma isolada QA' })).status ===
    200 && !(await current()).classes.some((c) => c.name === 'Turma isolada QA'),
  'Excluir último aluno remove grupo vazio',
);
// All voting and deletion checks below run only in this in-memory fixture.
const publicRequest = (body) => call('/api/v2/urna/urna-padrao', body, false);
r = await publicRequest({ action: 'authorize', electionId: seed.id, matricula: '1002' });
assert.equal(r.status, 200);
assert.equal(
  (
    await publicRequest({
      requestId: crypto.randomUUID(),
      electionId: seed.id,
      code: '1',
      gate: r.body.gate,
    })
  ).status,
  200,
);
const publishedRows = (await app('electors', { electionId: seed.id })).body.rows,
  publishedResult = (await current()).elections.find((e) => e.id === seed.id).results;
ok(
  (await app('deleteStudent', { matricula: '1002', className: '6A' })).status === 200,
  'Excluir eleitor que votou apenas do cadastro',
);
ok(
  JSON.stringify((await app('electors', { electionId: seed.id })).body.rows) ===
    JSON.stringify(publishedRows),
  'Exclusão preserva lista publicada e participação',
);
ok(
  JSON.stringify((await current()).elections.find((e) => e.id === seed.id).results) ===
    JSON.stringify(publishedResult) &&
    (await current()).elections.find((e) => e.id === seed.id).votedCount === 1,
  'Exclusão preserva resultado',
);
ok(
  (await publicRequest({ action: 'authorize', electionId: seed.id, matricula: '1002' })).status ===
    409,
  'Exclusão não libera segundo voto',
);
ok(
  (await student({ name: 'Recadastrado', matricula: '1002', className: '6A' })).status === 200 &&
    (await current()).students.find((x) => x.matricula === '1002').matriculaLocked,
  'Recadastro mantém matrícula vinculada',
);
ok(
  (await publicRequest({ action: 'authorize', electionId: seed.id, matricula: '1002' })).status ===
    409,
  'Recadastro não libera segundo voto',
);
ok(
  (await student({ originalMatricula: '1002', name: 'Erro', matricula: '1009', className: '6A' }))
    .status === 409,
  'Recadastro mantém proteção da identidade',
);
ok(
  (await app('deleteStudent', { matricula: '1001', className: '6B' })).status === 200 &&
    JSON.stringify((await app('electors', { electionId: seed.id })).body.rows) ===
      JSON.stringify(publishedRows),
  'Excluir eleitor sem voto mantém lista publicada',
);
ok(
  (await publicRequest({ action: 'authorize', electionId: seed.id, matricula: '1001' })).status ===
    200,
  'Lista publicada continua independente do cadastro',
);
console.log(`Cadastro manual: ${passed} verificações aprovadas.`);

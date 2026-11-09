/** Relógio virtual: cinco minutos passam sem esperas e exercitam o observador real. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const js = ts.transpileModule(readFileSync('frontend/v2/tally-feed.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { followTally, tallyDelay, rankedCandidates, TALLY_INTERVAL } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
let passed = 0;
const ok = (condition, label) => {
  assert.ok(condition, label);
  passed++;
  console.log('OK', label);
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function fakeClock() {
  let now = Date.parse('2026-11-09T12:00:00Z'),
    serial = 0;
  const timers = new Map();
  return {
    now: () => now,
    schedule: (fn, ms) => {
      timers.set(++serial, { fn, at: now + ms });
      return serial;
    },
    cancel: (id) => timers.delete(id),
    count: () => timers.size,
    async advance(ms) {
      const target = now + ms;
      let safety = 0;
      for (;;) {
        const item = [...timers]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!item) break;
        if (++safety > 100) throw Error('Temporizadores em laço');
        now = item[1].at;
        timers.delete(item[0]);
        item[1].fn();
        await flush();
      }
      now = target;
      await flush();
    },
  };
}
function sample(clock, status = 'active', id = 'a') {
  return {
    election: {
      id,
      name: 'Eleição de teste',
      status,
      startsAt: new Date(clock.now() - 60000).toISOString(),
      endsAt: new Date(clock.now() + 3600000).toISOString(),
      hasVice: 1,
      requireMatricula: 1,
    },
    candidates: [
      { id: 'c1', name: 'A', code: '12', votes: 1 },
      { id: 'c2', name: 'B', code: '2', votes: 3 },
      { id: 'c3', name: 'C', code: '1', votes: 1 },
    ],
    totals: { votes: 5, eligible: 10, voted: 5 },
    generatedAt: new Date(clock.now()).toISOString(),
  };
}
const clock = fakeClock();
let calls = 0,
  state,
  phase = 'active',
  error;
const watcher = followTally(
  'a',
  async () => {
    calls++;
    if (error) throw error;
    return sample(clock, phase);
  },
  (s) => {
    state = s;
  },
  clock,
);
await flush();
ok(calls === 1 && state.snapshot && clock.count() === 1, 'Consulta inicial imediata');
await clock.advance(TALLY_INTERVAL - 1);
ok(calls === 1, 'Não consulta antes de cinco minutos');
await clock.advance(1);
ok(
  calls === 2 && state.nextUpdateAt === clock.now() + TALLY_INTERVAL,
  'Consulta exatamente em cinco minutos',
);
await watcher.refresh();
ok(calls === 3 && clock.count() === 1, 'Atualização manual mantém um só temporizador');
error = Error('Sem conexão');
await clock.advance(TALLY_INTERVAL);
ok(
  state.error === 'Sem conexão' && state.snapshot.totals.votes === 5 && clock.count() === 1,
  'Erro mantém a última parcial e agenda nova tentativa',
);
error = undefined;
await clock.advance(TALLY_INTERVAL);
ok(!state.error && calls === 5, 'Recupera de falha de rede');
phase = 'closed';
await clock.advance(TALLY_INTERVAL);
const closedCalls = calls;
ok(
  state.snapshot.election.status === 'closed' && state.nextUpdateAt === null && clock.count() === 0,
  'Encerramento congela o resultado e cancela o temporizador',
);
await clock.advance(TALLY_INTERVAL * 3);
await watcher.refresh();
ok(calls === closedCalls, 'Encerrada não consulta automaticamente nem pelo comando manual');
watcher.stop();
const finalClock = fakeClock();
let finalCalls = 0;
const alreadyFinal = followTally(
  'a',
  async () => {
    finalCalls++;
    return sample(finalClock, 'closed');
  },
  () => {},
  finalClock,
);
await flush();
await finalClock.advance(TALLY_INTERVAL * 2);
ok(finalCalls === 1 && finalClock.count() === 0, 'Ao abrir encerrada, busca apenas uma vez');
alreadyFinal.stop();
const deadline = sample(fakeClock());
deadline.election.endsAt = new Date(Date.parse(deadline.generatedAt) + 10000).toISOString();
ok(tallyDelay(deadline) === 10250, 'Busca o fechamento antes do próximo ciclo quando necessário');
deadline.election.status = 'scheduled';
deadline.election.startsAt = new Date(Date.parse(deadline.generatedAt) + 8000).toISOString();
ok(tallyDelay(deadline) === 8250, 'Consulta na abertura de eleição agendada');
const blockedClock = fakeClock();
let blockedState,
  blockedCalls = 0,
  block = false;
const blocked = followTally(
  'a',
  async () => {
    blockedCalls++;
    if (block) throw Object.assign(Error('Acesso revogado'), { status: 403 });
    return sample(blockedClock);
  },
  (s) => {
    blockedState = s;
  },
  blockedClock,
);
await flush();
block = true;
await blockedClock.advance(TALLY_INTERVAL);
ok(
  blockedState.blocked && !blockedState.snapshot && !blockedClock.count(),
  'Revogação remove os números da tela e para as consultas',
);
await blockedClock.advance(TALLY_INTERVAL);
ok(blockedCalls === 2, 'Não repete consulta sem permissão');
blocked.stop();
let resolveOld,
  oldSignal,
  oldEmits = 0;
const raceClock = fakeClock();
const old = followTally(
  'a',
  (_, signal) => {
    oldSignal = signal;
    return new Promise((resolve) => {
      resolveOld = resolve;
    });
  },
  () => {
    oldEmits++;
  },
  raceClock,
);
await old.refresh();
ok(oldEmits === 1, 'Impede consultas simultâneas');
old.stop();
resolveOld(sample(raceClock));
await flush();
ok(
  oldSignal.aborted && oldEmits === 1 && raceClock.count() === 0,
  'Troca ou saída aborta e ignora resposta atrasada',
);
const ordered = rankedCandidates(sample(fakeClock()));
ok(
  ordered.map((c) => c.id).join() === 'c2,c3,c1',
  'Ranking por votos e número para desempate visual estável',
);
const empty = sample(fakeClock());
empty.candidates.forEach((c) => (c.votes = 0));
empty.totals.votes = 0;
ok(rankedCandidates(empty).length === 3, 'Mantém candidatos com zero voto');
let wrong;
const wrongClock = fakeClock();
const wrongFeed = followTally(
  'b',
  async () => sample(wrongClock, 'active', 'a'),
  (s) => {
    wrong = s;
  },
  wrongClock,
);
await flush();
ok(!wrong.snapshot && !!wrong.error, 'Resposta de outra eleição não aparece');
wrongFeed.stop();
console.log(`Apuração e temporizadores: ${passed} verificações aprovadas.`);
const slowClock = fakeClock();
let slowState,
  slowCalls = 0;
const slowFeed = followTally(
  'a',
  (_, signal) => {
    slowCalls++;
    return new Promise((resolve, reject) =>
      signal.addEventListener(
        'abort',
        () => reject(Object.assign(Error('Abort'), { name: 'AbortError' })),
        { once: true },
      ),
    );
  },
  (value) => {
    slowState = value;
  },
  slowClock,
);
await slowClock.advance(30000);
ok(
  !slowState.loading &&
    slowState.error.includes('demorou') &&
    slowState.nextUpdateAt === slowClock.now() + TALLY_INTERVAL,
  'Consulta sem resposta expira e agenda recuperação',
);
slowFeed.stop();
await slowClock.advance(TALLY_INTERVAL);
ok(slowCalls === 1 && slowClock.count() === 0, 'Sair cancela a recuperação de consulta expirada');
console.log(`Apuração total: ${passed} verificações aprovadas.`);

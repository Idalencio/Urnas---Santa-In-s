/** Datas da apuração: período completo e calendário do colégio, independente do dispositivo. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const js = ts.transpileModule(readFileSync('frontend/v2/tally-filter.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { matchesVotingDay } = await import(
  'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
);
let passed = 0;
function check(start, end, day, expected, label) {
  assert.equal(matchesVotingDay({ startsAt: start, endsAt: end }, day), expected, label);
  passed++;
}
const start = '2026-11-13T11:00:00Z',
  end = '2026-11-13T20:00:00Z';
check(start, end, '', true, 'Sem filtro mantém todas as datas');
check(start, end, '2026-11-13', true, 'Encontra a eleição do dia');
check(start, end, '2026-11-12', false, 'Exclui o dia anterior');
check(start, end, '2026-11-14', false, 'Exclui o dia seguinte');
for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
  process.env.TZ = tz;
  check('2026-11-14T01:00:00Z', '2026-11-14T02:00:00Z', '2026-11-13', true, `Brasília em ${tz}`);
  check(
    '2026-11-14T01:00:00Z',
    '2026-11-14T02:00:00Z',
    '2026-11-14',
    false,
    `Sem deslocar para UTC em ${tz}`,
  );
}
for (const day of ['2026-11-12', '2026-11-13', '2026-11-14']) {
  check(
    '2026-11-12T11:00:00Z',
    '2026-11-14T20:00:00Z',
    day,
    true,
    `Votação em vários dias: ${day}`,
  );
}
check(
  start,
  '2026-11-14T03:00:00Z',
  '2026-11-13',
  true,
  'Inclui o dia antes do término à meia-noite',
);
check(
  start,
  '2026-11-14T03:00:00Z',
  '2026-11-14',
  false,
  'Término à meia-noite não inclui o dia seguinte',
);
check('2024-02-29T12:00:00Z', '2024-02-29T20:00:00Z', '2024-02-29', true, 'Aceita ano bissexto');
check(start, end, '2026-02-30', false, 'Rejeita dia inexistente');
check(start, end, '13/11/2026', false, 'Rejeita formato inválido');
check('', end, '2026-11-13', false, 'Não atribui data a período incompleto');
check(start, 'inválido', '2026-11-13', false, 'Não atribui data a período inválido');
check(end, start, '2026-11-13', false, 'Rejeita período invertido');
check(start, start, '2026-11-13', false, 'Rejeita período sem duração');
check('', '', '', true, 'Sem filtro preserva eleições antigas sem período');
console.log(`Filtro da apuração: ${passed} verificações aprovadas.`);

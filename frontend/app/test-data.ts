import type { Candidate, Election, Terminal } from './domain';

// Exemplos exclusivos da tela de teste. Nunca são enviados ao cadastro ou à API.
export const testCandidates: Candidate[] = [
  { id: 'test-lion', name: 'Leão', code: '01', image: '/characters/lion.svg', active: 1 },
  { id: 'test-owl', name: 'Coruja', code: '02', image: '/characters/owl.svg', active: 1 },
  { id: 'test-fox', name: 'Raposa', code: '03', image: '/characters/fox.svg', active: 1 },
];

export function testBallot(model: Terminal['model']): { terminal: Terminal; election: Election } {
  const terminal: Terminal = {
    id: 'test-' + model,
    name: model === 'images' ? 'Teste · Urna infantil' : 'Teste · Urna padrão',
    location: 'Área de testes',
    model,
  };
  const election: Election = {
    id: 'test-election-' + model,
    name: 'Escolha dos personagens · teste',
    terminalId: terminal.id,
    startsAt: '2000-01-01T00:00:00Z',
    endsAt: '2100-01-01T00:00:00Z',
    closed: 0,
    digits: 2,
    candidateSnapshot: testCandidates,
    results: [],
  };
  return { terminal, election };
}

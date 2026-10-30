import type { Candidate, Election } from './domain';
// Exemplos locais: testar a tela nunca envia um voto ao servidor.
export const exampleCandidates: Candidate[] = ['1', '12', '23', '34', '45', '56'].map(
  (code, i) => ({
    id: 'exemplo-' + code,
    electionId: 'exemplo',
    name:
      ['Leão', 'Coruja', 'Raposa', 'Leão do bosque', 'Coruja da escola', 'Raposa do jardim'][i] +
      ' · exemplo',
    code,
    image: '/characters/' + ['lion', 'owl', 'fox'][i % 3] + '.svg',
    viceName: ['Coruja', 'Raposa', 'Leão', 'Raposa', 'Leão', 'Coruja'][i] + ' · vice',
    viceImage: '/characters/' + ['owl', 'fox', 'lion', 'fox', 'lion', 'owl'][i] + '.svg',
    active: 1,
  }),
);
export function previewElection(source?: Election, candidates?: Candidate[]): Election {
  return {
    ...source,
    id: source?.id || 'exemplo',
    name: source?.name || 'Prefeito e vice · 6 chapas de exemplo',
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 86400000).toISOString(),
    closed: 0,
    published: 1,
    digits: source?.digits || 5,
    hasVice: source?.hasVice ?? 1,
    requireMatricula: 0,
    candidateSnapshot: (candidates || source?.candidateSnapshot || exampleCandidates).filter(
      (c) => c.active !== 0,
    ),
    results: [],
  };
}

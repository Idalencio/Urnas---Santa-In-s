export type Candidate = {
  id: string;
  name: string;
  code: string;
  image: string;
  active: number;
  viceName?: string;
  viceImage?: string;
  electionId?: string;
};
export type Terminal = {
  id: string;
  name: string;
  location: string;
  model: 'standard' | 'images';
  electionId?: string | null;
};
export type Election = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  closed: number;
  published: number;
  digits: number;
  hasVice: number;
  requireMatricula: number;
  candidateSnapshot: Candidate[];
  results: { candidateId: string; kind: string; total: number }[];
  electorCount?: number;
  votedCount?: number;
  terminalId?: string;
  terminalIds?: string[];
  electorClasses?: string[];
};
export function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-' +
    h.slice(12, 16) +
    '-' +
    h.slice(16, 20) +
    '-' +
    h.slice(20)
  );
}
export function status(e: Election, now = Date.now()) {
  return e.closed || now >= Date.parse(e.endsAt)
    ? 'closed'
    : !e.published
      ? 'draft'
      : now < Date.parse(e.startsAt)
        ? 'scheduled'
        : 'active';
}
export function voteChoice(e: Election, code: string, blank = false) {
  if (blank) throw Error('Escolha um candidato válido.');
  const c = e.candidateSnapshot.find((c) => c.code === code);
  if (!c) throw Error('Número inválido.');
  return { kind: 'valid', candidateId: c.id };
}

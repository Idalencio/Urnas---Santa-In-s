export type Candidate = {
  id: string;
  terminalId?: string | null;
  name: string;
  code: string;
  image: string;
  active: number;
};
export const candidateNumber = (code: string) =>
  /^0[0-9]$/.test(code) ? String(Number(code)) : code;
export type Terminal = { id: string; name: string; location: string; model: 'standard' | 'images' };
export const defaultTerminals: Terminal[] = [
  {
    id: 'urna-padrao',
    name: 'Urna padrão',
    location: 'Alunos maiores · teclado e toque',
    model: 'standard',
  },
  {
    id: 'urna-infantil',
    name: 'Urna infantil animada',
    location: 'Alunos pequenos · escolha por imagens',
    model: 'images',
  },
];
export type Election = {
  id: string;
  name: string;
  terminalId: string;
  startsAt: string;
  endsAt: string;
  closed: number;
  archived?: number;
  digits: number;
  candidateSnapshot: Candidate[];
  results: { candidateId: string | null; kind: string; total: number }[];
};
export type Admin = {
  id: string;
  name: string;
  email: string;
  username?: string;
  active: number;
  owner: number;
  role: string;
  passwordSet?: number;
  delivery?: string;
};
export type Data = {
  candidates: Candidate[];
  terminals: Terminal[];
  elections: Election[];
  administrators: Admin[];
  me: Admin | null;
  mail?: {
    configured: boolean;
    sender: string;
    host?: string;
    port?: number;
    username?: string;
    security?: string;
  };
  ownerChange?: { email: string; expiresAt: string } | null;
};
export function status(e: Election, now = Date.now()) {
  return e.closed || now >= Date.parse(e.endsAt)
    ? 'closed'
    : now < Date.parse(e.startsAt)
      ? 'scheduled'
      : 'active';
}
export function totals(e?: Election) {
  const valid = (e?.results ?? [])
    .filter((v) => v.kind === 'valid' && e?.candidateSnapshot.some((c) => c.id === v.candidateId))
    .reduce((s, v) => s + v.total, 0);
  return { total: valid, valid };
}
export function voteChoice(e: Election, code: string, blank = false) {
  if (blank) throw Error('Número inválido.');
  if (code.length !== e.digits) throw Error('Digite o último dígito.');
  const c = e.candidateSnapshot.find((c) => c.code === code);
  if (!c) throw Error('Número inválido.');
  return { kind: 'valid', candidateId: c.id };
}
export function validateElection(
  e: Partial<Election>,
  terminals: Terminal[],
  candidates: Candidate[],
) {
  if (!e.name?.trim()) throw Error('Informe o nome da eleição.');
  if (!terminals.some((t) => t.id === e.terminalId)) throw Error('Selecione uma urna.');
  if (
    !e.startsAt ||
    !e.endsAt ||
    !Number.isFinite(Date.parse(e.startsAt)) ||
    !Number.isFinite(Date.parse(e.endsAt)) ||
    Date.parse(e.endsAt) <= Date.parse(e.startsAt)
  )
    throw Error('O encerramento precisa ser depois do início.');
  if (!e.candidateSnapshot?.length) throw Error('Selecione pelo menos um candidato.');
  if (
    e.candidateSnapshot.some(
      (c) => !candidates.some((x) => x.id === c.id && x.active && x.terminalId === e.terminalId),
    )
  )
    throw Error('Selecione apenas candidatos cadastrados nesta urna.');
  const digits = 2;
  if (e.candidateSnapshot.some((c) => !/^0[0-9]$/.test(c.code)))
    throw Error('Os números dos candidatos devem ir de 00 a 09.');
  if (
    terminals.find((t) => t.id === e.terminalId)?.model === 'images' &&
    e.candidateSnapshot.some((c) => !c.image)
  )
    throw Error('Na urna com imagens, todos os candidatos precisam de uma imagem.');
  return digits;
}

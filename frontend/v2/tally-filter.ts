import type { Election } from './domain';

const schoolDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dayOf(timestamp: number) {
  const parts = schoolDate.formatToParts(timestamp);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Inclui cada dia do período de votação no horário do colégio, com término exclusivo. */
export function matchesVotingDay(election: Pick<Election, 'startsAt' | 'endsAt'>, day: string) {
  if (!day) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== day) return false;
  const start = Date.parse(election.startsAt);
  const end = Date.parse(election.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return dayOf(start) <= day && day <= dayOf(end - 1);
}

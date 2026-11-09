import type { Candidate } from './domain';

export const TALLY_INTERVAL = 5 * 60 * 1000;
export type TallySnapshot = {
  election: {
    id: string;
    name: string;
    status: 'active' | 'scheduled' | 'closed';
    startsAt: string;
    endsAt: string;
    hasVice: number;
    requireMatricula: number;
  };
  candidates: (Pick<Candidate, 'id' | 'name' | 'code' | 'image' | 'viceName' | 'viceImage'> & {
    votes: number;
  })[];
  totals: { votes: number; eligible: number; voted: number };
  generatedAt: string;
};
export type TallyFeedState = {
  snapshot: TallySnapshot | null;
  loading: boolean;
  error: string;
  nextUpdateAt: number | null;
  blocked: boolean;
};

/** Usa o relógio do servidor para buscar também na abertura e no encerramento. */
export function tallyDelay(snapshot: TallySnapshot): number | null {
  if (snapshot.election.status === 'closed') return null;
  const transition = Date.parse(
    snapshot.election.status === 'scheduled'
      ? snapshot.election.startsAt
      : snapshot.election.endsAt,
  );
  const remaining = transition - Date.parse(snapshot.generatedAt) + 250;
  return Number.isFinite(remaining)
    ? Math.min(TALLY_INTERVAL, Math.max(1000, remaining))
    : TALLY_INTERVAL;
}

/** Uma consulta por vez. Ao sair/trocar de eleição, descarta respostas atrasadas. */
export function followTally(
  electionId: string,
  read: (id: string, signal: AbortSignal) => Promise<TallySnapshot>,
  notify: (state: TallyFeedState) => void,
  clock = {
    now: () => Date.now(),
    schedule: (fn: () => void, ms: number) => setTimeout(fn, ms),
    cancel: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  },
) {
  let state: TallyFeedState = {
    snapshot: null,
    loading: false,
    error: '',
    nextUpdateAt: null,
    blocked: false,
  };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  function emit() {
    notify({ ...state });
  }
  function cancelTimer() {
    if (timer !== undefined) clock.cancel(timer);
    timer = undefined;
  }
  function schedule(delay: number | null) {
    state.nextUpdateAt = delay === null ? null : clock.now() + delay;
    if (delay !== null) timer = clock.schedule(() => void refresh(), delay);
  }
  async function refresh() {
    if (stopped || state.loading || state.blocked || state.snapshot?.election.status === 'closed')
      return;
    cancelTimer();
    state = { ...state, loading: true, nextUpdateAt: null };
    controller = new AbortController();
    const requestTimeout = clock.schedule(() => controller?.abort(), 30000);
    emit();
    try {
      const snapshot = await read(electionId, controller.signal);
      if (stopped) return;
      if (snapshot.election.id !== electionId)
        throw Error('A eleição retornada é diferente da selecionada.');
      state = { snapshot, loading: false, error: '', nextUpdateAt: null, blocked: false };
      schedule(tallyDelay(snapshot));
    } catch (error: any) {
      if (stopped) return;
      const blocked = [401, 403, 404, 409].includes(error.status);
      state = {
        ...state,
        snapshot: blocked ? null : state.snapshot,
        loading: false,
        blocked,
        error:
          error.name === 'AbortError'
            ? 'O servidor demorou para responder. Tente novamente.'
            : error.message || 'Não foi possível atualizar a apuração.',
      };
      schedule(blocked ? null : TALLY_INTERVAL);
    } finally {
      clock.cancel(requestTimeout);
    }
    emit();
  }
  void refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      cancelTimer();
      controller?.abort();
    },
  };
}

export function rankedCandidates(snapshot: TallySnapshot) {
  return [...snapshot.candidates].sort(
    (a, b) => b.votes - a.votes || Number(a.code) - Number(b.code) || a.id.localeCompare(b.id),
  );
}

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { BarChart3, CheckCircle2, Clock3, Download, RefreshCw, Users, Vote } from 'lucide-react';
import { csvDownload, Empty, formatted } from '../app/components';
import { status, type Election } from './domain';
import {
  followTally,
  rankedCandidates,
  type TallyFeedState,
  type TallySnapshot,
} from './tally-feed';

const integer = (n: number) => n.toLocaleString('pt-BR');
const percent = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const labels = {
  active: 'Aberta',
  scheduled: 'Agendada',
  closed: 'Encerrada',
  draft: 'Em preparação',
};
async function readTally(id: string, signal: AbortSignal): Promise<TallySnapshot> {
  const response = await fetch('/api/v2/tally?election=' + encodeURIComponent(id), {
    cache: 'no-store',
    signal,
    headers: { 'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '' },
  });
  let body: any;
  try {
    body = await response.json();
  } catch {
    throw Object.assign(Error('O servidor não respondeu corretamente. Tente novamente.'), {
      status: response.status,
    });
  }
  if (!response.ok)
    throw Object.assign(Error(body.error || 'Não foi possível consultar a apuração.'), {
      status: response.status,
    });
  return body;
}
function Countdown({ until }: { until: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <span className="tally-countdown">
      {Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0')}
      :{(seconds % 60).toString().padStart(2, '0')}
    </span>
  );
}
function CandidatePhoto({
  src,
  name,
  small = false,
}: {
  src?: string;
  name: string;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={'tally-photo' + (small ? ' tally-vice-photo' : '')}>
      {src && !failed ? (
        <img src={src} alt={small ? 'Vice: ' + name : name} onError={() => setFailed(true)} />
      ) : (
        <span aria-label={name}>{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

export function TallyBoard({ snapshot }: { snapshot: TallySnapshot }) {
  const { election, totals } = snapshot;
  const candidates = rankedCandidates(snapshot);
  const closed = election.status === 'closed';
  const leader = candidates[0];
  const tied =
    !!leader && leader.votes > 0 && candidates.filter((c) => c.votes === leader.votes).length > 1;
  const turnout = totals.eligible ? (totals.voted / totals.eligible) * 100 : 0;
  const counted = !!election.requireMatricula && totals.eligible > 0;
  return (
    <>
      <div className="tally-metrics">
        <article>
          <span>
            <Vote size={18} /> Votos registrados
          </span>
          <strong>{integer(totals.votes)}</strong>
          <small>{closed ? 'Total final desta eleição' : 'Total na última atualização'}</small>
        </article>
        <article>
          <span>
            <Users size={18} /> Eleitores habilitados
          </span>
          <strong>{election.requireMatricula ? integer(totals.eligible) : '—'}</strong>
          <small>
            {election.requireMatricula ? 'Lista desta eleição' : 'Votação sem matrícula'}
          </small>
        </article>
        <article>
          <span>
            <BarChart3 size={18} /> Participação
          </span>
          <strong>{counted ? percent(turnout) : '—'}</strong>
          <small>
            {counted
              ? integer(totals.voted) + ' de ' + integer(totals.eligible) + ' eleitores votaram'
              : 'Sem controle de participação'}
          </small>
        </article>
      </div>
      <div className="tally-grid">
        <section className="tally-ranking" aria-labelledby="tally-ranking-title">
          <div className="tally-section-heading">
            <div>
              <span className="tally-eyebrow">
                {closed ? 'RESULTADO FINAL' : 'RESULTADO PARCIAL'}
              </span>
              <h2 id="tally-ranking-title">Votos por candidato</h2>
            </div>
            <span>
              {candidates.length} {candidates.length === 1 ? 'candidato' : 'candidatos'}
            </span>
          </div>
          {!totals.votes && (
            <p className="tally-zero">
              {closed
                ? 'Esta eleição encerrou sem votos registrados.'
                : election.status === 'scheduled'
                  ? 'Aguardando o início da votação.'
                  : 'Aguardando os primeiros votos.'}
            </p>
          )}
          <ol className="tally-candidates">
            {candidates.map((c, index) => {
              const share = totals.votes ? (c.votes / totals.votes) * 100 : 0;
              const leading = c.votes > 0 && c.votes === leader?.votes;
              const rank = candidates.findIndex((item) => item.votes === c.votes) + 1;
              return (
                <li
                  key={c.id}
                  className={leading ? 'tally-candidate is-leading' : 'tally-candidate'}
                >
                  <div className="tally-candidate-top">
                    <span className="tally-position" aria-label={rank + 'ª posição'}>
                      {rank.toString().padStart(2, '0')}
                    </span>
                    <div className="tally-photos">
                      <CandidatePhoto key={c.image} src={c.image} name={c.name} />
                      {!!election.hasVice && c.viceName && (
                        <CandidatePhoto
                          key={c.viceImage}
                          src={c.viceImage}
                          name={c.viceName}
                          small
                        />
                      )}
                    </div>
                    <div className="tally-candidate-name">
                      <span className="tally-code">Nº {c.code}</span>
                      <h3>{c.name}</h3>
                      {!!election.hasVice && c.viceName && <p>Vice: {c.viceName}</p>}
                      {leading && (
                        <span className="tally-leading-label">
                          {tied ? 'Empate na liderança' : closed ? 'Mais votado' : 'Na liderança'}
                        </span>
                      )}
                    </div>
                    <div className="tally-vote-number">
                      <strong>{percent(share)}</strong>
                      <span>
                        {integer(c.votes)} {c.votes === 1 ? 'voto' : 'votos'}
                      </span>
                    </div>
                  </div>
                  <progress
                    className={'tally-bar tally-bar-' + (index % 4)}
                    value={c.votes}
                    max={totals.votes || 1}
                    aria-label={'Percentual dos votos de ' + c.name}
                  >
                    {percent(share)}
                  </progress>
                </li>
              );
            })}
          </ol>
          <p className="tally-footnote">Percentuais sobre os votos registrados nesta eleição.</p>
        </section>
        <aside className="tally-summary">
          <section className="tally-participation">
            <span className="tally-eyebrow">
              {counted ? 'PARTICIPAÇÃO DOS ELEITORES' : 'SOBRE ESTA APURAÇÃO'}
            </span>
            {counted ? (
              <>
                <div
                  className="tally-ring"
                  style={
                    {
                      '--tally-turnout': Math.min(100, Math.max(0, turnout)) + '%',
                    } as CSSProperties
                  }
                >
                  <div>
                    <strong>{percent(turnout)}</strong>
                    <span>já votaram</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Votaram</dt>
                    <dd>{integer(totals.voted)}</dd>
                  </div>
                  <div>
                    <dt>{closed ? 'Não votaram' : 'Ainda não votaram'}</dt>
                    <dd>{integer(Math.max(0, totals.eligible - totals.voted))}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>
                {election.requireMatricula
                  ? 'Não há eleitores habilitados nesta eleição.'
                  : 'Esta eleição não exige matrícula. Acompanhe o total de votos e os percentuais de cada candidato.'}
              </p>
            )}
          </section>
          <section className="tally-information">
            <Clock3 size={21} />
            <h3>
              {closed
                ? 'Votação encerrada'
                : election.status === 'scheduled'
                  ? 'Votação agendada'
                  : 'Votação em andamento'}
            </h3>
            <p>
              {closed
                ? 'Resultado final. A atualização automática está desativada.'
                : 'O painel consulta os votos a cada 5 minutos e busca o resultado final no encerramento.'}
            </p>
            <dl>
              <div>
                <dt>Início</dt>
                <dd>{formatted(election.startsAt)}</dd>
              </div>
              <div>
                <dt>Encerramento previsto</dt>
                <dd>{formatted(election.endsAt)}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function ElectionTally({ id, report }: { id: string; report: (snapshot: TallySnapshot) => void }) {
  const [feed, setFeed] = useState<TallyFeedState>({
    snapshot: null,
    loading: true,
    error: '',
    nextUpdateAt: null,
    blocked: false,
  });
  const watcher = useRef<ReturnType<typeof followTally> | null>(null);
  useEffect(() => {
    const current = followTally(id, readTally, (next) => {
      setFeed(next);
      if (next.snapshot) report(next.snapshot);
    });
    watcher.current = current;
    return () => {
      current.stop();
      watcher.current = null;
    };
  }, [id, report]);
  const { snapshot, loading, error, nextUpdateAt, blocked } = feed;
  const closed = snapshot?.election.status === 'closed';
  return (
    <div className="tally-election" aria-busy={loading}>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          {snapshot && ' Os números abaixo são da última consulta bem-sucedida.'}
          {!blocked && ' A consulta será tentada novamente em 5 minutos.'}
        </div>
      )}
      {!snapshot ? (
        <div className="tally-loading" role="status">
          <BarChart3 size={28} />
          <p>
            {loading ? 'Consultando os votos desta eleição…' : 'A apuração não pôde ser carregada.'}
          </p>
          {!loading && !blocked && (
            <button className="button secondary" onClick={() => void watcher.current?.refresh()}>
              Tentar novamente
            </button>
          )}
        </div>
      ) : (
        <>
          <header className="tally-hero">
            <div>
              <span className={'tally-status ' + (closed ? 'is-closed' : '')}>
                {closed ? <CheckCircle2 size={16} /> : <span className="tally-live-dot" />}
                {closed
                  ? 'Resultado final'
                  : snapshot.election.status === 'scheduled'
                    ? 'Eleição agendada'
                    : 'Apuração em andamento'}
              </span>
              <h2>{snapshot.election.name}</h2>
              <p>
                {closed
                  ? 'Votação encerrada · resultado consolidado'
                  : 'Acompanhe os votos e a participação da comunidade escolar.'}
              </p>
            </div>
            <div className="tally-refresh">
              <span>Última atualização</span>
              <strong>{formatted(snapshot.generatedAt)}</strong>
              {loading ? (
                <small role="status">Atualizando…</small>
              ) : nextUpdateAt !== null ? (
                <small>
                  Próxima consulta em <Countdown until={nextUpdateAt} />
                </small>
              ) : (
                <small>Atualização automática desativada</small>
              )}
            </div>
          </header>
          <div className="tally-toolbar">
            <p>
              <span className={'tally-toolbar-dot' + (error ? ' is-stale' : '')} />
              {error
                ? 'Atualização pendente'
                : closed
                  ? 'Apuração concluída'
                  : 'Atualização automática a cada 5 minutos'}
            </p>
            <div>
              {!closed && (
                <button
                  className="button secondary small"
                  disabled={loading || blocked}
                  onClick={() => void watcher.current?.refresh()}
                >
                  <RefreshCw size={15} />
                  Atualizar agora
                </button>
              )}
              <button
                className="button secondary small"
                onClick={() =>
                  csvDownload('apuracao-eleicao.csv', [
                    [
                      'Eleição',
                      'Situação',
                      'Atualizado em',
                      'Número',
                      'Candidato',
                      'Vice',
                      'Votos',
                      'Percentual',
                    ],
                    ...rankedCandidates(snapshot).map((c) => [
                      snapshot.election.name,
                      closed ? 'Final' : 'Parcial',
                      formatted(snapshot.generatedAt),
                      c.code,
                      c.name,
                      snapshot.election.hasVice ? c.viceName || '' : '',
                      c.votes,
                      percent(snapshot.totals.votes ? (c.votes / snapshot.totals.votes) * 100 : 0),
                    ]),
                  ])
                }
              >
                <Download size={15} />
                Baixar resultado
              </button>
            </div>
          </div>
          <TallyBoard snapshot={snapshot} />
        </>
      )}
    </div>
  );
}

export default function TallyPanel({
  elections,
  selectedId,
  select,
}: {
  elections: Election[];
  selectedId: string;
  select: (id: string) => void;
}) {
  const [reported, setReported] = useState<Record<string, TallySnapshot['election']['status']>>({});
  const report = useCallback((snapshot: TallySnapshot) => {
    const { id, status } = snapshot.election;
    setReported((old) => (old[id] === status ? old : { ...old, [id]: status }));
  }, []);
  const choices = elections
    .filter((e) => !!e.published)
    .sort((a, b) => {
      const order = { active: 0, scheduled: 1, closed: 2, draft: 3 };
      return order[status(a)] - order[status(b)] || a.name.localeCompare(b.name, 'pt-BR');
    });
  const id = choices.some((e) => e.id === selectedId) ? selectedId : choices[0]?.id || '';
  useEffect(() => {
    if (id && selectedId !== id) select(id);
  }, [id, selectedId, select]);
  return (
    <section className="tally-panel">
      <div className="tally-page-heading">
        <div>
          <span className="tally-eyebrow">ELEIÇÕES SANTA INÊS</span>
          <h1>Apuração</h1>
          <p>Os resultados da escola, em um só lugar.</p>
        </div>
        {!!choices.length && (
          <label className="tally-selector">
            <span>Selecione a eleição</span>
            <select value={id} onChange={(ev) => select(ev.target.value)}>
              {choices.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {labels[reported[e.id] || status(e)]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {id ? (
        <ElectionTally key={id} id={id} report={report} />
      ) : (
        <Empty
          title="Nenhuma eleição publicada disponível"
          text="As eleições abertas e encerradas liberadas para sua conta aparecerão aqui."
        />
      )}
    </section>
  );
}

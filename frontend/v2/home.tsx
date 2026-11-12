import {
  ArrowRight,
  Plus,
  Vote,
  Clock3,
  Pencil,
  Users,
  BarChart3,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { status, type Candidate, type Election } from './domain';
import { allowed, type TeamAccount } from './access';

type HomeElection = Election & { candidates?: Candidate[] };
const phases = {
  draft: 'Em preparação',
  scheduled: 'Agendada',
  active: 'Votação aberta',
  closed: 'Encerrada',
};
const shortDate = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
function nextStep(e: HomeElection) {
  const candidates = (e.candidates || e.candidateSnapshot).filter((c) => c.active);
  if (!candidates.length) return 'Cadastre os candidatos para continuar.';
  if (e.hasVice && candidates.some((c) => !c.viceName)) return 'Complete os dados dos vices.';
  if (e.requireMatricula && !e.electorCount) return 'Escolha as turmas e os alunos que vão votar.';
  return 'Confira a urna e defina o horário da votação.';
}

/** A home resume somente as eleições e as turmas já autorizadas pela API. */
export default function Home({
  me,
  elections,
  classCount,
  create,
  choose,
  go,
  browse,
  canCreate,
}: {
  me: TeamAccount;
  elections: HomeElection[];
  classCount: number;
  create: () => void;
  choose: (e: Election) => void;
  go: (view: string) => void;
  browse: (filter: string) => void;
  canCreate: boolean;
}) {
  const now = Date.now();
  const records = elections.map((election) => ({ election, phase: status(election, now) }));
  const order = { active: 0, scheduled: 1, draft: 2, closed: 3 };
  const current = records
    .filter((row) => row.phase !== 'closed')
    .sort((a, b) => {
      const phaseOrder = order[a.phase] - order[b.phase];
      if (phaseOrder) return phaseOrder;
      if (a.phase === 'active')
        return Date.parse(a.election.endsAt) - Date.parse(b.election.endsAt);
      if (a.phase === 'scheduled')
        return Date.parse(a.election.startsAt) - Date.parse(b.election.startsAt);
      return a.election.name.localeCompare(b.election.name, 'pt-BR', { numeric: true });
    });
  const spotlight = current[0];
  const canResults = allowed(me, 'viewResults');
  const shortcuts = [
    { id: 'terminals', label: 'Urnas de votação', detail: 'Abrir ou testar a urna', icon: Monitor },
    ...(canResults
      ? [{ id: 'tally', label: 'Apuração', detail: 'Resultados e link público', icon: BarChart3 }]
      : []),
    ...(me.role === 'admin'
      ? [
          {
            id: 'students',
            label: 'Turmas e alunos',
            detail: 'Cadastro e importação',
            icon: Users,
          },
          {
            id: 'team',
            label: 'Acessos da equipe',
            detail: 'Contas e turmas permitidas',
            icon: ShieldCheck,
          },
        ]
      : []),
  ];
  const detail = (row: (typeof current)[number]) =>
    row.phase === 'active'
      ? 'Encerra em ' + shortDate(row.election.endsAt)
      : row.phase === 'scheduled'
        ? 'Começa em ' + shortDate(row.election.startsAt)
        : nextStep(row.election);

  return (
    <div className="school-home">
      <section className="home-welcome" aria-labelledby="home-title">
        <div className="home-welcome-copy">
          <span className="home-kicker">COLÉGIO SANTA INÊS</span>
          <h1 id="home-title">Bem-vindo ao painel de eleições.</h1>
          <p className="home-subtitle">
            <span aria-hidden="true" />
            Desenvolvido pela T.I. do Colégio Santa Inês
          </p>
          <p className="home-description">
            Cadastre candidatos, escolha os eleitores e acompanhe a votação.
          </p>
          <div className="home-welcome-actions">
            {canCreate && (
              <button className="button home-create" onClick={create}>
                <Plus size={17} />
                Nova eleição
              </button>
            )}
            <button className="home-link" onClick={() => browse('current')}>
              Ver todas as eleições
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        {spotlight ? (
          <aside className="home-spotlight" aria-label="Eleição em destaque">
            <div className="home-spotlight-heading">
              <img src="/csi-logo.png" alt="" />
              <span>
                {spotlight.phase === 'active'
                  ? 'ACOMPANHE A VOTAÇÃO'
                  : spotlight.phase === 'scheduled'
                    ? 'PRÓXIMA VOTAÇÃO'
                    : 'CONTINUE A PREPARAÇÃO'}
              </span>
            </div>
            <span className={'home-phase ' + spotlight.phase}>
              <span aria-hidden="true" />
              {phases[spotlight.phase]}
            </span>
            <h2 title={spotlight.election.name}>{spotlight.election.name}</h2>
            <p>{detail(spotlight)}</p>
            {!!spotlight.election.requireMatricula &&
              (spotlight.election.electorCount || 0) > 0 &&
              spotlight.phase === 'active' && (
                <div className="home-spotlight-turnout">
                  <progress
                    aria-label="Participação na eleição em destaque"
                    value={spotlight.election.votedCount || 0}
                    max={spotlight.election.electorCount}
                  />
                  <span>
                    {spotlight.election.votedCount || 0} de {spotlight.election.electorCount}{' '}
                    eleitores já votaram
                  </span>
                </div>
              )}
            <button className="home-spotlight-action" onClick={() => choose(spotlight.election)}>
              {spotlight.phase === 'draft' ? 'Continuar eleição' : 'Gerenciar eleição'}
              <ArrowRight size={16} />
            </button>
          </aside>
        ) : (
          <div className="home-identity">
            <img src="/csi-logo.png" alt="" />
            <strong>Eleições escolares</strong>
            <span>Colégio Santa Inês</span>
          </div>
        )}
      </section>

      <section className="home-counts" aria-label="Resumo das eleições">
        {[
          { key: 'draft', label: 'Em preparação', hint: 'Candidatos e eleitores', icon: Pencil },
          { key: 'scheduled', label: 'Agendadas', hint: 'Prontas para começar', icon: Clock3 },
          { key: 'active', label: 'Votações abertas', hint: 'Recebendo votos', icon: Vote },
        ].map(({ key, label, hint, icon: Icon }) => {
          const count = records.filter((row) => row.phase === key).length;
          return (
            <button
              key={key}
              className={'home-count ' + key}
              onClick={() => browse(key)}
              aria-label={'Ver eleições ' + label.toLocaleLowerCase('pt-BR') + ': ' + count}
            >
              <span className="home-count-icon">
                <Icon size={19} />
              </span>
              <span className="home-count-copy">
                <span>{label}</span>
                <strong>{count}</strong>
                <small>{hint}</small>
              </span>
              <ArrowRight className="home-count-arrow" size={16} />
            </button>
          );
        })}
      </section>

      <div className="home-columns">
        <section className="home-work" aria-labelledby="home-elections-title">
          <div className="home-section-heading">
            <div>
              <span className="home-kicker">EM ANDAMENTO</span>
              <h2 id="home-elections-title">
                {me.role === 'admin' ? 'Eleições da escola' : 'Suas eleições'}
              </h2>
            </div>
            <button className="text-button" onClick={() => browse('current')}>
              Ver todas
              <ArrowRight size={14} />
            </button>
          </div>
          {current.length ? (
            <div className="home-election-list">
              {current.slice(0, 4).map((row) => {
                const Icon =
                  row.phase === 'active' ? Vote : row.phase === 'scheduled' ? Clock3 : Pencil;
                return (
                  <button
                    key={row.election.id}
                    className="home-election"
                    onClick={() => choose(row.election)}
                  >
                    <span className={'home-election-symbol ' + row.phase}>
                      <Icon size={19} />
                    </span>
                    <span className="home-election-copy">
                      <span className={'home-election-phase ' + row.phase}>
                        {phases[row.phase]}
                      </span>
                      <strong>{row.election.name}</strong>
                      <small>{detail(row)}</small>
                    </span>
                    <ArrowRight className="home-election-arrow" size={17} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="home-empty">
              <span className="home-empty-icon">
                <Vote size={27} />
              </span>
              <h3>Nenhuma eleição em andamento</h3>
              <p>
                {canCreate
                  ? 'Comece uma nova eleição e prepare a votação com sua turma.'
                  : 'As eleições da sua conta aparecerão aqui.'}
              </p>
              {canCreate && (
                <button className="button secondary" onClick={create}>
                  <Plus size={16} />
                  Criar primeira eleição
                </button>
              )}
            </div>
          )}
          <div className="home-work-note">
            <span aria-hidden="true" />
            <p>
              As eleições encerradas ficam disponíveis em{' '}
              <button onClick={() => browse('closed')}>Eleições encerradas</button>
              {canResults && (
                <>
                  {' '}
                  e na <button onClick={() => go('tally')}>Apuração</button>
                </>
              )}
              .
            </p>
          </div>
        </section>

        <aside className="home-side">
          <section className="home-shortcuts" aria-labelledby="home-shortcuts-title">
            <h2 id="home-shortcuts-title">Acesso rápido</h2>
            <div className="home-shortcut-grid">
              {shortcuts.map(({ id, label, detail, icon: Icon }) => (
                <button key={id} onClick={() => go(id)}>
                  <Icon size={20} />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="home-steps" aria-labelledby="home-guide-title">
            <div className="home-guide-heading">
              <span className="home-kicker">PASSO A PASSO</span>
              <h2 id="home-guide-title">Antes de começar</h2>
            </div>
            <ol>
              {[
                ['Cadastre os candidatos', 'Nome, número e foto. Inclua o vice, se houver.'],
                ['Escolha os eleitores', 'Selecione turmas e desmarque quem não vai participar.'],
                [
                  'Confira e abra a votação',
                  'Escolha a urna, revise os dados e defina os horários.',
                ],
                [
                  'Compartilhe a apuração',
                  'O link público acompanha os resultados a cada 5 minutos.',
                ],
              ].map(([title, text], i) => (
                <li key={title}>
                  <span className="home-step-number" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="home-class-note">
              <Users size={16} />
              <span>
                {classCount
                  ? `${classCount} ${classCount === 1 ? 'turma disponível' : 'turmas disponíveis'} para suas eleições.`
                  : me.role === 'admin'
                    ? 'Cadastre ou importe os alunos em Turmas.'
                    : 'Peça ao administrador para liberar suas turmas.'}
              </span>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

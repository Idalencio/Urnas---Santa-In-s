import { ArrowRight, Plus, Vote, Clock3, Pencil, Users, BarChart3 } from 'lucide-react';
import { status, type Election } from './domain';
import type { TeamAccount } from './access';

export default function Home({
  me,
  elections,
  classCount,
  create,
  choose,
  go,
  canCreate,
}: {
  me: TeamAccount;
  elections: Election[];
  classCount: number;
  create: () => void;
  choose: (e: Election) => void;
  go: (view: string) => void;
  canCreate: boolean;
}) {
  const current = elections.filter((e) => status(e) !== 'closed');
  const tasks = [
    {
      title: 'Confira as turmas disponíveis',
      text:
        me.role === 'admin'
          ? 'Importe a lista da escola ou cadastre alunos em Turmas. Depois, libere as turmas para a equipe.'
          : classCount
            ? 'Suas turmas já estão disponíveis para escolher os eleitores de cada eleição.'
            : 'Peça ao administrador para liberar as turmas da sua eleição.',
      action: me.role === 'admin' ? () => go('students') : undefined,
      label: 'Gerenciar turmas',
      icon: Users,
    },
    {
      title: 'Prepare a eleição',
      text: 'Defina o nome, cadastre os candidatos e escolha se haverá vice.',
      action: canCreate ? create : undefined,
      label: 'Nova eleição',
      icon: Pencil,
    },
    {
      title: 'Escolha quem vai votar',
      text: 'Selecione turmas inteiras ou somente os alunos que participarão.',
      icon: Vote,
    },
    {
      title: 'Agende e abra a votação',
      text: 'Escolha a urna e o horário. A configuração pode ser alterada até a abertura.',
      icon: Clock3,
    },
    {
      title: 'Compartilhe a apuração',
      text: 'Envie o link público para acompanhar os resultados, sem precisar entrar no painel.',
      icon: BarChart3,
    },
  ];
  return (
    <div className="school-home">
      <section className="home-welcome">
        <div>
          <span className="home-kicker">COLÉGIO SANTA INÊS</span>
          <h1>
            Bem-vindo ao
            <br />
            painel de eleições.
          </h1>
          <p>Um espaço para organizar a participação dos alunos, da preparação ao resultado.</p>
          <div className="home-welcome-actions">
            {canCreate && (
              <button className="button home-create" onClick={create}>
                <Plus size={18} />
                Criar eleição
              </button>
            )}
            <button className="home-link" onClick={() => go('elections')}>
              Ver eleições
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="home-school-seal">
          <img src="/csi-logo.png" alt="Colégio Santa Inês" />
          <span>
            Participar.
            <br />
            Escolher. Construir.
          </span>
        </div>
      </section>
      <div className="home-counts">
        {[
          { label: 'Em preparação', key: 'draft', icon: Pencil },
          { label: 'Agendadas', key: 'scheduled', icon: Clock3 },
          { label: 'Votações abertas', key: 'active', icon: Vote },
        ].map(({ label, key, icon: Icon }) => (
          <button key={key} onClick={() => go('elections')}>
            <Icon size={20} />
            <strong>{elections.filter((e) => status(e) === key).length}</strong>
            <span>{label}</span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
      <div className="home-columns">
        <section className="home-steps">
          <div className="home-section-title">
            <span>POR ONDE COMEÇAR</span>
            <h2>Da primeira ideia ao voto.</h2>
          </div>
          <ol>
            {tasks.map((task, i) => (
              <li key={task.title}>
                <span className="home-step-number">{i + 1}</span>
                <div>
                  <h3>{task.title}</h3>
                  <p>{task.text}</p>
                  {task.action && (
                    <button className="text-button" onClick={task.action}>
                      {task.label}
                      <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <aside className="home-work">
          <div className="home-section-title">
            <span>SEU PAINEL</span>
            <h2>Em andamento</h2>
          </div>
          {current.length ? (
            current.slice(0, 4).map((e) => (
              <button key={e.id} className="home-election" onClick={() => choose(e)}>
                <div>
                  <span>
                    {
                      {
                        active: 'Votação aberta',
                        draft: 'Em preparação',
                        scheduled: 'Agendada',
                        closed: 'Encerrada',
                      }[status(e)]
                    }
                  </span>
                  <strong>{e.name}</strong>
                </div>
                <ArrowRight size={18} />
              </button>
            ))
          ) : (
            <p className="home-no-election">
              {canCreate
                ? 'Crie a primeira eleição para começar.'
                : 'As eleições criadas por sua conta aparecerão aqui.'}
            </p>
          )}
          <div className="home-guidance">
            <img src="/csi-logo.png" alt="" />
            <p>
              Uma eleição bem preparada começa com a conferência dos candidatos e dos eleitores.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

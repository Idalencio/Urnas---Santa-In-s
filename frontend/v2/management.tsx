import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Keyboard,
  Images,
  Play,
  Plus,
  Trash2,
  Search,
  Vote,
  Users,
  Monitor,
  Clock3,
  CheckCircle2,
  X,
  Pencil as PencilIcon,
} from 'lucide-react';
import { Badge, Empty, formatted } from '../app/components';
import { UrnaPreview, PageHeading } from './workflow';
import { status, type Election, type Candidate, type Terminal } from './domain';
type Details = Election & { candidates: Candidate[] };
const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
const labels = {
  draft: 'Em preparação',
  active: 'Aberta',
  scheduled: 'Agendada',
  closed: 'Encerrada',
};
/** Os filtros usam as eleições já autorizadas pela API, sem ampliar o acesso. */
export function ElectionList({
  elections,
  canCreate = true,
  create,
  choose,
  go,
  remove,
}: {
  elections: Details[];
  canCreate?: boolean;
  create: () => void;
  choose: (e: Details) => void;
  go: (view: string) => void;
  remove?: (e: Details) => void;
}) {
  const [filter, setFilter] = useState('current');
  const [search, setSearch] = useState('');
  const groups = [
    { id: 'active', label: 'Abertas', icon: Vote },
    { id: 'draft', label: 'Em preparação', icon: PencilIcon },
    { id: 'scheduled', label: 'Agendadas', icon: Clock3 },
    { id: 'closed', label: 'Encerradas', icon: CheckCircle2 },
  ];
  const order = { active: 0, draft: 1, scheduled: 2, closed: 3 };
  const rows = elections
    .filter(
      (e) =>
        (filter === 'current' ? status(e) !== 'closed' : status(e) === filter) &&
        searchText(e.name).includes(searchText(search)),
    )
    .sort(
      (a, b) =>
        order[status(a)] - order[status(b)] ||
        a.name.localeCompare(b.name, 'pt-BR', { numeric: true }),
    );
  function nextTask(e: Details) {
    if (status(e) === 'active') return 'Encerra em ' + formatted(e.endsAt);
    if (status(e) === 'scheduled') return 'Começa em ' + formatted(e.startsAt);
    if (status(e) === 'closed') return 'Votação encerrada';
    const active = e.candidates.filter((c) => c.active);
    if (!active.length) return 'Próximo passo: cadastrar candidatos';
    if (e.hasVice && active.some((c) => !c.viceName)) return 'Próximo passo: completar os vices';
    if (e.requireMatricula && !e.electorCount) return 'Próximo passo: escolher as turmas';
    return 'Próximo passo: revisar e publicar';
  }
  return (
    <>
      <PageHeading
        eyebrow="GESTÃO ESCOLAR"
        title="Eleições"
        icon={<Vote size={25} />}
        description="Organize cada eleição, acompanhe a preparação e abra a votação."
        action={
          <div className="school-page-actions">
            <button className="button secondary" onClick={() => go('terminals')}>
              <Monitor size={17} />
              Abrir urnas
            </button>
            {canCreate && (
              <button className="button primary" onClick={create}>
                <Plus size={18} />
                Nova eleição
              </button>
            )}
          </div>
        }
      />
      <div className="election-overview" role="group" aria-label="Filtrar eleições por situação">
        {groups.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={'overview-item ' + id + (filter === id ? ' selected' : '')}
            aria-pressed={filter === id}
            onClick={() => setFilter(filter === id ? 'current' : id)}
          >
            <span className="overview-icon">
              <Icon size={20} />
            </span>
            <span>
              <strong>{elections.filter((e) => status(e) === id).length}</strong>
              <small>{label}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="clean-list-tools refined-list-tools">
        <div>
          <h2>
            {filter === 'current' ? 'Eleições atuais' : groups.find((g) => g.id === filter)?.label}
          </h2>
          <span className="list-count" role="status" aria-live="polite">
            {rows.length} {rows.length === 1 ? 'eleição' : 'eleições'}
          </span>
        </div>
        <div className="list-search-actions">
          {filter !== 'current' && (
            <button className="text-button" onClick={() => setFilter('current')}>
              Ver atuais
            </button>
          )}
          <label className="clean-search">
            <Search size={17} />
            <input
              aria-label="Buscar eleição"
              placeholder="Buscar pelo nome"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
            />
            {search && (
              <button
                type="button"
                className="search-clear"
                aria-label="Limpar busca de eleições"
                onClick={() => setSearch('')}
              >
                <X size={16} />
              </button>
            )}
          </label>
        </div>
      </div>
      {rows.length ? (
        <div className="clean-election-list refined-election-list">
          {rows.map((e) => (
            <article key={e.id}>
              <span className={'beauty-election-icon ' + status(e)} aria-hidden="true">
                <Vote size={22} />
              </span>
              <div className="election-row-copy">
                <h2>{e.name}</h2>
                <p>
                  {e.candidates.filter((c) => c.active).length}{' '}
                  {e.hasVice
                    ? e.candidates.filter((c) => c.active).length === 1
                      ? 'chapa'
                      : 'chapas'
                    : e.candidates.filter((c) => c.active).length === 1
                      ? 'candidato'
                      : 'candidatos'}{' '}
                  · {e.requireMatricula ? (e.electorCount || 0) + ' eleitores' : 'Sem matrícula'}
                </p>
                <span className={'election-next ' + status(e)}>{nextTask(e)}</span>
              </div>
              <span className={'school-election-status ' + status(e)}>
                <Badge
                  tone={
                    status(e) === 'active' ? 'green' : status(e) === 'draft' ? 'blue' : 'neutral'
                  }
                >
                  {labels[status(e)]}
                </Badge>
              </span>
              <button
                className="button secondary"
                aria-label={(e.published ? 'Gerenciar ' : 'Continuar ') + e.name}
                onClick={() => choose(e)}
              >
                {!e.published ? 'Continuar' : 'Gerenciar'}
                <ArrowRight size={16} />
              </button>
              {remove && status(e) !== 'active' && (
                <button
                  className="icon-button draft-delete"
                  aria-label={'Excluir eleição ' + e.name}
                  title="Excluir eleição"
                  onClick={() => remove(e)}
                >
                  <Trash2 size={17} />
                  <span className="school-delete-label">Excluir</span>
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search
              ? 'Nenhuma eleição encontrada'
              : filter === 'current'
                ? 'Sua próxima eleição começa aqui'
                : 'Nenhuma eleição nesta situação'
          }
          text={
            search
              ? 'Tente outro nome ou consulte as eleições em outra situação.'
              : filter === 'current'
                ? canCreate
                  ? 'Comece pelos candidatos e escolha as turmas participantes.'
                  : 'As eleições criadas por sua conta aparecerão aqui.'
                : 'Escolha outra situação para consultar as eleições.'
          }
          action={
            search ? (
              <button className="button secondary" onClick={() => setSearch('')}>
                Limpar busca
              </button>
            ) : canCreate && filter === 'current' ? (
              <button className="button primary" onClick={create}>
                <Plus size={17} />
                Nova eleição
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
}
export function UrnasPanel({
  terminals,
  elections,
  choose,
  manage,
  copy,
  preview,
}: {
  terminals: Terminal[];
  elections: Details[];
  choose: (e: Details) => void;
  manage: () => void;
  copy: (url: string) => Promise<boolean>;
  preview: (model: 'standard' | 'images') => void;
}) {
  const [copied, setCopied] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="AMBIENTE DE VOTAÇÃO"
        title="Urnas"
        description="Abra a urna no aparelho da turma. As eleições são configuradas no menu Eleições."
        icon={<Keyboard size={25} />}
      />
      <div className="clean-urn-grid">
        {terminals
          .filter((t) => ['urna-padrao', 'urna-infantil'].includes(t.id))
          .map((t) => {
            const available = elections.filter(
              (e) =>
                ['active', 'scheduled'].includes(status(e)) &&
                (e.terminalIds?.includes(t.id) || t.electionId === e.id),
            );
            const activeCount = available.filter((e) => status(e) === 'active').length;
            const scheduledCount = available.length - activeCount;
            const title = t.model === 'images' ? 'Por imagens' : 'Com teclado';
            return (
              <article className={'clean-urn-card beauty-urn-' + t.model} key={t.id}>
                <div className="clean-urn-title">
                  <span className="clean-model-icon">
                    {t.model === 'images' ? <Images size={21} /> : <Keyboard size={21} />}
                  </span>
                  <div>
                    <h2>{title}</h2>
                    <p>
                      {t.model === 'images'
                        ? 'O aluno toca na foto do candidato.'
                        : 'O aluno digita o número do candidato.'}
                    </p>
                  </div>
                </div>
                <div className="clean-urn-preview" aria-label={'Modelo ' + title}>
                  <UrnaPreview model={t.model} />
                </div>
                <div className="clean-urn-count">
                  <span
                    className={
                      available.some((e) => status(e) === 'active')
                        ? 'clean-status-dot live'
                        : 'clean-status-dot'
                    }
                  />
                  <strong>
                    {available.length
                      ? [
                          activeCount
                            ? activeCount + (activeCount === 1 ? ' aberta' : ' abertas')
                            : '',
                          scheduledCount
                            ? scheduledCount + (scheduledCount === 1 ? ' agendada' : ' agendadas')
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'Nenhuma eleição publicada'}
                  </strong>
                </div>
                {available.length > 0 ? (
                  <div className="clean-urn-elections visible-urn-elections">
                    <h3>Eleições nesta urna</h3>
                    {available.map((e) => (
                      <button key={e.id} onClick={() => choose(e)}>
                        <span>{e.name}</span>
                        <Badge tone={status(e) === 'active' ? 'green' : 'neutral'}>
                          {status(e) === 'active' ? 'Aberta' : 'Agendada'}
                        </Badge>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="clean-urn-empty">
                    Publique uma eleição e selecione este modelo na última etapa.
                  </p>
                )}
                <div className="clean-urn-actions">
                  {available.length > 0 ? (
                    <a
                      className="button primary"
                      href={'/v2/urna/' + t.id}
                      target="_blank"
                      rel="noopener"
                    >
                      Abrir urna
                      <ArrowRight size={17} />
                    </a>
                  ) : (
                    <button className="button secondary" onClick={manage}>
                      Ver eleições
                      <ArrowRight size={17} />
                    </button>
                  )}
                  <div>
                    <button className="text-button" onClick={() => preview(t.model)}>
                      <Play size={15} />
                      Testar
                    </button>
                    <button
                      className="text-button"
                      onClick={async () => {
                        if (await copy(location.origin + '/v2/urna/' + t.id)) setCopied(t.id);
                      }}
                    >
                      {copied === t.id ? <Check size={15} /> : <Copy size={15} />}{' '}
                      {copied === t.id ? 'Link copiado' : 'Copiar link'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
      </div>
      <p className="clean-urn-note">
        A mesma urna pode receber várias eleições. Candidatos, eleitores e horários são definidos em{' '}
        <button className="text-button" onClick={manage}>
          Eleições
          <ArrowRight size={14} />
        </button>
        .
      </p>
    </>
  );
}

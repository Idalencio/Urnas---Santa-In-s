import { useState } from 'react';
import { ArrowRight, Check, Copy, Keyboard, Images, Play, Plus, Search, Vote } from 'lucide-react';
import { Badge, Empty } from '../app/components';
import { UrnaPreview, PageHeading } from './workflow';
import { status, type Election, type Candidate, type Terminal } from './domain';
type Details = Election & { candidates: Candidate[] };
const labels = {
  draft: 'Em preparação',
  active: 'Aberta',
  scheduled: 'Agendada',
  closed: 'Encerrada',
};
export function ElectionList({
  elections,
  canCreate = true,
  create,
  choose,
}: {
  elections: Details[];
  canCreate?: boolean;
  create: () => void;
  choose: (e: Details) => void;
}) {
  const [closed, setClosed] = useState(false),
    [search, setSearch] = useState('');
  const rows = elections.filter(
    (e) =>
      (status(e) === 'closed') === closed && e.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="beauty-hero">
        <div className="beauty-hero-copy">
          <span className="beauty-kicker">COLÉGIO SANTA INÊS · URNA ESCOLAR</span>
          <h1>Eleições da escola</h1>
          <p>Um espaço para organizar escolhas e incentivar a participação.</p>
          <div className="beauty-hero-actions">
            {canCreate && (
              <button className="button primary" onClick={create}>
                <Plus size={18} />
                Nova eleição
              </button>
            )}
            <div className="beauty-hero-meta">
              <span>
                <i />
                {elections.filter((e) => status(e) === 'active').length} abertas
              </span>
              <span>{elections.filter((e) => status(e) === 'draft').length} em preparação</span>
            </div>
          </div>
        </div>
        <div className="beauty-hero-art" aria-hidden="true">
          <img src="/vote-box-csi.svg" alt="" />
        </div>
      </section>
      <div className="clean-list-tools">
        <div className="clean-segments" aria-label="Filtrar eleições">
          <button className={!closed ? 'active' : ''} onClick={() => setClosed(false)}>
            Atuais
          </button>
          <button className={closed ? 'active' : ''} onClick={() => setClosed(true)}>
            Encerradas
          </button>
        </div>
        <label className="clean-search">
          <Search size={17} />
          <input
            aria-label="Buscar eleição"
            placeholder="Buscar eleição"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
        </label>
      </div>
      {rows.length ? (
        <div className="clean-election-list">
          {rows.map((e) => (
            <article key={e.id}>
              <span className={'beauty-election-icon ' + status(e)} aria-hidden="true">
                <Vote size={22} />
              </span>
              <div>
                <h2>{e.name}</h2>
                <p>
                  {e.candidates.filter((c) => c.active).length}{' '}
                  {e.hasVice ? 'chapas' : 'candidatos'} · {e.electorCount || 0} eleitores
                </p>
              </div>
              <Badge
                tone={status(e) === 'active' ? 'green' : status(e) === 'draft' ? 'blue' : 'neutral'}
              >
                {labels[status(e)]}
              </Badge>
              <button className="button secondary" onClick={() => choose(e)}>
                {!e.published ? 'Continuar' : 'Gerenciar'}
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            search
              ? 'Nenhuma eleição encontrada'
              : closed
                ? 'Nenhuma eleição encerrada'
                : 'Sua próxima eleição começa aqui'
          }
          text={
            search
              ? 'Tente outro nome.'
              : closed
                ? 'As votações encerradas ficarão nesta aba.'
                : canCreate
                  ? 'Cadastre os candidatos e escolha quem participa.'
                  : 'O administrador pode liberar eleições para sua conta em Acessos.'
          }
          action={
            canCreate && !closed && !search ? (
              <button className="button primary" onClick={create}>
                Nova eleição
                <Plus size={17} />
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
        description="Escolha como a turma vai votar."
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
                      ? available.length +
                        ' ' +
                        (available.length === 1 ? 'eleição disponível' : 'eleições disponíveis')
                      : 'Nenhuma eleição publicada'}
                  </strong>
                </div>
                {available.length > 0 ? (
                  <details className="clean-urn-elections">
                    <summary>Ver eleições</summary>
                    {available.map((e) => (
                      <button key={e.id} onClick={() => choose(e)}>
                        <span>{e.name}</span>
                        <Badge tone={status(e) === 'active' ? 'green' : 'neutral'}>
                          {status(e) === 'active' ? 'Aberta' : 'Agendada'}
                        </Badge>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </details>
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

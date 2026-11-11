import { useState } from 'react';
import { ArrowLeft, BarChart3, Search } from 'lucide-react';
import { formatted } from '../app/components';
import { ElectionTally } from './tally';
import { status, type Election } from './domain';

export type ArchivedElection = Election & {
  ownerName: string;
  voteCount: number;
  deletedAt: string | null;
};
export default function ElectionArchive({ rows }: { rows: ArchivedElection[] }) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState('');
  const current = rows.find((e) => e.id === selected);
  const shown = rows.filter(
    (e) =>
      (filter === 'all' || (filter === 'deleted' ? !!e.deletedAt : !e.deletedAt)) &&
      (e.name + ' ' + e.ownerName)
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')),
  );
  if (current)
    return (
      <section className="election-archive-detail">
        <button className="text-button" onClick={() => setSelected('')}>
          <ArrowLeft size={16} />
          Todas as eleições
        </button>
        {current.deletedAt && (
          <p className="info-banner">
            Excluída das listas em {formatted(current.deletedAt)}. Os resultados estão preservados
            neste arquivo.
          </p>
        )}
        <ElectionTally id={current.id} />
      </section>
    );
  return (
    <section className="election-archive">
      <div className="archive-intro">
        <h2>Arquivo de eleições</h2>
        <p>
          Todas as eleições da escola, incluindo as excluídas das listas. Acesso exclusivo de
          administradores.
        </p>
      </div>
      <div className="archive-tools">
        <label className="clean-search">
          <Search size={17} />
          <input
            aria-label="Buscar no arquivo de eleições"
            value={query}
            placeholder="Buscar eleição ou responsável"
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </label>
        <label>
          Exibir
          <select value={filter} onChange={(ev) => setFilter(ev.target.value)}>
            <option value="all">Todas as eleições</option>
            <option value="kept">Nas listas do painel</option>
            <option value="deleted">Excluídas das listas</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Eleição</th>
              <th>Responsável</th>
              <th>Situação</th>
              <th>Votos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td>
                  <strong>{e.name}</strong>
                  <small className="archive-date">
                    {e.startsAt ? formatted(e.startsAt) : 'Sem agendamento'}
                  </small>
                  {e.deletedAt && (
                    <small className="archive-deleted">Excluída em {formatted(e.deletedAt)}</small>
                  )}
                </td>
                <td>{e.ownerName}</td>
                <td>
                  {
                    {
                      draft: 'Em preparação',
                      scheduled: 'Agendada',
                      active: 'Aberta',
                      closed: 'Encerrada',
                    }[status(e)]
                  }
                </td>
                <td>{e.voteCount}</td>
                <td>
                  {!!e.published && (
                    <button className="text-button" onClick={() => setSelected(e.id)}>
                      <BarChart3 size={16} />
                      Ver resultado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="simple-empty">Nenhuma eleição encontrada.</p>}
      <p className="simple-hint">
        {shown.length} {shown.length === 1 ? 'eleição' : 'eleições'} no arquivo.
      </p>
    </section>
  );
}

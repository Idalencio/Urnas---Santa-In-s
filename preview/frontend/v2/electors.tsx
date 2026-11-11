import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, Users } from 'lucide-react';
import { responseData } from '../app/http';
import { ClassPicker } from './people';

type Row = { matricula: string; name: string; className: string; selected: boolean };
const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** A seleção pertence à eleição. Nenhuma alteração é feita no cadastro dos alunos. */
export default function ElectorSelection({
  electionId,
  busy,
  action,
  back,
  done,
}: {
  electionId: string;
  busy: boolean;
  action: (name: string, payload: any) => Promise<any>;
  back: () => void;
  done: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [classes, setClasses] = useState<string[]>([]),
    [opened, setOpened] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v2/app', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
      },
      body: JSON.stringify({ action: 'roster', electionId }),
    })
      .then(responseData)
      .then((data) => {
        setRows(data.rows);
        const saved = data.rows.filter((r: Row) => r.selected);
        const groups = [...new Set<string>(saved.map((r: Row) => r.className))];
        setSelected(saved.map((r: Row) => r.matricula));
        setClasses(groups);
        setOpened(groups[0] || '');
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [electionId]);
  const options = [...new Set((rows || []).map((r) => r.className))].map((name) => ({
    name,
    count: rows!.filter((r) => r.className === name).length,
  }));
  const classRows = (rows || []).filter((r) => r.className === opened),
    chosen = new Set(selected);
  const visible = classRows.filter((r) =>
    searchText(r.name + ' ' + r.matricula).includes(searchText(query)),
  );
  const count = classRows.filter((r) => chosen.has(r.matricula)).length;
  function selectClasses(value: string[]) {
    const added = value.filter((c) => !classes.includes(c));
    setSelected([
      ...new Set([
        ...selected.filter((m) =>
          rows?.some((r) => r.matricula === m && value.includes(r.className)),
        ),
        ...(rows || []).filter((r) => added.includes(r.className)).map((r) => r.matricula),
      ]),
    ]);
    setClasses(value);
    if (!value.includes(opened)) setOpened(added[0] || value[0] || '');
    setPage(0);
    setQuery('');
  }
  return (
    <div className="elector-selection">
      <p className="simple-hint">
        Selecione as turmas. Todos os alunos entram na lista; depois, desmarque quem não vai
        participar.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {rows === null ? (
        <p role="status">{error ? 'Não foi possível carregar os alunos.' : 'Carregando alunos…'}</p>
      ) : (
        <>
          <ClassPicker
            options={options}
            value={classes}
            disabled={busy}
            onChange={selectClasses}
            emptyText="Nenhuma turma disponível. Peça ao administrador para cadastrar ou liberar as turmas."
          />
          {!!classes.length && (
            <section className="elector-class-panel">
              <div className="elector-class-tools">
                <label>
                  Conferir alunos da turma
                  <select
                    value={opened}
                    onChange={(ev) => {
                      setOpened(ev.target.value);
                      setPage(0);
                      setQuery('');
                    }}
                  >
                    {classes.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="clean-search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar aluno na seleção"
                    placeholder="Buscar nome ou matrícula"
                    value={query}
                    onChange={(ev) => {
                      setQuery(ev.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              <div className="elector-class-summary">
                <div>
                  <strong>{opened}</strong>
                  <span>
                    {count} de {classRows.length} alunos selecionados
                  </span>
                </div>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    setSelected((old) =>
                      count === classRows.length
                        ? old.filter((m) => !classRows.some((r) => r.matricula === m))
                        : [...new Set([...old, ...classRows.map((r) => r.matricula)])],
                    )
                  }
                >
                  {count === classRows.length
                    ? 'Desmarcar turma inteira'
                    : 'Selecionar turma inteira'}
                </button>
              </div>
              <div className="table-scroll">
                <table className="elector-selection-table">
                  <thead>
                    <tr>
                      <th>Vota</th>
                      <th>Aluno</th>
                      <th>Matrícula</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(page * 40, (page + 1) * 40).map((r) => (
                      <tr
                        key={r.matricula}
                        className={chosen.has(r.matricula) ? '' : 'elector-excluded'}
                      >
                        <td>
                          <input
                            type="checkbox"
                            disabled={busy}
                            aria-label={'Permitir voto de ' + r.name}
                            checked={chosen.has(r.matricula)}
                            onChange={(ev) =>
                              setSelected((old) =>
                                ev.target.checked
                                  ? [...new Set([...old, r.matricula])]
                                  : old.filter((m) => m !== r.matricula),
                              )
                            }
                          />
                        </td>
                        <td>{r.name}</td>
                        <td>{r.matricula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visible.length && <p className="simple-empty">Nenhum aluno encontrado.</p>}
              {visible.length > 40 && (
                <div className="elector-pagination">
                  <span>
                    {page * 40 + 1}–{Math.min((page + 1) * 40, visible.length)} de {visible.length}
                  </span>
                  <button
                    className="text-button"
                    disabled={!page}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    className="text-button"
                    disabled={(page + 1) * 40 >= visible.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </section>
          )}
          <p className="elector-total" role="status">
            <Users size={17} />
            <strong>{selected.length}</strong> eleitores nesta eleição
          </p>
        </>
      )}
      <div className="simple-footer">
        <button className="button secondary" disabled={busy} onClick={back}>
          <ArrowLeft size={17} />
          Voltar
        </button>
        <button
          className="button primary"
          disabled={busy || !rows}
          onClick={async () => {
            setError('');
            try {
              await action('enroll', { electionId, classes, matriculas: selected });
              done();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          {busy ? 'Salvando…' : 'Salvar e continuar'}
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}

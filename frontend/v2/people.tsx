import { useState, useId, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Upload,
  Users,
  UserPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Empty, Field, Modal } from '../app/components';
import { PageHeading } from './workflow';
export type SchoolClass = { name: string; count: number };
export type Student = {
  matricula: string;
  name: string;
  className: string;
  voted?: number;
  released?: number;
  matriculaLocked?: boolean | number;
};
/** Seleciona turmas já cadastradas, respeitando as opções recebidas da API. */
export function ClassPicker({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: SchoolClass[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const visible = options.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    count = options.filter((c) => value.includes(c.name)).reduce((n, c) => n + c.count, 0);
  return (
    <div className="class-picker">
      <div className="class-picker-tools">
        <label className="clean-search">
          <Search size={16} />
          <input
            aria-label="Buscar turma"
            placeholder="Buscar turma"
            value={search}
            onChange={(ev) => setSearch(ev.target.value)}
          />
        </label>
        <button
          type="button"
          className="text-button"
          disabled={disabled || !visible.length}
          onClick={() =>
            onChange(
              visible.every((c) => value.includes(c.name))
                ? value.filter((v) => !visible.some((c) => c.name === v))
                : [...new Set([...value, ...visible.map((c) => c.name)])],
            )
          }
        >
          {visible.length && visible.every((c) => value.includes(c.name))
            ? 'Desmarcar turmas'
            : 'Selecionar turmas'}
        </button>
      </div>
      <div className="class-picker-grid">
        {visible.map((c) => (
          <label key={c.name} className={value.includes(c.name) ? 'selected' : ''}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.includes(c.name)}
              onChange={(ev) =>
                onChange(ev.target.checked ? [...value, c.name] : value.filter((n) => n !== c.name))
              }
            />
            <span>
              <strong>{c.name}</strong>
              <small>
                {c.count} {c.count === 1 ? 'aluno' : 'alunos'}
              </small>
            </span>
            {value.includes(c.name) && <Check size={16} />}
          </label>
        ))}
      </div>
      {!visible.length && (
        <p className="simple-hint">
          {options.length
            ? 'Nenhuma turma encontrada.'
            : 'O administrador precisa importar ou liberar as turmas para esta conta.'}
        </p>
      )}
      <p className="class-picker-total">
        {options.filter((c) => value.includes(c.name)).length}{' '}
        {options.filter((c) => value.includes(c.name)).length === 1
          ? 'turma selecionada'
          : 'turmas selecionadas'}{' '}
        · {count} alunos
      </p>
    </div>
  );
}
/** Cadastro individual: nova turma surge ao cadastrar seu primeiro aluno. */
function StudentForm({
  student,
  initialClass,
  classes,
  busy,
  save,
}: {
  student?: Student;
  initialClass: string;
  classes: SchoolClass[];
  busy: boolean;
  save: (value: any) => Promise<void>;
}) {
  const id = useId(),
    [value, setValue] = useState({
      name: student?.name || '',
      matricula: student?.matricula || '',
      className: student?.className || initialClass,
    }),
    [error, setError] = useState('');
  return (
    <form
      className="editor-form roster-form"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError('');
        try {
          await save({ ...value, ...(student ? { originalMatricula: student.matricula } : {}) });
        } catch (err: any) {
          setError(err.message);
        }
      }}
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <Field label="Nome do aluno">
        <input
          required
          maxLength={160}
          autoComplete="off"
          value={value.name}
          onChange={(ev) => setValue({ ...value, name: ev.target.value })}
          placeholder="Nome completo"
        />
      </Field>
      <div className="roster-form-columns">
        <Field
          label="Matrícula / título eleitoral"
          hint={
            student?.matriculaLocked
              ? 'Esta matrícula já está vinculada a uma eleição e não pode ser alterada.'
              : 'Mantenha os zeros que fazem parte da matrícula.'
          }
        >
          <input
            required
            disabled={!!student?.matriculaLocked}
            maxLength={80}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={value.matricula}
            onChange={(ev) => setValue({ ...value, matricula: ev.target.value })}
            placeholder="Ex.: 001234"
          />
        </Field>
        <Field label="Turma" hint="Escolha uma turma ou digite o nome de uma nova.">
          <input
            required
            list={id}
            maxLength={80}
            autoComplete="off"
            value={value.className}
            onChange={(ev) => setValue({ ...value, className: ev.target.value })}
            placeholder="Ex.: 6A"
          />
          <datalist id={id}>
            {classes.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </Field>
      </div>
      <p className="simple-hint">
        O cadastro fica disponível para a seleção de eleitores. As listas das eleições já publicadas
        são preservadas.
      </p>
      <div className="form-footer">
        <button className="button primary" disabled={busy}>
          <Check size={17} />
          {busy ? 'Salvando…' : student ? 'Salvar alterações' : 'Adicionar aluno'}
        </button>
      </div>
    </form>
  );
}
function RenameClassForm({
  name,
  busy,
  save,
}: {
  name: string;
  busy: boolean;
  save: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(name),
    [error, setError] = useState('');
  return (
    <form
      className="editor-form roster-form"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError('');
        try {
          await save(value);
        } catch (err: any) {
          setError(err.message);
        }
      }}
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <Field label="Nome da turma">
        <input
          required
          maxLength={80}
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          autoComplete="off"
        />
      </Field>
      <p className="simple-hint">
        Atualiza a turma no cadastro geral e mantém as permissões da equipe. As listas das eleições
        publicadas permanecem como estavam.
      </p>
      <div className="form-footer">
        <button className="button primary" disabled={busy}>
          <Check size={17} />
          {busy ? 'Salvando…' : 'Salvar nome da turma'}
        </button>
      </div>
    </form>
  );
}
/** A confirmação identifica o aluno e explica a preservação do histórico eleitoral. */
function DeleteStudentForm({
  student,
  busy,
  cancel,
  remove,
}: {
  student: Student;
  busy: boolean;
  cancel: () => void;
  remove: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <form
      className="editor-form roster-form"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError('');
        try {
          await remove();
        } catch (err: any) {
          setError(err.message);
        }
      }}
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <p>
        Excluir <strong>{student.name}</strong>, matrícula <strong>{student.matricula}</strong>, da
        turma <strong>{student.className}</strong>?
      </p>
      <p className="simple-hint">
        O aluno sairá do cadastro da escola. As listas já vinculadas às eleições, a participação e
        os votos serão preservados.
      </p>
      <p className="simple-hint">
        Nos rascunhos, use “Atualizar alunos das turmas” para atualizar a lista de eleitores. Você
        pode cadastrar o aluno novamente com a mesma matrícula.
      </p>
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
        <button className="button roster-delete-confirm" disabled={busy}>
          <Trash2 size={16} />
          {busy ? 'Excluindo…' : 'Excluir aluno'}
        </button>
      </div>
    </form>
  );
}
type RosterDialog =
  | { kind: 'student'; student?: Student }
  | { kind: 'rename'; name: string }
  | { kind: 'delete'; student: Student }
  | null;
/** Gestão do cadastro geral; operações de escrita são exclusivas dos administradores. */
export function ClassesPanel({
  classes,
  students,
  admin,
  importer,
  busy,
  action,
  notify,
}: {
  classes: SchoolClass[];
  students: Student[];
  admin: boolean;
  importer: ReactNode;
  busy: boolean;
  action: (name: string, payload: any) => Promise<any>;
  notify: (text: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState(''),
    [importing, setImporting] = useState(false),
    [studentSearch, setStudentSearch] = useState(''),
    [dialog, setDialog] = useState<RosterDialog>(null);
  const filtered = classes.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    rows = students.filter(
      (s) =>
        s.className === selected &&
        (s.name + ' ' + s.matricula).toLowerCase().includes(studentSearch.toLowerCase()),
    ),
    total = classes.reduce((n, c) => n + c.count, 0),
    selectedCount = classes.find((c) => c.name === selected)?.count || 0;
  return (
    <>
      <PageHeading
        eyebrow="CADASTRO DA ESCOLA"
        title="Turmas"
        description={
          admin
            ? 'Importe uma lista ou cadastre alunos individualmente.'
            : 'As turmas liberadas para sua conta, em um só lugar.'
        }
        icon={<Users size={25} />}
        action={
          admin ? (
            <div className="roster-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setImporting((x) => !x)}
              >
                <Upload size={17} />
                {importing ? 'Fechar importação' : 'Importar lista da escola'}
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => setDialog({ kind: 'student' })}
              >
                <UserPlus size={17} />
                Adicionar aluno
              </button>
            </div>
          ) : undefined
        }
      />
      {admin && importing && (
        <section className="simple-panel">
          <h2>Lista geral de alunos</h2>
          {importer}
        </section>
      )}
      {selected && admin ? (
        <section className="simple-panel">
          <button className="text-button roster-back" onClick={() => setSelected('')}>
            <ArrowLeft size={16} />
            Todas as turmas
          </button>
          <div className="roster-class-heading">
            <div>
              <h2>Turma {selected}</h2>
              <p>
                {selectedCount} {selectedCount === 1 ? 'aluno cadastrado' : 'alunos cadastrados'}
              </p>
            </div>
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => setDialog({ kind: 'rename', name: selected })}
            >
              <Pencil size={15} />
              Renomear turma
            </button>
          </div>
          <label className="clean-search roster-student-search">
            <Search size={16} />
            <input
              aria-label="Buscar aluno da turma"
              placeholder="Nome ou matrícula"
              value={studentSearch}
              onChange={(ev) => setStudentSearch(ev.target.value)}
            />
          </label>
          <div className="table-scroll class-students">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Matrícula / título</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.matricula}>
                    <td>{s.name}</td>
                    <td>{s.matricula}</td>
                    <td>
                      <div className="roster-row-actions">
                        <button
                          className="text-button"
                          disabled={busy}
                          aria-label={'Editar aluno ' + s.name}
                          onClick={() => setDialog({ kind: 'student', student: s })}
                        >
                          <Pencil size={14} />
                          Editar
                        </button>
                        <button
                          className="text-button roster-delete"
                          disabled={busy}
                          aria-label={'Excluir aluno ' + s.name}
                          onClick={() => setDialog({ kind: 'delete', student: s })}
                        >
                          <Trash2 size={14} />
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="roster-empty">Nenhum aluno encontrado.</p>}
          </div>
        </section>
      ) : (
        <>
          <div className="clean-list-tools">
            <p className="simple-hint">
              {classes.length} {classes.length === 1 ? 'turma' : 'turmas'} · {total}{' '}
              {total === 1 ? 'aluno' : 'alunos'}
            </p>
            <label className="clean-search">
              <Search size={17} />
              <input
                aria-label="Buscar turma cadastrada"
                placeholder="Buscar turma"
                value={search}
                onChange={(ev) => setSearch(ev.target.value)}
              />
            </label>
          </div>
          {filtered.length ? (
            <div className="school-class-grid">
              {filtered.map((c) => (
                <article key={c.name}>
                  <Users size={20} />
                  <div>
                    <h2>{c.name}</h2>
                    <p>
                      {c.count} {c.count === 1 ? 'aluno' : 'alunos'}
                    </p>
                  </div>
                  {admin && (
                    <button
                      className="icon-button"
                      aria-label={'Ver alunos da turma ' + c.name}
                      onClick={() => {
                        setSelected(c.name);
                        setStudentSearch('');
                      }}
                    >
                      <ArrowRight size={18} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Nenhuma turma disponível"
              text={
                admin
                  ? 'Adicione um aluno ou importe uma lista. As turmas são formadas automaticamente.'
                  : 'Peça ao administrador para liberar as turmas da sua conta.'
              }
            />
          )}
        </>
      )}
      {admin && dialog?.kind === 'student' && (
        <Modal
          wide
          title={dialog.student ? 'Editar aluno' : 'Adicionar aluno'}
          onClose={() => !busy && setDialog(null)}
        >
          <StudentForm
            student={dialog.student}
            initialClass={selected}
            classes={classes}
            busy={busy}
            save={async (value) => {
              const result = await action('student', { value });
              setSelected(result.className);
              setStudentSearch('');
              setDialog(null);
              notify(dialog.student ? 'Aluno atualizado.' : 'Aluno adicionado à turma.');
            }}
          />
        </Modal>
      )}
      {admin && dialog?.kind === 'delete' && (
        <Modal title="Excluir aluno da turma" onClose={() => !busy && setDialog(null)}>
          <DeleteStudentForm
            student={dialog.student}
            busy={busy}
            cancel={() => setDialog(null)}
            remove={async () => {
              await action('deleteStudent', {
                matricula: dialog.student.matricula,
                className: dialog.student.className,
              });
              if (selectedCount === 1) setSelected('');
              setDialog(null);
              notify('Aluno excluído da turma.');
            }}
          />
        </Modal>
      )}
      {admin && dialog?.kind === 'rename' && (
        <Modal title="Renomear turma" onClose={() => !busy && setDialog(null)}>
          <RenameClassForm
            name={dialog.name}
            busy={busy}
            save={async (name) => {
              const result = await action('renameClass', { from: dialog.name, name });
              setSelected(result.name);
              setSearch('');
              setDialog(null);
              notify('Nome da turma atualizado.');
            }}
          />
        </Modal>
      )}
    </>
  );
}

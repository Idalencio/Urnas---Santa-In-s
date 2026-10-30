import { useEffect, useRef, useState, useId } from 'react';
import {
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  Copy,
  Upload,
  Printer,
  Download,
  LockKeyhole,
  Play,
  CheckCircle2,
  Keyboard,
  Images,
} from 'lucide-react';
import { Login, AccountSettings } from '../app/access';
import { Field, Modal, Badge, Empty, csvDownload, formatted, localInput } from '../app/components';
import { Shell, UrnaPreview } from './workflow';
import { ElectionList, UrnasPanel } from './management';
import { ClassPicker, ClassesPanel, type SchoolClass, type Student } from './people';
import { TeamPanel, allowed, type TeamAccount } from './access';
import Ballot from './ballot';
import { exampleCandidates, previewElection } from './demo';
import { responseData } from '../app/http';
import { status, type Election, type Candidate, type Terminal } from './domain';
type Model = 'standard' | 'images';
type DetailedElection = Election & { candidates: Candidate[] };
type State = {
  me: TeamAccount;
  elections: DetailedElection[];
  students: Student[];
  terminals: Terminal[];
  classes: SchoolClass[];
  accounts: TeamAccount[];
};
type Issue = { text: string; step: number };
const states = {
  draft: 'Em preparação',
  active: 'Aberta',
  scheduled: 'Agendada',
  closed: 'Encerrada',
};
const modelName = (model: string) => (model === 'images' ? 'Por imagens' : 'Com teclado');
const steps = ['Eleição', 'Candidatos', 'Eleitores', 'Publicar'];
/** Antecipação dos campos pendentes; o servidor repete as validações ao publicar. */
function checks(e: DetailedElection, models: Model[]): Issue[] {
  const out: Issue[] = [],
    active = e.candidates.filter((c) => c.active);
  if (!active.length) out.push({ text: 'Adicione pelo menos um candidato.', step: 1 });
  if (e.hasVice && active.some((c) => !c.viceName))
    out.push({ text: 'Complete o nome do vice nas chapas.', step: 1 });
  if (models.includes('images') && active.some((c) => !c.image || (e.hasVice && !c.viceImage)))
    out.push({
      text: 'Adicione as fotos de todos os candidatos e vices para usar a urna por imagens.',
      step: 1,
    });
  if (e.requireMatricula && !e.electorCount)
    out.push({ text: 'Escolha os eleitores desta eleição.', step: 2 });
  if (!models.length) out.push({ text: 'Escolha pelo menos um modelo de urna.', step: 3 });
  return out;
}
function Photo({
  label,
  value,
  onChange,
  upload,
  pending,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  upload: (f: File) => Promise<string>;
  pending: (n: number) => void;
}) {
  const id = useId(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="simple-photo">
      <span>{label}</span>
      <div>
        {value ? (
          <img src={value} alt={label} />
        ) : (
          <span className="simple-photo-empty">Sem foto</span>
        )}
        <label htmlFor={id} className="button secondary small">
          <Upload size={16} />
          {busy ? 'Enviando…' : 'Escolher foto'}
        </label>
        <input
          id={id}
          type="file"
          hidden
          aria-label={label}
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (ev) => {
            const f = ev.target.files?.[0];
            if (!f) return;
            pending(1);
            setBusy(true);
            setError('');
            try {
              onChange(await upload(f));
            } catch (err: any) {
              setError(err.message);
            } finally {
              pending(-1);
              setBusy(false);
              ev.target.value = '';
            }
          }}
        />
      </div>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
function ElectionForm({
  value,
  busy,
  save,
}: {
  value?: DetailedElection;
  busy: boolean;
  save: (v: any) => Promise<void>;
}) {
  const [v, setV] = useState<any>(
      value || { name: '', digits: 5, hasVice: 1, requireMatricula: 1 },
    ),
    [error, setError] = useState('');
  return (
    <form
      className="simple-form election-form-grid"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError('');
        try {
          await save(v);
        } catch (err: any) {
          setError(err.message);
        }
      }}
    >
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      <Field label="Nome da eleição">
        <input
          required
          maxLength={160}
          value={v.name}
          placeholder="Ex.: Prefeito e vice do 6º ano"
          onChange={(ev) => setV({ ...v, name: ev.target.value })}
        />
      </Field>
      <div className="election-vice-settings">
        <fieldset className="simple-radio">
          <legend>Terá vice-prefeito?</legend>
          {[
            { v: 1, t: 'Sim, prefeito e vice' },
            { v: 0, t: 'Não, somente candidato' },
          ].map((x) => (
            <label key={x.v}>
              <input
                type="radio"
                name="hasVice"
                checked={v.hasVice === x.v}
                onChange={() => setV({ ...v, hasVice: x.v })}
              />
              {x.t}
            </label>
          ))}
        </fieldset>
        <p className="simple-hint">O aluno informa a matrícula para votar uma vez nesta eleição.</p>
      </div>
      <section className="election-visible-options" aria-label="Opções da eleição">
        <h3>Opções da eleição</h3>
        <Field label="Limite de dígitos do candidato">
          <select
            value={v.digits}
            onChange={(ev) => setV({ ...v, digits: Number(ev.target.value) })}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option value={n} key={n}>
                Até {n} {n === 1 ? 'dígito' : 'dígitos'}
              </option>
            ))}
          </select>
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!v.requireMatricula}
            onChange={(ev) => setV({ ...v, requireMatricula: ev.target.checked ? 1 : 0 })}
          />
          Exigir matrícula para votar
        </label>
        {!v.requireMatricula && <p>Modo de demonstração: permite votos sem identificação.</p>}
      </section>
      <div className="simple-footer">
        <button className="button primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar e continuar'}
          <ArrowRight size={17} />
        </button>
      </div>
    </form>
  );
}
function CandidateForm({
  election,
  value,
  busy,
  save,
  upload,
}: {
  election: DetailedElection;
  value?: Candidate;
  busy: boolean;
  save: (v: any) => Promise<void>;
  upload: (f: File) => Promise<string>;
}) {
  const [v, setV] = useState<any>(
      value || { name: '', code: '', image: '', viceName: '', viceImage: '', active: 1 },
    ),
    [error, setError] = useState(''),
    [uploads, setUploads] = useState(0);
  const change = (key: string, val: any) => setV((old: any) => ({ ...old, [key]: val }));
  return (
    <form
      className="editor-form simple-candidate-form"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setError('');
        if (uploads) return;
        try {
          await save({ ...v, electionId: election.id });
        } catch (err: any) {
          setError(err.message);
        }
      }}
    >
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      <Field
        label="Número do candidato"
        hint="Digite o número completo. Nenhum zero será acrescentado."
      >
        <input
          required
          inputMode="numeric"
          pattern="0|[1-9][0-9]{0,4}"
          maxLength={election.digits}
          value={v.code}
          placeholder="Ex.: 1, 12 ou 345"
          onChange={(ev) => change('code', ev.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <div className="simple-people">
        <section>
          <h3>{election.hasVice ? 'Prefeito' : 'Candidato'}</h3>
          <Field label={election.hasVice ? 'Nome do prefeito' : 'Nome do candidato'}>
            <input
              required
              maxLength={160}
              value={v.name}
              onChange={(ev) => change('name', ev.target.value)}
            />
          </Field>
          <Photo
            label={election.hasVice ? 'Foto do prefeito' : 'Foto do candidato'}
            value={v.image}
            onChange={(s) => change('image', s)}
            upload={upload}
            pending={(n) => setUploads((x) => x + n)}
          />
        </section>
        {!!election.hasVice && (
          <section>
            <h3>Vice-prefeito</h3>
            <Field label="Nome do vice-prefeito">
              <input
                required
                maxLength={160}
                value={v.viceName}
                onChange={(ev) => change('viceName', ev.target.value)}
              />
            </Field>
            <Photo
              label="Foto do vice-prefeito"
              value={v.viceImage}
              onChange={(s) => change('viceImage', s)}
              upload={upload}
              pending={(n) => setUploads((x) => x + n)}
            />
          </section>
        )}
      </div>
      <details className="simple-details">
        <summary>Participação</summary>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!v.active}
            onChange={(ev) => change('active', ev.target.checked ? 1 : 0)}
          />
          Participa desta eleição
        </label>
      </details>
      <div className="form-footer">
        <button className="button primary" disabled={busy || uploads > 0}>
          <Check size={17} />
          {uploads ? 'Enviando fotos…' : election.hasVice ? 'Salvar chapa' : 'Salvar candidato'}
        </button>
      </div>
    </form>
  );
}
/** Exibe prévia antes de importar o cadastro geral usado pelas eleições. */
function CsvImport({
  busy,
  action,
  onDone,
}: {
  busy: boolean;
  action: (name: string, payload: any) => Promise<any>;
  onDone: () => void;
}) {
  const [csv, setCsv] = useState(''),
    [rows, setRows] = useState<Student[] | null>(null),
    [error, setError] = useState('');
  return (
    <div className="simple-import">
      <div className="simple-inline">
        <label className="button secondary">
          <Upload size={17} />
          Escolher arquivo CSV
          <input
            hidden
            type="file"
            aria-label="Arquivo CSV de alunos"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              if (!f) return;
              setError('');
              setRows(null);
              if (f.size > 1500000) {
                setError('Use um arquivo de até 1,5 MB.');
                return;
              }
              try {
                const content = await f.text();
                const result = await action('csvPreview', { csv: content });
                setCsv(content);
                setRows(result.rows);
              } catch (err: any) {
                setError(err.message);
              }
            }}
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            csvDownload('modelo-alunos.csv', [
              ['nome', 'turma', 'matricula'],
              ['Aluno de exemplo', '6A', '001234'],
            ])
          }
        >
          <Download size={15} />
          Baixar modelo
        </button>
      </div>
      <p className="simple-hint">
        Importe todas as turmas no mesmo CSV, com as colunas nome, turma e matricula. Os alunos já
        cadastrados são atualizados pela matrícula.
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {rows && (
        <>
          <p>
            <strong>
              {rows.length} alunos em {new Set(rows.map((r) => r.className)).size} turmas
            </strong>
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Turma</th>
                  <th>Matrícula</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((s) => (
                  <tr key={s.matricula}>
                    <td>{s.name}</td>
                    <td>{s.className}</td>
                    <td>{s.matricula}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setError('');
              try {
                await action('csvImport', { csv });
                setRows(null);
                setCsv('');
                onDone();
              } catch (err: any) {
                setError(err.message);
              }
            }}
          >
            {busy ? 'Importando…' : 'Confirmar importação'}
          </button>
        </>
      )}
    </div>
  );
}
function CandidateList({
  election,
  edit,
}: {
  election: DetailedElection;
  edit?: (c: Candidate) => void;
}) {
  return (
    <div className="simple-candidates">
      {election.candidates.map((c) => (
        <article key={c.id} className={!c.active ? 'inactive' : ''}>
          <div className="simple-slate-thumb">
            <img src={c.image || '/csi-logo.png'} alt={c.name} />
            {!!election.hasVice && (
              <img src={c.viceImage || '/csi-logo.png'} alt={c.viceName || 'Vice'} />
            )}
          </div>
          <div>
            <Badge>{c.code}</Badge>
            <strong>{c.name}</strong>
            {!!election.hasVice && <small>Vice: {c.viceName || 'Não informado'}</small>}
            {!c.active && <small>Inativo</small>}
          </div>
          {edit && (
            <button className="icon-button" aria-label={'Editar ' + c.name} onClick={() => edit(c)}>
              <Pencil size={18} />
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
/** Painel V2: configuração por eleição, turmas, urnas e acessos da equipe. */
export default function App() {
  const [data, setData] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [publishedTab, setPublishedTab] = useState('voting');
  const [view, setView] = useState('elections'),
    [selected, setSelected] = useState(''),
    [creating, setCreating] = useState(false),
    [step, setStep] = useState(0),
    [modal, setModal] = useState<any>(null),
    [query, setQuery] = useState('');
  const [models, setModels] = useState<Model[]>(['standard']),
    [audience, setAudience] = useState('classes'),
    [classes, setClasses] = useState<string[]>([]),
    [electors, setElectors] = useState<Student[] | null>(null),
    [printRows, setPrintRows] = useState<Student[]>([]);
  const [end, setEnd] = useState(localInput(new Date(Date.now() + 3 * 3600000))),
    [start, setStart] = useState(localInput(new Date())),
    [scheduled, setScheduled] = useState(false),
    [previewModel, setPreviewModel] = useState<Model | null>(null),
    [testVotes, setTestVotes] = useState(0),
    [exampleBusy, setExampleBusy] = useState(false);
  const canEdit = allowed(data?.me, 'manageElections'),
    canVoters = allowed(data?.me, 'manageVoters'),
    canPublish = allowed(data?.me, 'publishElections'),
    canResults = allowed(data?.me, 'viewResults'),
    isAdmin = data?.me.role === 'admin';
  const busyRef = useRef(false);
  const e = data?.elections.find((e) => e.id === selected),
    draft = e && !e.published && !e.closed;
  async function load() {
    const r = await fetch('/api/v2/app', {
      cache: 'no-store',
      headers: { 'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '' },
    });
    if (r.status === 401) {
      sessionStorage.removeItem('urna_panel_key');
      setData(null);
      setPrintRows([]);
      setElectors(null);
      return;
    }
    setData(await responseData(r));
  }
  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      if (!busyRef.current) load().catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [!!data]);
  // Centraliza escritas e recarrega o painel depois da resposta do servidor.
  async function action(name: string, payload: any = {}) {
    if (busyRef.current) throw Error('Aguarde a operação atual.');
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await responseData(
        await fetch('/api/v2/app', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
          },
          body: JSON.stringify({ action: name, ...payload }),
        }),
      );
      if (!['electors', 'csvPreview', 'image'].includes(name)) await load();
      return result;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function clean() {
    setError('');
    setNotice('');
  }
  function go(next: string) {
    setPreviewModel(null);
    setView(next === 'home' ? 'elections' : next);
    setSelected('');
    setCreating(false);
    setModal(null);
    setElectors(null);
    setPrintRows([]);
    clean();
  }
  function create() {
    go('elections');
    setCreating(true);
    setStep(0);
  }
  function choose(item: DetailedElection) {
    setPublishedTab('voting');
    setView('elections');
    setSelected(item.id);
    setCreating(false);
    setStep(
      item.candidates.some((c) => c.active)
        ? item.requireMatricula && !item.electorCount
          ? 2
          : 3
        : 1,
    );
    setAudience(item.electorCount ? 'keep' : 'classes');
    setClasses(item.electorClasses || []);
    setElectors(null);
    const current = [
      ...new Set(
        data?.terminals
          .filter((t) => item.terminalIds?.includes(t.id) || t.electionId === item.id)
          .map((t) => t.model),
      ),
    ] as Model[];
    setModels(current.length ? current : ['standard']);
    setEnd(localInput(new Date(Date.now() + 3 * 3600000)));
    setScheduled(false);
    clean();
  }
  function next(n: number) {
    setStep(n);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function attempt(fn: () => Promise<void>) {
    setError('');
    try {
      await fn();
    } catch (err: any) {
      setError(err.message);
    }
  }
  async function upload(file: File) {
    if (file.size > 2097152 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw Error('Use PNG, JPG ou WebP de até 2 MB.');
    const imageData = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error('Não foi possível ler a imagem.'));
      r.readAsDataURL(file);
    });
    return (await action('image', { imageData })).image;
  }
  async function saveElection(value: any) {
    const r = await action('election', { value });
    setSelected(r.id);
    setCreating(false);
    setAudience(value.id && e?.electorCount ? 'keep' : 'classes');
    setClasses(e?.electorClasses || []);
    next(1);
  }
  async function saveCandidate(value: any) {
    await action('candidate', { value });
    setModal(null);
  }
  async function votersNext() {
    if (!e) return;
    await attempt(async () => {
      if (e.requireMatricula && canVoters) {
        if (audience === 'classes' && !classes.length)
          throw Error('Selecione pelo menos uma turma.');
        if (audience !== 'keep') await action('enroll', { electionId: e.id, classes });
        else if (!e.electorCount) throw Error('Selecione os eleitores.');
      }
      next(3);
    });
  }
  async function publish() {
    if (!e) return;
    await attempt(async () => {
      if (checks(e, models).length) throw Error(checks(e, models)[0].text);
      const endsAt = new Date(end);
      if (!Number.isFinite(+endsAt) || +endsAt <= Date.now())
        throw Error('Escolha um encerramento depois de agora.');
      const startsAt = scheduled ? new Date(start) : new Date(Date.now() - 1000);
      if (!Number.isFinite(+startsAt) || +endsAt <= +startsAt)
        throw Error('O encerramento precisa ser depois do início.');
      await action('publish', {
        electionId: e.id,
        models,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setPublishedTab('voting');
      setNotice(scheduled ? 'Eleição agendada.' : 'Eleição publicada. Abra a urna abaixo.');
    });
  }
  async function showElectors() {
    if (e)
      await attempt(async () => {
        const r = await action('electors', { electionId: e.id });
        setElectors(r.rows);
      });
  }
  async function titles() {
    if (e)
      await attempt(async () => {
        const r = await action('electors', { electionId: e.id });
        setPrintRows(r.rows);
        setTimeout(() => window.print(), 100);
      });
  }
  async function example() {
    if (exampleBusy) return;
    setExampleBusy(true);
    await attempt(async () => {
      const r = await action('election', {
        value: {
          name: 'Exemplo · 6 chapas de prefeito e vice',
          digits: 5,
          hasVice: 1,
          requireMatricula: 1,
        },
      });
      for (const c of exampleCandidates)
        await action('candidate', { value: { ...c, id: undefined, electionId: r.id } });
      setSelected(r.id);
      setAudience('classes');
      setClasses([]);
      setModels(['standard']);
      setStep(2);
    });
    setExampleBusy(false);
  }
  const linked =
    data?.terminals.filter((t) => e?.terminalIds?.includes(t.id) || t.electionId === e?.id) || [];
  const issue = e ? checks(e, models) : [];
  function preview(model: Model) {
    setTestVotes(0);
    setPreviewModel(model);
  }
  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copiado.');
      return true;
    } catch {
      setModal({ kind: 'copy', url });
      return false;
    }
  }
  function urnLinks(terms: Terminal[], eid: string | null = e?.id || null) {
    return (
      <div className="simple-urn-links">
        {terms.map((t) => (
          <div key={t.id}>
            <div>
              <strong>{modelName(t.model)}</strong>
              {!eid && <small>Escolha uma das eleições na urna</small>}
            </div>
            <a
              className="button primary"
              href={'/v2/urna/' + t.id + (eid ? '?election=' + eid : '')}
              target="_blank"
              rel="noopener"
            >
              Abrir urna <ArrowRight size={17} />
            </a>
            <button
              className="text-button clean-copy-link"
              aria-label={'Copiar link ' + modelName(t.model)}
              onClick={() =>
                copyLink(location.origin + '/v2/urna/' + t.id + (eid ? '?election=' + eid : ''))
              }
            >
              <Copy size={15} />
              Copiar link
            </button>
          </div>
        ))}
      </div>
    );
  }
  if (previewModel)
    return (
      <Ballot
        key={previewModel + (e?.id || 'example')}
        terminal={{ id: 'previa', name: 'Prévia', location: 'Teste', model: previewModel }}
        election={e ? previewElection(e, e.candidates) : previewElection()}
        testing
        testVotes={testVotes}
        busy={false}
        onExit={() => setPreviewModel(null)}
        cast={async () => {
          setTestVotes((n) => n + 1);
        }}
      />
    );
  return (
    <>
      <Shell
        view={view}
        signedIn={!!data}
        admin={isAdmin}
        name={data?.me.name}
        go={go}
        logout={() =>
          attempt(async () => {
            await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'logout' }),
            });
            sessionStorage.removeItem('urna_panel_key');
            setData(null);
            go('elections');
          })
        }
      >
        <main className="content simple-content">
          {loading ? (
            <p>Carregando…</p>
          ) : !data ? (
            <Login onReady={load} />
          ) : (
            <>
              {view === 'elections' && !e && !creating && (
                <>
                  {error && (
                    <div className="error-banner" role="alert">
                      {error}
                    </div>
                  )}
                  <ElectionList
                    elections={data.elections}
                    canCreate={canEdit}
                    create={create}
                    choose={choose}
                  />
                  {canEdit && (
                    <details className="clean-example">
                      <summary>Testar com uma eleição de exemplo</summary>
                      <p>Cria seis chapas fictícias em uma eleição separada.</p>
                      <button
                        className="button secondary"
                        disabled={busy || exampleBusy}
                        onClick={example}
                      >
                        {exampleBusy ? 'Preparando…' : 'Criar exemplo'}
                      </button>
                    </details>
                  )}
                </>
              )}

              {view === 'elections' && (creating || draft) && (
                <>
                  <button className="text-button simple-back" onClick={() => go('elections')}>
                    <ArrowLeft size={17} />
                    Eleições
                  </button>
                  <div className="simple-wizard-heading">
                    <h1>{creating ? 'Nova eleição' : e?.name}</h1>
                    <Badge tone="blue">Em preparação</Badge>
                  </div>
                  <nav className="simple-steps" aria-label="Etapas da eleição">
                    {steps.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        disabled={busy || (creating && i !== 0)}
                        className={step === i ? 'active' : ''}
                        aria-current={step === i ? 'step' : undefined}
                        onClick={() => next(i)}
                      >
                        <span>{i + 1}</span>
                        {label}
                      </button>
                    ))}
                  </nav>
                  <section className="simple-panel">
                    <div className="simple-step-heading">
                      <h2>
                        {step === 0
                          ? 'Sobre a eleição'
                          : step === 1
                            ? e?.hasVice
                              ? 'Cadastre prefeito e vice'
                              : 'Cadastre os candidatos'
                            : step === 2
                              ? 'Quem pode votar?'
                              : 'Escolha a urna e publique'}
                      </h2>
                    </div>
                    {error && (
                      <div className="error-banner" role="alert">
                        {error}
                      </div>
                    )}
                    {step === 0 &&
                      (canEdit ? (
                        <ElectionForm
                          key={e?.id || 'new'}
                          value={e}
                          busy={busy}
                          save={saveElection}
                        />
                      ) : (
                        <>
                          <p className="simple-hint">
                            O administrador não liberou a edição da configuração para esta conta.
                          </p>
                          <button className="button secondary" onClick={() => next(1)}>
                            Continuar
                            <ArrowRight size={17} />
                          </button>
                        </>
                      ))}
                    {step === 1 && e && (
                      <>
                        <div className="simple-inline">
                          <p>
                            {e.candidates.filter((c) => c.active).length}{' '}
                            {e.hasVice ? 'chapas cadastradas' : 'candidatos cadastrados'}
                          </p>
                          {canEdit && (
                            <button
                              className="button secondary"
                              onClick={() => setModal({ kind: 'candidate' })}
                            >
                              <Plus size={17} />
                              {e.hasVice ? 'Adicionar chapa' : 'Adicionar candidato'}
                            </button>
                          )}
                        </div>
                        <CandidateList
                          election={e}
                          edit={
                            canEdit ? (c) => setModal({ kind: 'candidate', value: c }) : undefined
                          }
                        />
                        {!e.candidates.length && (
                          <p className="simple-empty">
                            Adicione o nome, o número e a foto de cada candidato.
                          </p>
                        )}
                        <div className="simple-footer">
                          <button className="button secondary" onClick={() => next(0)}>
                            <ArrowLeft size={17} />
                            Voltar
                          </button>
                          <button
                            className="button primary"
                            disabled={busy || !e.candidates.some((c) => c.active)}
                            onClick={() => next(2)}
                          >
                            Continuar
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </>
                    )}
                    {step === 2 && e && (
                      <>
                        {!e.requireMatricula ? (
                          <div className="info-banner">
                            Esta eleição permite votos sem matrícula.
                          </div>
                        ) : (
                          <>
                            <p className="simple-hint">
                              Selecione as turmas que participarão. A lista geral é mantida pelo
                              administrador.
                            </p>
                            {canVoters ? (
                              <>
                                <ClassPicker
                                  options={data.classes}
                                  value={classes}
                                  disabled={busy}
                                  onChange={(value) => {
                                    setClasses(value);
                                    setAudience('classes');
                                  }}
                                />
                                {!!e.electorCount && (
                                  <div className="roster-refresh">
                                    <p className="simple-hint">
                                      Lista salva: {e.electorCount} eleitores. Adicionou alunos às
                                      turmas?
                                    </p>
                                    <button
                                      className="text-button"
                                      disabled={busy || !classes.length}
                                      onClick={() =>
                                        attempt(async () => {
                                          await action('enroll', { electionId: e.id, classes });
                                          setAudience('keep');
                                          setNotice('Alunos das turmas atualizados nesta eleição.');
                                        })
                                      }
                                    >
                                      Atualizar alunos das turmas
                                    </button>
                                  </div>
                                )}
                                {isAdmin && (
                                  <button className="text-button" onClick={() => go('students')}>
                                    <Upload size={15} />
                                    Importar ou atualizar lista da escola
                                  </button>
                                )}
                              </>
                            ) : (
                              <p className="info-banner">
                                {e.electorCount || 0} eleitores selecionados. O administrador não
                                liberou a alteração de turmas para esta conta.
                              </p>
                            )}
                          </>
                        )}
                        <div className="simple-footer">
                          <button className="button secondary" onClick={() => next(1)}>
                            <ArrowLeft size={17} />
                            Voltar
                          </button>
                          <button
                            className="button primary"
                            disabled={
                              busy ||
                              (!!e.requireMatricula &&
                                canVoters &&
                                audience !== 'keep' &&
                                !classes.length)
                            }
                            onClick={votersNext}
                          >
                            {busy ? 'Salvando…' : 'Continuar'}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </>
                    )}

                    {step === 3 && e && (
                      <>
                        <p className="simple-hint">
                          Marque um ou dois modelos. A mesma urna pode oferecer várias eleições.
                        </p>
                        <div className="simple-models">
                          {(['standard', 'images'] as Model[]).map((model) => (
                            <button
                              key={model}
                              type="button"
                              role="checkbox"
                              aria-checked={models.includes(model)}
                              className={models.includes(model) ? 'selected' : ''}
                              onClick={() =>
                                setModels((old) =>
                                  old.includes(model)
                                    ? old.filter((m) => m !== model)
                                    : [...old, model],
                                )
                              }
                            >
                              <div>
                                <strong>
                                  {model === 'images' ? (
                                    <Images size={18} />
                                  ) : (
                                    <Keyboard size={18} />
                                  )}{' '}
                                  {modelName(model)}
                                </strong>
                                <span>
                                  {models.includes(model) ? (
                                    <CheckCircle2 size={21} />
                                  ) : (
                                    <span className="simple-radio-empty" />
                                  )}
                                </span>
                              </div>
                              <div className="terminal-preview">
                                <UrnaPreview model={model} />
                              </div>
                              <p>
                                {model === 'images'
                                  ? 'Toque na foto do candidato.'
                                  : 'Digite o número do candidato.'}
                              </p>
                            </button>
                          ))}
                        </div>
                        <div className="simple-review">
                          <strong>
                            {e.candidates.filter((c) => c.active).length}{' '}
                            {e.hasVice ? 'chapas de prefeito e vice' : 'candidatos'}
                          </strong>
                          <span>
                            {e.requireMatricula
                              ? (e.electorCount || 0) + ' eleitores · um voto por matrícula'
                              : 'Sem controle por matrícula'}
                          </span>
                        </div>
                        {issue.length > 0 && (
                          <div className="simple-missing" role="status">
                            <strong>Falta concluir:</strong>
                            {issue.map((x) => (
                              <div key={x.text}>
                                <span>{x.text}</span>
                                {x.step !== 3 && (
                                  <button className="text-button" onClick={() => next(x.step)}>
                                    Corrigir
                                    <ArrowRight size={15} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!canPublish && (
                          <p className="info-banner">
                            A eleição pode ser preparada por você. A publicação precisa ser feita
                            por um administrador ou alguém com essa permissão.
                          </p>
                        )}
                        <Field label="Encerramento da votação">
                          <input
                            type="datetime-local"
                            required
                            value={end}
                            onChange={(ev) => setEnd(ev.target.value)}
                          />
                        </Field>
                        <details className="simple-details">
                          <summary>Agendar início</summary>
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={scheduled}
                              onChange={(ev) => setScheduled(ev.target.checked)}
                            />
                            Começar em outro horário
                          </label>
                          {scheduled && (
                            <Field label="Início da votação">
                              <input
                                type="datetime-local"
                                value={start}
                                onChange={(ev) => setStart(ev.target.value)}
                              />
                            </Field>
                          )}
                        </details>
                        <div className="simple-footer">
                          <button className="button secondary" onClick={() => next(2)}>
                            <ArrowLeft size={17} />
                            Voltar
                          </button>
                          <button
                            className="button primary"
                            disabled={busy || issue.length > 0 || !canPublish}
                            onClick={publish}
                          >
                            {busy
                              ? 'Publicando…'
                              : scheduled
                                ? 'Agendar eleição'
                                : 'Publicar agora'}
                            <Check size={17} />
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                  {e && e.candidates.some((c) => c.active) && (
                    <details className="simple-details">
                      <summary>Testar a tela sem registrar votos</summary>
                      <div className="simple-inline">
                        <button className="button secondary" onClick={() => preview('standard')}>
                          <Play size={16} />
                          Com teclado
                        </button>
                        <button className="button secondary" onClick={() => preview('images')}>
                          <Play size={16} />
                          Por imagens
                        </button>
                      </div>
                    </details>
                  )}
                </>
              )}
              {view === 'elections' && e && e.published > 0 && (
                <>
                  <button className="text-button simple-back" onClick={() => go('elections')}>
                    <ArrowLeft size={17} />
                    Eleições
                  </button>
                  <div className="page-heading">
                    <div>
                      <Badge tone={status(e) === 'active' ? 'green' : 'neutral'}>
                        {states[status(e)]}
                      </Badge>
                      <h1>{e.name}</h1>
                      <p>
                        {status(e) === 'active'
                          ? 'Abra a urna no aparelho que a turma vai usar.'
                          : status(e) === 'scheduled'
                            ? 'A votação começa em ' + formatted(e.startsAt)
                            : 'A votação foi encerrada.'}
                      </p>
                    </div>
                    {(canEdit || canPublish) && (
                      <details className="clean-actions-menu">
                        <summary>Ações</summary>
                        <div className="simple-inline">
                          {canEdit && (
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                attempt(async () => {
                                  const r = await action('duplicate', { electionId: e.id });
                                  setSelected(r.id);
                                  setStep(0);
                                  setAudience('classes');
                                  setClasses([]);
                                  setModels(['standard']);
                                  clean();
                                })
                              }
                            >
                              <Copy size={16} />
                              Duplicar eleição
                            </button>
                          )}
                          {canPublish && status(e) !== 'closed' && (
                            <button
                              className="button secondary clean-danger"
                              onClick={() => setModal({ kind: 'close' })}
                            >
                              Encerrar eleição
                            </button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                  {error && (
                    <div className="error-banner" role="alert">
                      {error}
                    </div>
                  )}
                  <nav className="clean-detail-tabs" aria-label="Gerenciar eleição">
                    {[
                      { id: 'voting', label: 'Votação' },
                      { id: 'candidates', label: 'Candidatos' },
                      ...(canVoters ? [{ id: 'electors', label: 'Eleitores' }] : []),
                      ...(canResults ? [{ id: 'results', label: 'Resultados' }] : []),
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        aria-current={publishedTab === tab.id ? 'page' : undefined}
                        className={publishedTab === tab.id ? 'active' : ''}
                        onClick={() => {
                          setPublishedTab(tab.id);
                          if (tab.id === 'electors') void showElectors();
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                  {publishedTab === 'voting' && (
                    <section className="clean-detail-panel">
                      <div className="clean-detail-heading">
                        <h2>
                          {status(e) === 'closed' ? 'Votação encerrada' : 'Abrir esta eleição'}
                        </h2>
                        <p>
                          {e.requireMatricula
                            ? 'Um voto por matrícula nesta eleição.'
                            : 'Eleição sem identificação por matrícula.'}
                        </p>
                      </div>
                      {status(e) !== 'closed' && urnLinks(linked)}
                      <div className="clean-election-facts">
                        <div>
                          <span>Participações</span>
                          <strong>
                            {e.votedCount || 0}
                            {!!e.requireMatricula && <> / {e.electorCount || 0}</>}
                          </strong>
                        </div>
                        <div>
                          <span>Encerramento</span>
                          <strong>{formatted(e.endsAt)}</strong>
                        </div>
                      </div>
                    </section>
                  )}
                  {publishedTab === 'candidates' && (
                    <section className="clean-detail-panel">
                      <div className="clean-detail-heading">
                        <h2>{e.hasVice ? 'Prefeito e vice' : 'Candidatos'}</h2>
                      </div>
                      <CandidateList election={e} />
                    </section>
                  )}
                  {canVoters && publishedTab === 'electors' && (
                    <section className="clean-detail-panel">
                      <div className="clean-detail-heading">
                        <h2>Eleitores</h2>
                        <p>{e.electorCount || 0} alunos habilitados nesta eleição.</p>
                      </div>
                      <div className="simple-inline">
                        <button className="button secondary" disabled={busy} onClick={showElectors}>
                          Atualizar lista
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy || !e.electorCount}
                          onClick={titles}
                        >
                          <Printer size={16} />
                          Imprimir títulos
                        </button>
                      </div>
                      {electors && (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Nome</th>
                                <th>Turma</th>
                                <th>Matrícula</th>
                                <th>Participação</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {electors.slice(0, 300).map((s) => (
                                <tr key={s.matricula}>
                                  <td>{s.name}</td>
                                  <td>{s.className}</td>
                                  <td>{s.matricula}</td>
                                  <td>
                                    {s.voted
                                      ? 'Já votou'
                                      : s.released
                                        ? 'Urna liberada'
                                        : 'Aguardando'}
                                  </td>
                                  <td>
                                    {!!s.released && !s.voted && (
                                      <button
                                        className="text-button"
                                        disabled={busy}
                                        onClick={() =>
                                          attempt(async () => {
                                            await action('unlock', {
                                              electionId: e.id,
                                              matricula: s.matricula,
                                            });
                                            setElectors(null);
                                            setNotice('Liberação cancelada.');
                                          })
                                        }
                                      >
                                        Cancelar liberação
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  )}
                  {canResults && publishedTab === 'results' && (
                    <section className="clean-detail-panel">
                      <div className="clean-detail-heading">
                        <h2>Resultados</h2>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() =>
                          csvDownload('apuracao-eleicao.csv', [
                            ['Eleição', 'Número', 'Candidato', 'Vice', 'Votos'],
                            ...e.candidateSnapshot.map((c) => [
                              e.name,
                              c.code,
                              c.name,
                              c.viceName || '',
                              e.results
                                .filter((r) => r.candidateId === c.id)
                                .reduce((n, r) => n + r.total, 0),
                            ]),
                          ])
                        }
                      >
                        <Download size={16} />
                        Baixar CSV
                      </button>
                      {e.candidateSnapshot.map((c) => (
                        <div className="v2-result" key={c.id}>
                          <span>
                            <strong>
                              {c.code} · {c.name}
                            </strong>
                            {c.viceName && <small>Vice: {c.viceName}</small>}
                          </span>
                          <b>
                            {e.results
                              .filter((r) => r.candidateId === c.id)
                              .reduce((n, r) => n + r.total, 0)}{' '}
                            votos
                          </b>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}

              {view === 'students' && (
                <ClassesPanel
                  classes={data.classes}
                  students={data.students}
                  admin={isAdmin}
                  busy={busy}
                  action={action}
                  notify={setNotice}
                  importer={
                    <CsvImport
                      busy={busy}
                      action={action}
                      onDone={() =>
                        setNotice(
                          'Lista da escola atualizada. As turmas estão prontas para selecionar nas eleições.',
                        )
                      }
                    />
                  }
                />
              )}
              {view === 'team' && isAdmin && (
                <TeamPanel
                  accounts={data.accounts}
                  me={data.me}
                  classes={data.classes}
                  elections={data.elections}
                  busy={busy}
                  save={async (value) => {
                    await action('account', { value });
                    setNotice('Acesso salvo.');
                  }}
                />
              )}

              {view === 'terminals' && (
                <UrnasPanel
                  terminals={data.terminals}
                  elections={data.elections}
                  choose={choose}
                  manage={() => go('elections')}
                  copy={copyLink}
                  preview={preview}
                />
              )}

              {view === 'account' && (
                <AccountSettings username={data.me.username} name={data.me.name} />
              )}
            </>
          )}
          <footer className="content-footer">
            <span>Santa Inês · Urna escolar</span>
            <span>Desenvolvido pela T.I.</span>
          </footer>
        </main>
        {modal?.kind === 'candidate' && e && (
          <Modal
            title={e.hasVice ? 'Prefeito e vice' : 'Candidato'}
            wide
            onClose={() => !busy && setModal(null)}
          >
            <CandidateForm
              election={e}
              value={modal.value}
              busy={busy}
              save={saveCandidate}
              upload={upload}
            />
          </Modal>
        )}
        {modal?.kind === 'close' && e && (
          <Modal title="Encerrar eleição" onClose={() => !busy && setModal(null)}>
            <div className="editor-form">
              <p>
                Encerrar <strong>{e.name}</strong>? Esta eleição deixará de receber votos. As outras
                continuam disponíveis na mesma urna.
              </p>
              <div className="form-footer">
                <button className="button secondary" onClick={() => setModal(null)}>
                  Voltar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    attempt(async () => {
                      await action('close', { electionId: e.id });
                      setModal(null);
                      setNotice('Eleição encerrada.');
                    })
                  }
                >
                  Confirmar encerramento
                </button>
              </div>
            </div>
          </Modal>
        )}
        {modal?.kind === 'copy' && (
          <Modal title="Link da urna" onClose={() => setModal(null)}>
            <div className="editor-form">
              <Field label="Copie este endereço">
                <input readOnly value={modal.url} onFocus={(ev) => ev.currentTarget.select()} />
              </Field>
              <p className="simple-hint">Abra este link no aparelho que será usado para votar.</p>
            </div>
          </Modal>
        )}
        {notice && (
          <div className="clean-toast" role="status">
            <Check size={17} />
            {notice}
          </div>
        )}
      </Shell>
      <div className="v2-title-sheet">
        {printRows.map((s) => (
          <article className="v2-voter-title" key={s.matricula}>
            <header>
              <img src="/csi-logo.png" alt="" />
              <div>
                <strong>TÍTULO DE ELEITOR ESCOLAR</strong>
                <p>Colégio Santa Inês · uso pedagógico</p>
              </div>
            </header>
            <h2>{s.name}</h2>
            <p>
              Turma: <strong>{s.className}</strong>
            </p>
            <p>
              Matrícula / título: <strong>{s.matricula}</strong>
            </p>
            <p>Eleição: {e?.name}</p>
          </article>
        ))}
      </div>
    </>
  );
}

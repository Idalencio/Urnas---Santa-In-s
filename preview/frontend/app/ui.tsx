'use client';
import { useEffect, useRef, useState } from 'react';
import {
  House,
  Vote,
  UserRound,
  ShieldCheck,
  Monitor,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  HelpCircle,
  Download,
  Pencil,
  Check,
  X,
  RefreshCw,
  LockKeyhole,
  LogOut,
  Play,
  Images,
  Keyboard,
  Menu,
  ChevronRight,
  CalendarDays,
  BarChart3,
  Clock,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { status, totals, candidateNumber, type Data, type Election, type Terminal } from './domain';
import { Badge, Empty, Modal, ModelPreview, formatted, csvDownload, Field } from './components';
import { Editor, ElectionEditor } from './forms';
import { responseData } from './http';
import { Login, AccountSettings } from './access';

type View =
  'home' | 'setup' | 'candidates' | 'elections' | 'terminals' | 'results' | 'administrators';
type Dialog = { kind: 'candidate' | 'terminal' | 'help' | 'close'; value?: any };
const blankData: Data = {
  candidates: [],
  terminals: [],
  elections: [],
  administrators: [],
  me: null,
};
const navigation = [
  { id: 'home', label: 'Início', icon: House },
  { id: 'setup', label: 'Preparar votação', icon: Pencil },
  { id: 'candidates', label: 'Candidatos', icon: UserRound },
  { id: 'elections', label: 'Votações', icon: Vote },
  { id: 'terminals', label: 'Abrir urna', icon: Monitor },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
  { id: 'administrators', label: 'Conta', icon: ShieldCheck },
] as const;
const headings: Record<View, [string, string]> = {
  home: [
    'Vamos preparar a escolha da turma?',
    'Um caminho simples para configurar, votar e acompanhar.',
  ],
  setup: [
    'Preparar votação',
    'Siga os passos abaixo. Você pode cadastrar os candidatos aqui mesmo.',
  ],
  candidates: [
    'Candidatos por urna',
    'Escolha a urna e cadastre os personagens. Os números podem se repetir em outra urna.',
  ],
  elections: ['Votações', 'Escolha os candidatos e a urna. Depois, abra para a turma.'],
  terminals: ['Urnas', 'Os dois modelos já estão prontos. Escolha o melhor para cada turma.'],
  results: ['Resultados', 'Veja os totais de cada votação e baixe a apuração.'],
  administrators: ['Conta administrativa', 'Acesso local para organizar as votações da escola.'],
};
const stateNames = { active: 'Em votação', scheduled: 'Agendada', closed: 'Encerrada' };
function ElectionStatus({ election }: { election: Election }) {
  const s = status(election);
  return (
    <Badge tone={s === 'active' ? 'green' : s === 'scheduled' ? 'blue' : 'neutral'}>
      {stateNames[s]}
    </Badge>
  );
}

export default function App({ designVariant = true }: { designVariant?: boolean }) {
  const [data, setData] = useState<Data>(blankData);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('home'),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState('');
  const [modal, setModal] = useState<Dialog | null>(null),
    [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [setupTerminalId, setSetupTerminalId] = useState<string | undefined>(),
    [prepared, setPrepared] = useState<{
      terminalId: string;
      name: string;
      startsAt: string;
      endsAt: string;
      scheduled: boolean;
    } | null>(null);
  const [menu, setMenu] = useState(false);
  const [candidateTerminalId, setCandidateTerminalId] = useState('urna-padrao');
  const urnCandidates = data.candidates.filter((c) =>
    candidateTerminalId === 'pending' ? !c.terminalId : c.terminalId === candidateTerminalId,
  );
  const candidateMatches = urnCandidates.filter((c) =>
    (c.name + ' ' + c.code + ' ' + candidateNumber(c.code))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const unassignedCandidates = data.candidates.filter((c) => !c.terminalId);
  const candidateTerminal = data.terminals.find((t) => t.id === candidateTerminalId);
  const busyRef = useRef(false),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routePrefix = '';
  const isAdmin = data.me?.role === 'admin';
  const activeCandidates = data.candidates.filter((c) => c.active);
  const activeElections = data.elections.filter((e) => status(e) === 'active');
  const selectedElection = data.elections.find((e) => e.id === selected) || data.elections[0];
  const resultTotals = totals(selectedElection);
  const voteTotal = data.elections.reduce((sum, e) => sum + totals(e).total, 0);
  function notify(text: string, error = false) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, error });
    noticeTimer.current = setTimeout(() => setNotice(null), 6500);
  }
  function go(next: View) {
    setView(next);
    setSearch('');
    setMenu(false);
  }
  function open(kind: Dialog['kind'], value?: any, terminalId?: string) {
    if (kind === 'candidate' && !value) {
      const urnId =
        terminalId ||
        (view === 'candidates' && candidateTerminalId !== 'pending' ? candidateTerminalId : '');
      if (urnId && data.candidates.filter((c) => c.terminalId === urnId).length >= 10) {
        notify(
          'Os números de 0 a 9 já estão em uso nesta urna. Edite ou ative um dos candidatos existentes.',
        );
        return;
      }
      value = { terminalId: urnId };
    }
    setModal({ kind, value });
  }
  function manageCandidates(terminalId: string) {
    setCandidateTerminalId(terminalId);
    go('candidates');
  }
  async function load() {
    const response = await fetch('/api/app', {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
      },
      credentials: 'same-origin',
    });
    if (response.status === 401 || response.status === 403) setData(blankData);
    const result = await responseData(response);
    setData(result);
    setLoadError('');
  }
  useEffect(() => {
    load()
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busyRef.current) void load().catch((e) => setLoadError(e.message));
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  async function action(name: string, payload: any) {
    if (busyRef.current) throw Error('Aguarde a operação atual.');
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/app', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
        },
        body: JSON.stringify({ action: name, ...payload }),
      });
      const result = await responseData(response);
      if (name !== 'vote')
        await load().catch(() =>
          setLoadError(
            'A alteração foi salva. Atualize os dados para exibir a versão mais recente.',
          ),
        );
      return result;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save(kind: string, value: any) {
    await action(kind, { value });
    setModal(null);
    if (kind === 'candidate' && view === 'candidates') setCandidateTerminalId(value.terminalId);
    notify('Cadastro salvo.');
  }
  async function logout() {
    try {
      await responseData(
        await fetch('/api/auth', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'logout' }),
        }),
      );
      sessionStorage.removeItem('urna_panel_key');
      setData(blankData);
      go('home');
    } catch (e: any) {
      notify(e.message, true);
    }
  }
  async function upload(file: File) {
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    )
      throw Error('Escolha uma imagem PNG, JPG ou WebP de até 2 MB.');
    const imageData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(Error('Não foi possível ler a imagem. Escolha o arquivo novamente.'));
      reader.readAsDataURL(file);
    });
    const response = await fetch('/api/app', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
      },
      body: JSON.stringify({ action: 'image', imageData }),
    });
    return (await responseData(response)).image as string;
  }
  function newElection(terminal?: string) {
    setSetupTerminalId(terminal);
    setPrepared(null);
    go('setup');
  }
  async function prepareElection(value: any) {
    await action('election', { value });
    setPrepared({ ...value, scheduled: Date.parse(value.startsAt) > Date.now() });
    notify('Votação preparada.');
  }
  function showResults(e: Election) {
    setSelected(e.id);
    go('results');
  }
  function exportResults(e: Election) {
    const t = totals(e);
    csvDownload('resultados-votacao.csv', [
      ['Votação', 'Candidato', 'Número', 'Votos'],
      ...e.candidateSnapshot.map((c) => [
        e.name,
        c.name,
        c.code,
        e.results
          .filter((r) => r.kind === 'valid' && r.candidateId === c.id)
          .reduce((sum, r) => sum + r.total, 0),
      ]),
      [e.name, 'TOTAL', '', t.total],
    ]);
    notify('Resultados baixados.');
  }
  function terminalCards(terminals: Terminal[] = data.terminals) {
    return (
      <div className="terminal-grid">
        {terminals.map((t) => {
          const current = activeElections.find((e) => e.terminalId === t.id);
          const upcoming = data.elections.find(
            (e) => e.terminalId === t.id && status(e) === 'scheduled',
          );
          return (
            <article className="terminal-card" key={t.id}>
              <div className="terminal-card-top">
                <Badge tone={t.model === 'images' ? 'orange' : 'blue'}>
                  {t.model === 'images' ? <Images size={15} /> : <Keyboard size={15} />}{' '}
                  {t.model === 'images' ? 'Por imagens' : 'Com teclado'}
                </Badge>
                {isAdmin && (
                  <button
                    className="icon-button"
                    aria-label={'Editar ' + t.name}
                    disabled={!!current}
                    title={current ? 'Encerre a votação para editar a urna' : 'Editar urna'}
                    onClick={() => open('terminal', t)}
                  >
                    <Pencil size={18} />
                  </button>
                )}
              </div>
              <div className="terminal-preview">
                <ModelPreview model={t.model} />
              </div>
              <h3>{t.name}</h3>
              <p>
                {t.model === 'images'
                  ? 'Para os pequenos: toque no desenho.'
                  : 'Para os maiores: digite o último número.'}
              </p>
              {t.location && <small className="terminal-location">{t.location}</small>}
              <div className="terminal-election">
                {current ? (
                  <>
                    <ElectionStatus election={current} />
                    <strong>{current.name}</strong>
                  </>
                ) : upcoming ? (
                  <>
                    <ElectionStatus election={upcoming} />
                    <strong>{upcoming.name}</strong>
                    <small>Abre em {formatted(upcoming.startsAt)}</small>
                  </>
                ) : (
                  <>
                    <Badge>Pronta para configurar</Badge>
                    <span>Prepare uma votação para usar esta urna.</span>
                  </>
                )}
              </div>
              <div className="card-actions">
                {!current && !upcoming && isAdmin ? (
                  <button className="button secondary" onClick={() => newElection(t.id)}>
                    Preparar nesta urna <ArrowUpRight size={17} />
                  </button>
                ) : (
                  <a
                    className={'button ' + (current ? 'primary' : 'secondary')}
                    href={routePrefix + '/urna/' + encodeURIComponent(t.id)}
                    target="_blank"
                    rel="noopener"
                    title="Abre em uma nova aba"
                  >
                    {current ? 'Abrir votação' : upcoming ? 'Ver urna agendada' : 'Ver urna'}{' '}
                    <ArrowUpRight size={17} />
                  </a>
                )}
                <a
                  className="button secondary"
                  href={
                    routePrefix + (t.model === 'images' ? '/testar/infantil' : '/testar/padrao')
                  }
                  target="_blank"
                  rel="noopener"
                >
                  <Play size={16} /> Testar
                </a>
                <button
                  className="text-button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(
                        location.origin + routePrefix + '/urna/' + encodeURIComponent(t.id),
                      )
                      .then(() =>
                        notify('Link público da urna copiado. Pode abrir em qualquer navegador.'),
                      )
                      .catch(() => notify('Abra a urna e copie o endereço no navegador.', true))
                  }
                >
                  <Copy size={16} /> Copiar link público
                </button>
                {isAdmin && (
                  <button className="button secondary" onClick={() => manageCandidates(t.id)}>
                    <UserRound size={17} /> Candidatos desta urna
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );
  }
  const visibleUrnaElections = data.elections.filter((e) => e.archived !== 1);
  const ongoingUrnaElections = visibleUrnaElections.filter((e) => status(e) !== 'closed');
  const closedUrnaElections = visibleUrnaElections.filter((e) => status(e) === 'closed');
  function urnaElectionRows(
    items: Election[],
    title: string,
    description: string,
    empty: string,
    allowRemove = false,
  ) {
    return (
      <section className="urna-election-section">
        <div className="section-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <Badge tone={allowRemove ? 'neutral' : 'green'}>{items.length}</Badge>
        </div>
        {items.length ? (
          <div className="urna-election-list">
            {items.map((e) => {
              const term = data.terminals.find((t) => t.id === e.terminalId);
              const state = status(e);
              return (
                <article className="urna-election-row" key={e.id}>
                  <div className="urna-election-row-main">
                    <div className="urna-election-row-heading">
                      <ElectionStatus election={e} />
                      <span>{term?.model === 'images' ? 'Por imagens' : 'Com teclado'}</span>
                    </div>
                    <h3>{e.name}</h3>
                    <p>
                      <Monitor size={15} />
                      {term?.name || 'Urna'} · {e.candidateSnapshot.length} candidatos ·{' '}
                      {totals(e).total} votos
                    </p>
                    <small>
                      <CalendarDays size={14} />
                      {state === 'scheduled'
                        ? 'Abre em '
                        : state === 'active'
                          ? 'Aberta até '
                          : 'Encerrada em '}
                      {formatted(e.endsAt)}
                    </small>
                  </div>
                  <div className="urna-election-row-actions">
                    {state !== 'closed' && (
                      <a
                        className="button primary small"
                        href={routePrefix + '/urna/' + encodeURIComponent(e.terminalId)}
                        target="_blank"
                        rel="noopener"
                      >
                        Abrir urna <ArrowUpRight size={15} />
                      </a>
                    )}
                    <button className="button secondary small" onClick={() => showResults(e)}>
                      <BarChart3 size={15} /> Resultados
                    </button>
                    {allowRemove && (
                      <button
                        className="text-button muted"
                        disabled={busy}
                        onClick={() =>
                          action('archive', { id: e.id })
                            .then(() =>
                              notify(
                                'Votação removida da aba Urnas. Os resultados foram preservados.',
                              ),
                            )
                            .catch((error) => notify(error.message, true))
                        }
                      >
                        <X size={15} /> Remover da aba
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="urna-empty">
            <Monitor size={22} />
            <span>{empty}</span>
          </div>
        )}
      </section>
    );
  }
  const candidateImage = (image: string, name: string) =>
    image ? (
      <img src={image} alt={name} />
    ) : designVariant ? (
      <div className="no-picture csi-placeholder">
        <img src="/csi-logo.png" alt="Logo do Colégio Santa Inês" />
        <span>Imagem não definida</span>
      </div>
    ) : (
      <div className="no-picture">
        <UserRound size={36} />
        <span>Sem imagem</span>
      </div>
    );
  const headingActions = () => {
    if (!isAdmin) return null;
    if (view === 'candidates')
      return (
        <button className="button primary" onClick={() => open('candidate')}>
          <Plus size={19} /> Adicionar candidato
        </button>
      );
    if (view === 'elections')
      return (
        <button className="button primary" onClick={() => newElection()}>
          <Plus size={19} /> Criar votação
        </button>
      );
    if (view === 'terminals')
      return (
        <button className="button secondary" onClick={() => open('terminal')}>
          <Plus size={18} /> Adicionar urna
        </button>
      );
    return null;
  };
  return (
    <div className={'app-shell ' + (designVariant ? 'design-alt app-shell-csi' : '')}>
      <aside className={'sidebar ' + (menu ? 'mobile-open' : '')}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go('home');
          }}
        >
          <img
            src={designVariant ? '/csi-logo.png' : '/school-mark.png'}
            alt="Colégio Santa Inês"
          />
          <div>
            <strong>Santa Inês</strong>
            <span>Urna escolar</span>
          </div>
        </a>
        <span className="nav-label">VOTAÇÃO DA TURMA</span>
        <nav aria-label="Navegação principal">
          {navigation
            .filter(
              (item) =>
                ['home', 'setup', 'terminals', 'results'].includes(item.id) &&
                (isAdmin || item.id === 'home' || item.id === 'terminals'),
            )
            .map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                onClick={() => (item.id === 'setup' ? newElection() : go(item.id))}
                aria-current={view === item.id ? 'page' : undefined}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
        </nav>
        {isAdmin && (
          <details
            className="nav-management"
            open={['candidates', 'elections', 'administrators'].includes(view) || undefined}
          >
            <summary>
              Gerenciar cadastros <ChevronRight size={16} />
            </summary>
            <nav aria-label="Gerenciamento">
              {navigation
                .filter((item) => ['candidates', 'elections', 'administrators'].includes(item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    className={view === item.id ? 'active' : ''}
                    onClick={() => go(item.id)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                ))}
            </nav>
          </details>
        )}

        <div className="sidebar-bottom">
          <a href={routePrefix + '/testar'} target="_blank" rel="noopener">
            <Play size={18} /> Testar as urnas <ArrowUpRight size={16} />
          </a>
          <button onClick={() => open('help')}>
            <HelpCircle size={18} /> Como usar
          </button>
          <p>
            Pequenas escolhas.
            <br />
            <strong>Grandes aprendizados.</strong>
          </p>
        </div>
      </aside>
      {menu && (
        <button className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />
      )}
      <div className="app-body">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setMenu((x) => !x)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Urna escolar <ChevronRight size={16} />{' '}
              <b>{headings[view][0].includes('Tudo') ? 'Início' : headings[view][0]}</b>
            </span>
          </div>
          <div className="top-actions">
            <Badge>
              <LockKeyhole size={13} /> Acesso por senha
            </Badge>
            <button className="icon-button" aria-label="Como usar" onClick={() => open('help')}>
              <HelpCircle size={21} />
            </button>
            {data.me && (
              <>
                <div className="user-chip">
                  <span>{data.me.name[0].toUpperCase()}</span>
                  <div>
                    <strong>{data.me.name}</strong>
                    <small>
                      {data.me.role === 'mesario' ? 'Operador da urna' : 'Administrador'}
                    </small>
                  </div>
                </div>
                <button className="icon-button" onClick={logout} aria-label="Sair da conta">
                  <LogOut size={20} />
                </button>
              </>
            )}
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === 'home' ? 'BEM-VINDO À URNA ESCOLAR' : 'PAINEL DE ORGANIZAÇÃO'}
              </p>
              <h1>{headings[view][0]}</h1>
              <p>{headings[view][1]}</p>
            </div>
            {headingActions()}
          </div>
          {loadError && data.me && (
            <div className="error-banner inline-error" role="alert">
              <span>{loadError}</span>
              <button
                className="text-button"
                onClick={() => load().catch((e) => setLoadError(e.message))}
              >
                <RefreshCw size={16} /> Atualizar dados
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <RefreshCw className="spin" size={24} /> Carregando seu painel…
            </div>
          ) : !data.me ? (
            <Login designVariant={designVariant} onReady={load} />
          ) : (
            <>
              {view === 'home' && (
                <>
                  <div className="welcome-grid">
                    <section className="welcome-card configure">
                      <div className="welcome-icon">
                        <Pencil size={26} />
                      </div>
                      <Badge tone="blue">Para quem organiza</Badge>
                      <h2>Uma votação em 3 passos</h2>
                      <p>
                        Escolha o modelo, cadastre os personagens e confira tudo antes de abrir.
                      </p>
                      <div className="welcome-path">
                        <span>
                          <i>1</i>Urna
                        </span>
                        <ChevronRight size={15} />
                        <span>
                          <i>2</i>Candidatos
                        </span>
                        <ChevronRight size={15} />
                        <span>
                          <i>3</i>Revisão
                        </span>
                      </div>
                      <button
                        className="button primary"
                        disabled={!isAdmin}
                        onClick={() => newElection()}
                      >
                        Preparar votação <ArrowRight size={18} />
                      </button>
                    </section>
                    <section className="welcome-card participate">
                      <div className="welcome-icon">
                        <Vote size={28} />
                      </div>
                      <img
                        className="home-vote-art"
                        src="/vote-box-csi.svg"
                        alt="Ilustração de uma urna recebendo o voto"
                      />
                      <Badge tone="green">Para a turma</Badge>
                      <h2>Hora de votar</h2>
                      <p>
                        {activeElections.length
                          ? 'A votação está pronta. Abra a urna e entregue o iPad à turma.'
                          : 'Depois de preparar a votação, abra a urna para a turma. Você pode testar os modelos agora.'}
                      </p>
                      {activeElections.length === 1 ? (
                        <a
                          className="button green"
                          href={
                            routePrefix +
                            '/urna/' +
                            encodeURIComponent(activeElections[0].terminalId)
                          }
                          target="_blank"
                          rel="noopener"
                          title="Abre em uma nova aba"
                        >
                          Abrir votação <ArrowUpRight size={18} />
                        </a>
                      ) : (
                        <button className="button green" onClick={() => go('terminals')}>
                          {activeElections.length ? 'Escolher urna' : 'Ver urnas disponíveis'}{' '}
                          <ArrowRight size={18} />
                        </button>
                      )}
                      <a
                        href={routePrefix + '/testar'}
                        target="_blank"
                        rel="noopener"
                        className="text-button"
                      >
                        <Play size={15} /> Experimentar antes
                      </a>
                    </section>
                  </div>

                  <div className="simple-stats">
                    <span>
                      <UserRound size={19} />
                      <b>{activeCandidates.length}</b> candidatos ativos
                    </span>
                    <span>
                      <Vote size={19} />
                      <b>{activeElections.length}</b> votações abertas
                    </span>
                    <span>
                      <CheckCircle2 size={19} />
                      <b>{voteTotal}</b> votos registrados
                    </span>
                  </div>
                  <section className="section">
                    <div className="section-heading">
                      <div>
                        <h2>As urnas estão prontas</h2>
                        <p>Use “Testar” para conhecer o modelo sem registrar votos reais.</p>
                      </div>
                      <button className="text-button" onClick={() => go('terminals')}>
                        Ver todas <ArrowRight size={17} />
                      </button>
                    </div>
                    {terminalCards(data.terminals.slice(0, 2))}
                  </section>
                </>
              )}
              {view === 'setup' &&
                (prepared ? (
                  <section className="prepared-success">
                    <div className="prepared-check">
                      <CheckCircle2 size={42} />
                    </div>
                    <p className="eyebrow">CONFIGURAÇÃO CONCLUÍDA</p>
                    <h2>
                      {prepared.scheduled ? 'Votação agendada' : 'Tudo pronto para a turma votar!'}
                    </h2>
                    <p>
                      <strong>{prepared.name}</strong> ·{' '}
                      {data.terminals.find((t) => t.id === prepared.terminalId)?.name}
                    </p>
                    <div className="prepared-period">
                      <CalendarDays size={19} />
                      {formatted(prepared.startsAt)} até {formatted(prepared.endsAt)}
                    </div>
                    <p>
                      {prepared.scheduled
                        ? 'A urna abrirá automaticamente no horário marcado.'
                        : 'A urna abre em uma nova aba e bloqueia o painel neste iPad. Após cada voto, a tela volta automaticamente para a próxima criança.'}
                    </p>
                    <div className="prepared-actions">
                      <a
                        className="button primary"
                        href={routePrefix + '/urna/' + encodeURIComponent(prepared.terminalId)}
                        target="_blank"
                        rel="noopener"
                        title="Abre em uma nova aba"
                      >
                        {prepared.scheduled ? 'Ver urna agendada' : 'Abrir urna agora'}{' '}
                        <ArrowUpRight size={19} />
                      </a>
                      <button className="button secondary" onClick={() => go('home')}>
                        Voltar ao início
                      </button>
                    </div>
                    <small>
                      Controle no papel quem já votou. Nenhum estudante precisa de cadastro.
                    </small>
                  </section>
                ) : (
                  <ElectionEditor
                    key={setupTerminalId || 'new'}
                    initialTerminalId={setupTerminalId}
                    data={data}
                    busy={busy}
                    save={prepareElection}
                    onCancel={() => go('home')}
                    onAddCandidate={(terminalId) => open('candidate', undefined, terminalId)}
                    onEditCandidate={(c) => open('candidate', c)}
                  />
                ))}
              {view === 'terminals' && (
                <>
                  <div className="info-banner">
                    <Monitor size={21} />
                    <span>
                      Os dois modelos já vêm configurados. Use “Preparar nesta urna” para escolher
                      os candidatos e começar. Cada voto confirmado reinicia a urna automaticamente.
                    </span>
                  </div>
                  {terminalCards()}
                  {urnaElectionRows(
                    ongoingUrnaElections,
                    'Urnas em andamento',
                    'Votações abertas agora ou programadas para começar.',
                    'Nenhuma votação em andamento no momento.',
                  )}
                  {urnaElectionRows(
                    closedUrnaElections,
                    'Urnas encerradas',
                    'Remova uma votação desta aba quando não precisar mais deixá-la visível. Os resultados continuam disponíveis.',
                    'Nenhuma votação encerrada para organizar.',
                    true,
                  )}
                </>
              )}
              {view === 'candidates' && (
                <>
                  <div
                    className="urna-candidate-picker"
                    role="group"
                    aria-label="Candidatos por urna"
                  >
                    {data.terminals.map((t) => (
                      <button
                        key={t.id}
                        aria-pressed={candidateTerminalId === t.id}
                        onClick={() => {
                          setCandidateTerminalId(t.id);
                          setSearch('');
                        }}
                      >
                        {t.model === 'images' ? <Images size={19} /> : <Keyboard size={19} />}
                        <strong>{t.name}</strong>
                        <span>
                          {data.candidates.filter((c) => c.terminalId === t.id).length} candidatos
                        </span>
                      </button>
                    ))}
                    {!!unassignedCandidates.length && (
                      <button
                        aria-pressed={candidateTerminalId === 'pending'}
                        onClick={() => {
                          setCandidateTerminalId('pending');
                          setSearch('');
                        }}
                      >
                        <strong>Definir urna</strong>
                        <span>{unassignedCandidates.length} candidatos anteriores</span>
                      </button>
                    )}
                  </div>
                  <div className="info-banner candidate-scope-note">
                    <Monitor size={21} />
                    <span>
                      {candidateTerminal ? (
                        <>
                          <strong>{candidateTerminal.name}</strong> tem seu próprio cadastro. Você
                          pode usar 1, 2 e 3 aqui e repetir esses números na outra urna.
                        </>
                      ) : (
                        'Seus candidatos anteriores foram preservados. Use “Definir urna” em cada personagem para escolher onde ele será usado. As votações e os resultados existentes continuam disponíveis.'
                      )}
                    </span>
                  </div>
                  <div className="filter-bar">
                    <div className="search-input">
                      <Search size={19} />
                      <input
                        aria-label="Buscar candidatos nesta urna"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nome ou número"
                      />
                    </div>
                    <span>{urnCandidates.length} cadastrados</span>
                  </div>
                  <div className="candidate-grid">
                    {candidateMatches.map((c) => (
                      <article
                        className={'candidate-card ' + (!c.active ? 'inactive' : '')}
                        key={c.id}
                      >
                        <div className="candidate-card-image">
                          {candidateImage(c.image, c.name)}
                          <span className="candidate-number">{candidateNumber(c.code)}</span>
                        </div>
                        <div className="candidate-card-info">
                          <div>
                            <h3>{c.name}</h3>
                            <Badge tone={c.active ? 'green' : 'neutral'}>
                              {c.active ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </div>
                          <p>
                            {c.image
                              ? 'Desenho adicionado'
                              : 'Adicione uma imagem para usar na urna infantil.'}
                          </p>
                          <button className="button secondary" onClick={() => open('candidate', c)}>
                            <Pencil size={17} />
                            {c.terminalId ? 'Editar candidato' : 'Definir urna'}
                          </button>
                          <button
                            className="text-button muted"
                            disabled={busy}
                            onClick={() =>
                              action('toggle', { entity: 'candidates', id: c.id })
                                .then(() =>
                                  notify(c.active ? 'Candidato desativado.' : 'Candidato ativado.'),
                                )
                                .catch((e) => notify(e.message, true))
                            }
                          >
                            {c.active ? 'Desativar' : 'Ativar'} candidato
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!urnCandidates.length && (
                    <Empty
                      title="Cadastre os personagens desta urna"
                      text="Escolha nome, número de 0 a 9 e desenho. Os candidatos da outra urna ficam separados."
                      action={
                        <button className="button primary" onClick={() => open('candidate')}>
                          <Plus size={18} /> Adicionar candidato
                        </button>
                      }
                    />
                  )}
                  {!!urnCandidates.length && !candidateMatches.length && (
                    <Empty
                      title="Nenhum candidato encontrado nesta urna"
                      text="Tente outro nome ou número."
                    />
                  )}
                  {!!urnCandidates.filter((c) => c.active && c.terminalId).length && (
                    <div className="next-step">
                      <span>
                        <CheckCircle2 size={22} /> Candidatos prontos? Prepare a votação nesta urna.
                      </span>
                      <button
                        className="button primary"
                        onClick={() => newElection(candidateTerminalId)}
                      >
                        Preparar votação <ArrowRight size={17} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === 'elections' && (
                <>
                  <div className="filter-bar">
                    <div className="search-input">
                      <Search size={19} />
                      <input
                        aria-label="Buscar votações"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar uma votação"
                      />
                    </div>
                    <span>{data.elections.length} votações</span>
                  </div>
                  <div className="election-list">
                    {data.elections
                      .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
                      .map((e) => (
                        <article className="election-card" key={e.id}>
                          <div className="election-card-main">
                            <div>
                              <ElectionStatus election={e} />
                              <span>
                                {e.candidateSnapshot.length} candidatos · {totals(e).total} votos
                              </span>
                            </div>
                            <h3>{e.name}</h3>
                            <p>
                              <Monitor size={16} />
                              {data.terminals.find((t) => t.id === e.terminalId)?.name}
                            </p>
                            <p>
                              <CalendarDays size={16} />
                              {formatted(e.startsAt)} até {formatted(e.endsAt)}
                            </p>
                          </div>
                          <div className="election-card-actions">
                            {status(e) === 'active' && (
                              <a
                                className="button primary"
                                href={routePrefix + '/urna/' + encodeURIComponent(e.terminalId)}
                                target="_blank"
                                rel="noopener"
                                title="Abre em uma nova aba"
                              >
                                Abrir urna <ArrowUpRight size={17} />
                              </a>
                            )}
                            <button className="button secondary" onClick={() => showResults(e)}>
                              <BarChart3 size={17} /> Resultados
                            </button>
                            {status(e) !== 'closed' && (
                              <button
                                className="text-button muted"
                                onClick={() => open('close', e)}
                              >
                                <LockKeyhole size={15} /> Encerrar votação
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                  </div>
                  {!data.elections.length && (
                    <Empty
                      title="Sua primeira votação começa aqui"
                      text={
                        activeCandidates.length
                          ? 'Escolha os candidatos e o modelo de urna.'
                          : 'Comece cadastrando os candidatos. Depois, escolha a urna.'
                      }
                      action={
                        <button className="button primary" onClick={() => newElection()}>
                          Preparar votação <ArrowRight size={17} />
                        </button>
                      }
                    />
                  )}
                </>
              )}
              {view === 'results' &&
                (selectedElection ? (
                  <section className="panel results-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Apuração da votação</h2>
                        <p>
                          {status(selectedElection) === 'closed'
                            ? 'Resultado final.'
                            : 'Resultado parcial, atualizado durante a votação.'}
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => exportResults(selectedElection)}
                      >
                        <Download size={17} /> Baixar CSV
                      </button>
                    </div>
                    <div className="results-selector">
                      <select
                        aria-label="Votação dos resultados"
                        value={selectedElection.id}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {data.elections.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                      <ElectionStatus election={selectedElection} />
                    </div>
                    <div className="result-totals">
                      <div>
                        <b>{resultTotals.total}</b>
                        <span>Total de votos</span>
                      </div>
                      <div>
                        <b>{selectedElection.candidateSnapshot.length}</b>
                        <span>Candidatos</span>
                      </div>
                    </div>
                    <div className="results-bars">
                      {[...selectedElection.candidateSnapshot]
                        .sort(
                          (a, b) =>
                            selectedElection.results
                              .filter((r) => r.kind === 'valid' && r.candidateId === b.id)
                              .reduce((sum, r) => sum + r.total, 0) -
                            selectedElection.results
                              .filter((r) => r.kind === 'valid' && r.candidateId === a.id)
                              .reduce((sum, r) => sum + r.total, 0),
                        )
                        .map((c) => {
                          const count = selectedElection.results
                            .filter((r) => r.kind === 'valid' && r.candidateId === c.id)
                            .reduce((sum, r) => sum + r.total, 0);
                          const percent = resultTotals.valid
                            ? Math.round((count / resultTotals.valid) * 100)
                            : 0;
                          return (
                            <div className="result-row" key={c.id}>
                              <div className="result-image">{candidateImage(c.image, c.name)}</div>
                              <div>
                                <div>
                                  <strong>
                                    {c.name}
                                    <small>Número {c.code}</small>
                                  </strong>
                                  <span>
                                    <b>{count}</b> votos · {percent}%
                                  </span>
                                </div>
                                <div className="bar-track">
                                  <i style={{ width: percent + '%' }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </section>
                ) : (
                  <Empty
                    title="Os resultados aparecerão aqui"
                    text="Prepare a votação e registre os primeiros votos para acompanhar a apuração."
                    action={
                      <button className="button primary" onClick={() => newElection()}>
                        Preparar votação <ArrowRight size={17} />
                      </button>
                    }
                  />
                ))}
              {view === 'administrators' && <AccountSettings />}
            </>
          )}
          <footer className="content-footer">
            <span>Santa Inês · Urna escolar</span>
            <span>
              <LockKeyhole size={14} /> Votos anônimos. Controle de participação no papel.
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal.kind === 'candidate'
              ? modal.value?.id
                ? 'Editar candidato'
                : 'Adicionar candidato'
              : modal.kind === 'terminal'
                ? modal.value
                  ? 'Editar urna'
                  : 'Adicionar urna'
                : modal.kind === 'close'
                  ? 'Encerrar votação'
                  : 'Como usar a urna escolar'
          }
          subtitle={modal.kind === 'candidate' ? 'Urna, nome, número e desenho.' : undefined}
          wide={modal.kind === 'terminal' || modal.kind === 'help'}
          onClose={() => {
            if (!busyRef.current) setModal(null);
          }}
        >
          {['candidate', 'terminal'].includes(modal.kind) && (
            <Editor
              kind={modal.kind}
              value={modal.value}
              data={data}
              busy={busy}
              save={save}
              upload={upload}
              onCancel={() => setModal(null)}
            />
          )}
          {modal.kind === 'help' && (
            <div className="help-content">
              {[
                {
                  title: 'Abra Preparar votação',
                  text: 'Escolha o modelo: imagens para os pequenos ou teclado para os maiores.',
                },
                {
                  title: 'Adicione os candidatos',
                  text: 'Escolha a urna e cadastre nome, número de 0 a 9 e desenho. Você pode repetir os números em outra urna.',
                },
                {
                  title: 'Revise e conclua',
                  text: 'Dê um nome à votação, confira a duração e conclua. A próxima tela já permite abrir a urna.',
                },
                {
                  title: 'Abra a urna para a turma',
                  text: 'Na infantil, a criança toca no desenho. Na padrão, o 0 já está preenchido: ela digita só o último número.',
                },
                {
                  title: 'Confirme e continue',
                  text: 'Depois de FIM, a tela volta automaticamente para o próximo voto. Controle no papel quem já participou.',
                },
                {
                  title: 'Veja o resultado',
                  text: 'Abra Resultados para conferir os totais e baixar a apuração.',
                },
              ].map((item, i) => (
                <div key={item.title}>
                  <span>{i + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
              <a
                className="button secondary"
                href={routePrefix + '/testar'}
                target="_blank"
                rel="noopener"
              >
                <Play size={17} /> Testar os dois modelos
              </a>
            </div>
          )}
          {modal.kind === 'close' && (
            <div className="editor-form">
              <p>
                Encerrar <strong>{modal.value.name}</strong>?
              </p>
              <div className="info-banner">
                A urna deixará de receber votos. Os resultados serão preservados e a votação não
                poderá ser reaberta.
              </div>
              <div className="form-footer">
                <button className="button secondary" disabled={busy} onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={() =>
                    action('close', { id: modal.value.id })
                      .then(() => {
                        setModal(null);
                        notify('Votação encerrada. Resultados preservados.');
                        showResults(modal.value);
                      })
                      .catch((e) => notify(e.message, true))
                  }
                >
                  {busy ? 'Encerrando…' : 'Encerrar votação'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
      {notice && (
        <div className={'toast ' + (notice.error ? 'error' : '')} role="status">
          {notice.error ? <X size={20} /> : <Check size={20} />}
          <span>{notice.text}</span>
          <button aria-label="Fechar aviso" onClick={() => setNotice(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

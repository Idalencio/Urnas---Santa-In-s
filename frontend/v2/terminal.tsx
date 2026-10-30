import { Credit } from './workflow';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, LogOut, RefreshCw, Play } from 'lucide-react';
import { Field } from '../app/components';
import { responseData } from '../app/http';
import Ballot from './ballot';
import type { Election, Terminal } from './domain';
type ElectionOption = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
};
type Authorization = { gate: string; name: string; className: string; expires: number };
/**
 * Urna pública: escolhe a eleição, solicita a matrícula e mantém a liberação só em memória.
 * Ao concluir o voto, limpa a identificação e prepara a próxima participação.
 */
export default function TerminalView({ id }: { id: string }) {
  const [data, setData] = useState<{
      terminal: Terminal;
      election: Election | null;
      elections: ElectionOption[];
    } | null>(null),
    [auth, setAuth] = useState<Authorization | null>(null),
    [matricula, setMatricula] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [selectedElection, setSelectedElection] = useState(
    new URLSearchParams(location.search).get('election') || '',
  );
  const selectionRef = useRef(selectedElection);
  selectionRef.current = selectedElection;
  const busyRef = useRef(false),
    currentElection = useRef(''),
    authRef = useRef<Authorization | null>(null),
    mounted = useRef(true);
  authRef.current = auth;
  const endpoint = '/api/v2/urna/' + id;
  async function load() {
    const requested = selectionRef.current;
    const r = await responseData(
      await fetch(
        endpoint +
          (selectionRef.current ? '?election=' + encodeURIComponent(selectionRef.current) : ''),
        { cache: 'no-store', credentials: 'same-origin' },
      ),
    );
    if (!mounted.current || requested !== selectionRef.current) return;
    if (currentElection.current && currentElection.current !== r.election?.id) {
      setAuth(null);
      setMatricula('');
    }
    currentElection.current = r.election?.id || '';
    setData(r);
    if (r.election && !selectionRef.current) {
      selectionRef.current = r.election.id;
      setSelectedElection(r.election.id);
    }
    if (
      !r.election ||
      !r.election.published ||
      r.election.closed ||
      Date.parse(r.election.endsAt) <= Date.now()
    )
      setAuth(null);
  }
  useEffect(() => {
    mounted.current = true;
    load().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!busyRef.current)
        load().catch(() => setError('Falha de conexão. Confira a rede antes de continuar.'));
    }, 10000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [id, selectedElection]);
  async function post(body: any) {
    return responseData(
      await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          electionId: selectionRef.current || currentElection.current,
        }),
      }),
    );
  }
  async function cancel() {
    const current = authRef.current;
    setAuth(null);
    setMatricula('');
    setError('');
    if (current)
      try {
        await post({ action: 'cancel', gate: current.gate });
      } catch {}
  }
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(
      () => {
        cancel();
        setError('A liberação expirou. Informe a matrícula novamente.');
      },
      Math.max(0, auth.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [auth?.gate]);
  const e = data?.election;
  const active =
    e &&
    e.published &&
    !e.closed &&
    Date.parse(e.startsAt) <= Date.now() &&
    Date.parse(e.endsAt) > Date.now();
  if (active && data && (!e.requireMatricula || auth))
    return (
      <>
        <div className="v2-voter-strip">
          <LockKeyhole size={16} />
          <span>
            {auth ? (
              <>
                Urna liberada para <strong>{auth.name}</strong> · {auth.className}
              </>
            ) : (
              <>Modo aberto · {e.name}</>
            )}
          </span>
          {auth && (
            <button className="text-button" disabled={busy} onClick={() => cancel()}>
              <LogOut size={16} />
              Voltar à identificação
            </button>
          )}
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <Ballot
          appearance="csi"
          key={e.id + ':' + (auth?.gate || 'open')}
          terminal={data.terminal}
          election={e}
          busy={busy}
          onComplete={() => {
            setAuth(null);
            setMatricula('');
            setError('');
          }}
          cast={async (body) => {
            if (busyRef.current) throw Error('Aguarde o voto atual.');
            busyRef.current = true;
            setBusy(true);
            try {
              await post({ ...body, gate: auth?.gate || '' });
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        />
      </>
    );
  async function chooseElection(value: string) {
    await cancel();
    currentElection.current = '';
    selectionRef.current = value;
    setSelectedElection(value);
    setData(null);
    setError('');
  }
  if (data && !data.election && data.elections?.length > 1)
    return (
      <div className="v2-identify design-alt">
        <header className="v2-header">
          <img src="/csi-logo.png" alt="Santa Inês" />
          <strong>Urna escolar</strong>
          <span>{data.terminal.name}</span>
        </header>
        <main className="access-card simple-election-picker">
          <h1>Escolha a eleição</h1>
          <p>Depois, informe sua matrícula para votar.</p>
          {data.elections.map((item) => (
            <button
              className="button secondary"
              key={item.id}
              onClick={() => chooseElection(item.id)}
            >
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.status === 'active' ? 'Aberta para votar' : 'Aguardando início'}
                </small>
              </span>
              <Play size={18} />
            </button>
          ))}
        </main>
        <Credit />
      </div>
    );
  return (
    <div className="v2-identify design-alt">
      <header className="v2-header">
        <img src="/csi-logo.png" alt="Santa Inês" />
        <strong>Urna escolar</strong>
        <span>{data?.terminal.name || 'Abrindo urna'}</span>
      </header>
      <main className="access-card">
        <LockKeyhole size={36} />
        <h1>{active ? 'Sua vez de votar' : data ? 'Aguardando eleição' : 'Abrindo a urna'}</h1>
        <p>{e?.name || 'Aguarde a publicação de uma eleição.'}</p>
        {(data?.elections?.length || 0) > 1 && (
          <button className="text-button" onClick={() => chooseElection('')}>
            Escolher outra eleição
          </button>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {active ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busyRef.current) return;
              busyRef.current = true;
              setBusy(true);
              setError('');
              try {
                const r = await post({ action: 'authorize', matricula });
                setMatricula('');
                setAuth({ ...r, expires: Date.now() + r.expiresIn * 1000 });
              } catch (e: any) {
                setError(e.message);
              } finally {
                busyRef.current = false;
                setBusy(false);
              }
            }}
          >
            <Field label="Matrícula / número do título eleitoral">
              <input
                required
                autoFocus
                maxLength={80}
                autoComplete="off"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Digite sua matrícula"
              />
            </Field>
            <button className="button primary" disabled={busy}>
              {busy ? 'Conferindo…' : 'Liberar urna'}
            </button>
            <small>
              A matrícula libera um voto nesta eleição. O voto não guarda seu nome ou sua matrícula.
            </small>
          </form>
        ) : (
          <>
            <p>
              {e?.published && !e.closed && Date.parse(e.startsAt) > Date.now()
                ? 'A votação começará no horário programado.'
                : e?.closed || (e?.published && Date.parse(e.endsAt) <= Date.now())
                  ? 'Esta eleição foi encerrada.'
                  : 'A urna será liberada quando a eleição estiver aberta.'}
            </p>
            <button
              className="button secondary"
              onClick={() =>
                load()
                  .then(() => setError(''))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={17} />
              Atualizar
            </button>
          </>
        )}
      </main>
      <Credit />
    </div>
  );
}

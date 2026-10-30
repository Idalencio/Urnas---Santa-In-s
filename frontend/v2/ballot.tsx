import { Credit } from './workflow';
('use client');
import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Delete,
  Expand,
  Hand,
  LockKeyhole,
  Volume2,
  VolumeX,
  Vote,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import {
  status,
  voteChoice,
  requestId as newRequestId,
  type Election,
  type Terminal,
} from './domain';
import { Badge } from '../app/components';
import { useUrnaSound } from '../app/urna-sound';
type Props = {
  terminal: Terminal;
  election?: Election;
  busy: boolean;
  onExit?: () => void;
  onComplete?: () => void;
  testing?: boolean;
  testVotes?: number;
  appearance?: 'csi';
  cast: (body: { requestId: string; electionId: string; code: string }) => Promise<void>;
};
/** Interface de votação: usa os candidatos publicados e aguarda a confirmação da API. */
export default function Ballot({
  terminal,
  election,
  busy,
  onExit,
  onComplete,
  cast,
  testing = false,
  testVotes = 0,
  appearance = 'csi',
}: Props) {
  const urnaSound = useUrnaSound();
  const model = terminal.model;
  const [phase, setPhase] = useState<'choose' | 'review' | 'done'>('choose');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sound, setSound] = useState(true),
    [immersive, setImmersive] = useState(false);
  const [sending, setSending] = useState(false),
    [checking, setChecking] = useState(false);
  const checkUntil = useRef(0);
  const requestId = useRef<string>('');
  const sendingRef = useRef(false);
  const started = useRef(false);
  useEffect(() => {
    requestId.current = newRequestId();
    started.current = true;
  }, []);
  const available = election && status(election) === 'active';
  const candidate = election?.candidateSnapshot.find((c) => c.code === code);
  const full = election && code.length > 0;
  const electionTitle = testing ? election?.name.replace(/\s*[·-]\s*teste$/i, '') : election?.name;
  function beep(done = false) {
    if (!sound) return;
    if (done) void urnaSound.confirm();
    else urnaSound.key();
  }
  function digit(n: string) {
    if (!available || phase !== 'choose' || !election) return;
    checkUntil.current = Date.now() + 1000;
    setCode((current) => (current.length < election.digits ? current + n : current));
    setError('');
    beep();
  }
  useEffect(() => {
    if (model !== 'standard' || !full || !candidate) {
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(
      () => setChecking(false),
      Math.max(0, checkUntil.current - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [code, model, full, candidate]);
  function reset() {
    setCode('');
    setError('');
    setPhase('choose');
  }
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => {
      requestId.current = newRequestId();
      setCode('');
      setError('');
      setPhase('choose');
      onComplete?.();
    }, 1800);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        sendingRef.current ||
        !available
      )
        return;
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (phase === 'review') void confirm();
        else if (phase === 'choose') {
          if (model === 'standard' && full && candidate) void confirm();
          else review();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (phase !== 'done') reset();
        return;
      }
      if (phase !== 'choose' || model !== 'standard') return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        digit(e.key);
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setCode((current) => current.slice(0, -1));
        setError('');
      }
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        reset();
      }
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [model, phase, code, available, full, sound]);
  function review() {
    if (!election || !available) return;
    try {
      voteChoice(election, code);
      setError('');
      setPhase('review');
    } catch (e: any) {
      if (full) setError(e.message);
    }
  }
  async function confirm() {
    if (
      !election ||
      (model === 'images' ? phase !== 'review' : phase !== 'choose') ||
      busy ||
      (model === 'standard' && Date.now() < checkUntil.current) ||
      sendingRef.current ||
      !started.current
    )
      return;
    if (sound) urnaSound.unlock();
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      voteChoice(election, code);
      await cast({ requestId: requestId.current, electionId: election.id, code });
      setCode('');
      setPhase('done');
      beep(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }
  return (
    <div
      className={
        'ballot-page ' +
        (model === 'standard' ? 'ballot-standard-page ' : '') +
        (appearance === 'csi' ? ' design-alt' : '') +
        (immersive ? ' immersive' : '')
      }
    >
      {immersive && (
        <button
          className="exit-immersive icon-button"
          aria-label="Sair da tela cheia"
          onClick={() => {
            setImmersive(false);
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          }}
        >
          <Expand size={20} />
        </button>
      )}
      <header className="ballot-header">
        {testing && onExit ? (
          <button className="text-button" onClick={onExit} disabled={sending || busy}>
            <ArrowLeft size={18} />
            Voltar
          </button>
        ) : (
          <span className="ballot-only-label">
            <LockKeyhole size={16} /> Votação
          </span>
        )}
        <div>
          <img
            src={appearance === 'csi' ? '/csi-logo.png' : '/school-mark.png'}
            alt="Colégio Santa Inês"
          />
          <strong>Urna Digital Escolar</strong>
        </div>
        <button
          className="icon-button"
          title="Tela cheia"
          onClick={() => {
            setImmersive(true);
            if (document.documentElement.requestFullscreen)
              void document.documentElement.requestFullscreen().catch(() => {});
          }}
        >
          <Expand size={20} />
        </button>
      </header>
      <main className="ballot-main">
        {model !== 'standard' && !testing && (
          <div className="ballot-title">
            <Badge tone={testing ? 'blue' : available ? 'green' : 'neutral'}>
              {testing ? 'Modo de teste' : available ? 'Urna aberta' : 'Aguardando eleição'}
            </Badge>
            <p>
              {terminal.name} · {terminal.location}
            </p>
            <h1>{election?.name || 'Vamos escolher juntos'}</h1>
          </div>
        )}
        {testing && (
          <div className="ballot-test-banner">
            <div>
              <Badge tone="blue">Modo de teste</Badge>
              <strong>Teste livre · nenhuma eleição real é alterada</strong>
              <p>
                {election?.candidateSnapshot.map((c) => c.code + ' · ' + c.name).join(' / ')}.
                Digite o número completo que você cadastrou.
              </p>
            </div>
            <span role="status">
              {testVotes} {testVotes === 1 ? 'voto de teste' : 'votos de teste'}
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="error-banner">
            {error}
          </div>
        )}
        {model === 'images' && available && phase !== 'done' ? (
          <div className="standard-shell child-urna-shell">
            <div className="standard-screen child-candidate-screen">
              <div className="screen-head">
                <span>{election?.hasVice ? 'ESCOLHA SEU PREFEITO' : 'ESCOLHA SEU CANDIDATO'}</span>
                <strong>Toque em uma opção</strong>
              </div>
              <div className="child-option-grid">
                {election!.candidateSnapshot.map((c) => (
                  <button
                    key={c.id}
                    className={code === c.code ? 'selected' : ''}
                    onClick={() => {
                      setCode(c.code);
                      setPhase('review');
                      beep();
                    }}
                    aria-pressed={code === c.code}
                  >
                    <span className="v2-option-photos">
                      <img src={c.image || '/favicon.svg'} alt={c.name} />
                      {!!election?.hasVice && c.viceName && (
                        <img
                          className="v2-option-vice"
                          src={c.viceImage || '/favicon.svg'}
                          alt={'Vice-prefeito: ' + c.viceName}
                        />
                      )}
                    </span>
                    <strong>{c.name}</strong>
                    {!!election?.hasVice && c.viceName && <small>Vice: {c.viceName}</small>}
                    <span>Número {c.code}</span>
                  </button>
                ))}
              </div>
              <p className="child-screen-hint">
                {candidate ? 'Confira sua escolha ao lado.' : 'Escolha uma imagem para continuar.'}
              </p>
            </div>
            <div className="keypad child-preview-panel">
              {candidate ? (
                <div className="child-featured-candidate">
                  <span>
                    {election?.hasVice ? 'PREFEITO SELECIONADO' : 'CANDIDATO SELECIONADO'}
                  </span>
                  <div className="v2-slate-portraits">
                    <img
                      className="v2-mayor-photo"
                      src={candidate.image || '/favicon.svg'}
                      alt={'Prefeito: ' + candidate.name}
                    />
                    {!!election?.hasVice && candidate.viceName && (
                      <figure className="v2-vice-photo">
                        <img
                          src={candidate.viceImage || '/favicon.svg'}
                          alt={'Vice: ' + candidate.viceName}
                        />
                        <figcaption>
                          <b>Vice-prefeito</b>
                          <span>{candidate.viceName}</span>
                        </figcaption>
                      </figure>
                    )}
                  </div>
                  <strong>{candidate.name}</strong>
                  <small>Número {candidate.code}</small>
                </div>
              ) : (
                <div className="child-featured-empty">
                  <Hand size={30} />
                  <span>Seu personagem aparecerá aqui</span>
                </div>
              )}
              <div className="child-confirm-actions">
                <button className="correct-key" disabled={!candidate || sending} onClick={reset}>
                  CORRIGE
                </button>
                <button
                  className="confirm-key"
                  disabled={!candidate || phase !== 'review' || sending || busy}
                  onClick={confirm}
                >
                  {sending ? 'SALVANDO…' : 'CONFIRMA'}
                </button>
              </div>
            </div>
          </div>
        ) : model === 'standard' ? (
          <div className="standard-shell">
            <div className="standard-screen">
              <div className="screen-head">
                <span>SEU VOTO PARA</span>
                <strong>{electionTitle || 'Votação escolar'}</strong>
                <span className="school-screen-label">
                  <img src="/csi-logo.png" alt="Logo CSI" />
                </span>
              </div>
              {!available ? (
                <div className="lcd-waiting">
                  <LockKeyhole size={30} />
                  <h2>URNA AGUARDANDO</h2>
                  <p>
                    {election
                      ? 'A votação abrirá no horário marcado.'
                      : 'Prepare uma votação no painel para começar.'}
                  </p>
                </div>
              ) : phase === 'done' ? (
                <div className="lcd-done" role="status">
                  <span className="lcd-done-check" aria-hidden="true">
                    <Check size={34} />
                  </span>
                  <strong>FIM</strong>
                  <p>{testing ? 'Voto de teste confirmado' : 'Voto registrado'}</p>
                </div>
              ) : (
                <>
                  <p className="lcd-digit-hint">Número do candidato</p>
                  <div className="number-slots">
                    {Array.from({ length: Math.max(1, code.length) }, (_, i) => (
                      <span key={i} className="">
                        {code[i] || ''}
                      </span>
                    ))}
                  </div>
                  {full ? (
                    candidate ? (
                      <div className="chosen-candidate">
                        <div>
                          <small>{election?.hasVice ? 'PREFEITO' : 'CANDIDATO'}</small>
                          <h2>{candidate.name}</h2>
                          <p>Número {candidate.code}</p>
                          {!!election?.hasVice && candidate.viceName && (
                            <p>
                              <b>Vice-prefeito:</b> {candidate.viceName}
                            </p>
                          )}
                        </div>
                        <div className="v2-slate-portraits">
                          <img
                            className="v2-mayor-photo"
                            src={candidate.image || '/favicon.svg'}
                            alt={'Prefeito: ' + candidate.name}
                          />
                          {!!election?.hasVice && candidate.viceName && (
                            <figure className="v2-vice-photo">
                              <img
                                src={candidate.viceImage || '/favicon.svg'}
                                alt={'Vice: ' + candidate.viceName}
                              />
                              <figcaption>
                                <b>Vice-prefeito</b>
                                <span>{candidate.viceName}</span>
                              </figcaption>
                            </figure>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="invalid-vote" role="alert">
                        <h2>Número inválido</h2>
                        <p>Digite outro número ou toque em CORRIGE.</p>
                      </div>
                    )
                  ) : (
                    <div className="screen-placeholder">
                      <span>Digite o número do seu candidato.</span>
                    </div>
                  )}
                  <div className="screen-instructions">
                    <p className={checking ? 'lcd-checking' : ''}>
                      {checking ? 'Confira seu voto…' : 'Aperte a tecla:'}
                    </p>
                    <p>
                      <b>CONFIRMA</b> para registrar o voto
                    </p>
                    <p>
                      <b>CORRIGE</b> para reiniciar a escolha
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="keypad">
              <div className="keypad-label">
                <ShieldCheck size={24} />
                <strong>URNA ESCOLAR</strong>
                <span>COLÉGIO SANTA INÊS</span>
              </div>
              <div className="numeric-keys">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
                  <button
                    key={n}
                    disabled={!available || phase !== 'choose' || sending}
                    onClick={() => digit(n)}
                  >
                    {n}
                    <span className="key-dots" aria-hidden="true">
                      ⠿
                    </span>
                  </button>
                ))}
                <span />
                <button
                  disabled={!available || phase !== 'choose' || sending}
                  onClick={() => digit('0')}
                >
                  0
                  <span className="key-dots" aria-hidden="true">
                    ⠿
                  </span>
                </button>
                <button
                  className="backspace"
                  disabled={!available || phase !== 'choose' || sending}
                  aria-label="Apagar último dígito"
                  onClick={reset}
                >
                  <Delete size={19} />
                </button>
              </div>
              <div className="function-keys">
                <button
                  className="correct-key"
                  disabled={!available || phase !== 'choose' || sending}
                  onClick={reset}
                >
                  CORRIGE
                </button>
                <button
                  className="confirm-key"
                  disabled={
                    !available ||
                    phase !== 'choose' ||
                    !full ||
                    !candidate ||
                    checking ||
                    sending ||
                    busy
                  }
                  onClick={confirm}
                >
                  {sending ? 'SALVANDO…' : 'CONFIRMA'}
                </button>
              </div>
            </div>
          </div>
        ) : !available ? (
          <div className="ballot-locked">
            <LockKeyhole size={48} />
            <h2>
              {election ? 'A votação ainda não começou' : 'Esta urna está pronta para configurar'}
            </h2>
            <p>
              {election
                ? 'A urna abrirá automaticamente no horário programado.'
                : 'Um responsável precisa cadastrar os candidatos e criar a votação no painel.'}
            </p>
          </div>
        ) : phase === 'done' ? (
          <div className="vote-done">
            <div>
              <Check size={48} />
            </div>
            <span>FIM</span>
            <h2>{testing ? 'Voto de teste confirmado!' : 'Seu voto foi registrado!'}</h2>
            <p>
              {testing
                ? 'Nenhum voto foi salvo na eleição real.'
                : 'Obrigado por participar da nossa escolha.'}
            </p>
            <small>A urna ficará pronta para o próximo voto automaticamente.</small>
          </div>
        ) : phase === 'review' ? (
          <div className="vote-review">
            <p className="eyebrow">CONFIRA A SUA ESCOLHA</p>
            {candidate ? (
              <>
                <div className="v2-slate-portraits">
                  <img
                    className="v2-mayor-photo"
                    src={candidate.image || '/favicon.svg'}
                    alt={'Prefeito: ' + candidate.name}
                  />
                  {!!election?.hasVice && candidate.viceName && (
                    <figure className="v2-vice-photo">
                      <img
                        src={candidate.viceImage || '/favicon.svg'}
                        alt={'Vice: ' + candidate.viceName}
                      />
                      <figcaption>
                        <b>Vice-prefeito</b>
                        <span>{candidate.viceName}</span>
                      </figcaption>
                    </figure>
                  )}
                </div>
                <h2>{candidate.name}</h2>
                <Badge>Número {candidate.code}</Badge>
              </>
            ) : (
              <div className="invalid-vote">
                <h2>Número inválido</h2>
                <p>Volte e escolha um candidato disponível.</p>
              </div>
            )}
            <p className="review-tip">Está tudo certo? Pressione Enter ou toque em confirmar.</p>
            <div className="review-actions">
              <button className="button correct" onClick={reset} disabled={sending}>
                <RotateCcw size={20} /> Corrigir
              </button>
              <button
                className="button confirm"
                onClick={confirm}
                disabled={sending || busy || !candidate}
              >
                <Check size={24} />
                {sending ? 'Registrando…' : 'Confirmar voto'}
              </button>
            </div>
          </div>
        ) : model === 'images' ? (
          <div className="child-vote">
            <div className="child-instruction">
              <Hand size={25} />
              <h2>Escolha um desenho</h2>
            </div>
            <p>Toque no seu favorito e aperte Continuar.</p>
            <div className="picture-candidates">
              {election!.candidateSnapshot.map((c) => (
                <button
                  key={c.id}
                  className={code === c.code ? 'selected' : ''}
                  onClick={() => {
                    setCode(c.code);
                    beep();
                  }}
                  aria-pressed={code === c.code}
                >
                  <span className="candidate-check">
                    {code === c.code ? <Check size={22} /> : null}
                  </span>
                  <img src={c.image || '/favicon.svg'} alt={'Desenho de ' + c.name} />
                  <strong>{c.name}</strong>
                  <span>Número {c.code}</span>
                </button>
              ))}
            </div>
            <div className="child-actions">
              <button className="button confirm" disabled={!full || !candidate} onClick={review}>
                Continuar <ChevronRight size={23} />
              </button>
            </div>
          </div>
        ) : null}
        <div className="ballot-footer">
          <span>
            <LockKeyhole size={14} />{' '}
            {testing
              ? 'Modo de teste · votos temporários.'
              : 'Voto sigiloso · participação por matrícula.'}
          </span>
          <div className="ballot-audio-actions">
            <button
              className="text-button"
              onClick={() => {
                setSound(true);
                void urnaSound.confirm();
              }}
            >
              Testar som
            </button>
            <button
              className="text-button"
              onClick={() => {
                if (!sound) urnaSound.unlock();
                setSound((x) => !x);
              }}
            >
              {sound ? <Volume2 size={17} /> : <VolumeX size={17} />} Som{' '}
              {sound ? 'ligado' : 'desligado'}
            </button>
          </div>
        </div>
      </main>
      <Credit />
    </div>
  );
}

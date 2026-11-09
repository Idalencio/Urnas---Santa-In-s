'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Download, Check, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { Field } from './components';
import { auth } from './security-client';
export function SecuritySettings() {
  const [status, setStatus] = useState<{ enabled: boolean; remaining: number } | null>(null),
    [pending, setPending] = useState<any>(null),
    [qr, setQr] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [mode, setMode] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    auth('mfaStatus')
      .then((s) => {
        if (live) setStatus(s);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  const reset = () => {
    setPending(null);
    setQr('');
    setMode('');
    setCode('');
    setPassword('');
  };
  return (
    <section className="panel security-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <ShieldCheck size={22} /> Proteção em duas etapas
          </h2>
          <p>Um segundo código para proteger o acesso à sua conta.</p>
        </div>
        <span className={'security-badge ' + (status?.enabled ? 'enabled' : '')}>
          {status ? (status.enabled ? 'Ativa' : 'Ainda não ativada') : 'Carregando…'}
        </span>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="info-banner" role="status">
          {message}
        </div>
      )}
      {!status ? (
        <button
          className="button secondary"
          onClick={async () => {
            setError('');
            try {
              setStatus(await auth('mfaStatus'));
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          Carregar segurança
        </button>
      ) : (
        <>
          {codes.length > 0 ? (
            <div className="security-recovery">
              <h3>
                <KeyRound size={20} /> Guarde seus códigos de recuperação
              </h3>
              <p>
                Eles aparecem somente agora. Cada código pode ser usado uma vez se você perder o
                autenticador. Guarde em local seguro, separado da senha.
              </p>
              <div className="recovery-grid">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <div className="form-footer">
                <button
                  className="button secondary"
                  onClick={() => {
                    const blob = new Blob(
                        [
                          'Santa Inês · códigos de recuperação\n\n' +
                            codes.join('\n') +
                            '\n\nCada código funciona uma única vez.',
                        ],
                        { type: 'text/plain;charset=utf-8' },
                      ),
                      url = URL.createObjectURL(blob),
                      a = document.createElement('a');
                    a.href = url;
                    a.download = 'santa-ines-codigos-recuperacao.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={18} /> Baixar códigos
                </button>
                <button className="button primary" onClick={() => setCodes([])}>
                  <Check size={18} /> Já guardei os códigos
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="security-explanation">
                <Smartphone size={30} />
                <div>
                  <h3>
                    {status.enabled
                      ? 'Sua conta tem uma proteção extra'
                      : 'Ative no seu aplicativo autenticador'}
                  </h3>
                  <p>
                    {status.enabled
                      ? `${status.remaining} códigos de recuperação disponíveis. Alterações nesta proteção encerram as outras sessões.`
                      : 'Use um aplicativo autenticador para gerar os códigos. A proteção só começa depois que você confirmar a configuração.'}
                  </p>
                </div>
              </div>
              {!mode && !pending && (
                <div className="form-footer">
                  {!status.enabled ? (
                    <button
                      className="button primary"
                      onClick={() => {
                        setMode('mfaBegin');
                        setError('');
                        setMessage('');
                      }}
                    >
                      Ativar proteção
                    </button>
                  ) : (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setMode('mfaRecovery');
                          setMessage('');
                        }}
                      >
                        Renovar códigos de recuperação
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setMode('mfaDisable');
                          setMessage('');
                        }}
                      >
                        Desativar proteção
                      </button>
                    </>
                  )}
                </div>
              )}
              {(mode || pending) && (
                <form
                  className="editor-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    setMessage('');
                    try {
                      const action = pending ? 'mfaConfirm' : mode;
                      const r = await auth(action, { currentPassword: password, code });
                      if (action === 'mfaBegin') {
                        setPending(r);
                        setQr(
                          await QRCode.toDataURL(r.uri, {
                            width: 240,
                            margin: 3,
                            errorCorrectionLevel: 'M',
                          }),
                        );
                        setMode('');
                      } else {
                        setStatus({ enabled: r.enabled, remaining: r.remaining });
                        setCodes(r.codes || []);
                        setMessage(
                          r.enabled
                            ? 'Proteção atualizada. As outras sessões foram encerradas.'
                            : 'Proteção em duas etapas desativada.',
                        );
                        reset();
                      }
                    } catch (e: any) {
                      setError(e.message);
                      setCode('');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {pending && (
                    <div className="security-enrollment">
                      <div>
                        {qr && (
                          <img
                            width={240}
                            height={240}
                            src={qr}
                            alt="QR code para configurar seu autenticador"
                          />
                        )}
                      </div>
                      <div>
                        <h3>1. Adicione ao autenticador</h3>
                        <p>Leia o QR code. Se preferir, digite esta chave no aplicativo:</p>
                        <code className="authenticator-secret">{pending.secret}</code>
                        <h3>2. Confirme o código</h3>
                        <p>
                          Digite os seis números exibidos no aplicativo. Esta configuração expira em
                          10 minutos.
                        </p>
                      </div>
                    </div>
                  )}
                  {mode === 'mfaDisable' && (
                    <p>Confirme sua senha e um código para desativar a proteção em duas etapas.</p>
                  )}
                  {mode === 'mfaRecovery' && (
                    <p>
                      Os códigos antigos serão cancelados. Confirme sua senha e um código para gerar
                      outros.
                    </p>
                  )}
                  <Field label="Senha atual">
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {(pending || mode !== 'mfaBegin') && (
                    <Field
                      label={
                        pending
                          ? 'Código do autenticador'
                          : 'Código do autenticador ou de recuperação'
                      }
                    >
                      <input
                        required
                        autoComplete="one-time-code"
                        inputMode={pending ? 'numeric' : 'text'}
                        maxLength={40}
                        value={code}
                        onChange={(e) => setCode(e.target.value.trim())}
                      />
                    </Field>
                  )}
                  <div className="form-footer">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={reset}
                    >
                      Cancelar
                    </button>
                    <button className="button primary" disabled={busy}>
                      {busy
                        ? 'Verificando…'
                        : pending
                          ? 'Confirmar ativação'
                          : mode === 'mfaBegin'
                            ? 'Configurar autenticador'
                            : 'Confirmar'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

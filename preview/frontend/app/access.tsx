'use client';
import { useState } from 'react';
import { ArrowRight, Check, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Field } from './components';
import { responseData } from './http';
async function auth(action: string, payload: any) {
  const result = await responseData(
    await fetch('/api/auth', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '',
      },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
  if (result.panelKey) sessionStorage.setItem('urna_panel_key', result.panelKey);
  return result;
}
export function Login({
  onReady,
  designVariant = true,
}: {
  onReady: () => Promise<void>;
  designVariant?: boolean;
}) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="access-card">
      <div className="access-brand">
        <img src={designVariant ? '/csi-logo.png' : '/school-mark.png'} alt="Colégio Santa Inês" />
        <span>
          Santa Inês<strong>Urna escolar</strong>
        </span>
      </div>
      <div className="access-symbol">
        <LockKeyhole size={27} />
      </div>
      <h2>Entre no seu painel</h2>
      <p>Use seu usuário e senha para acessar as funções liberadas pela escola.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await auth('login', { username, password });
            setPassword('');
            await onReady();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <Field label="Usuário">
          <input
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={80}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Digite seu usuário"
          />
        </Field>
        <Field label="Senha">
          <input
            type="password"
            required
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite sua senha"
          />
        </Field>
        <button className="button primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'} <ArrowRight size={18} />
        </button>
      </form>
      <small>Esqueceu a senha? Entre em contato com o responsável de TI da escola.</small>
    </div>
  );
}
export function AccountSettings({
  username = 'admin',
  name = 'Administrador da escola',
}: {
  username?: string;
  name?: string;
}) {
  const [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState(''),
    [confirmPassword, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            <ShieldCheck size={22} /> {name}
          </h2>
          <p>
            Usuário: <strong>{username}</strong>.
          </p>
        </div>
      </div>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setError('');
          setMessage('');
          if (newPassword !== confirmPassword) {
            setError('As novas senhas precisam ser iguais.');
            return;
          }
          setBusy(true);
          try {
            await auth('password', { currentPassword, newPassword, confirmPassword });
            setCurrent('');
            setNew('');
            setConfirm('');
            setMessage('Senha alterada. As outras sessões foram encerradas.');
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>Alterar senha</p>
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
        <Field label="Senha atual">
          <input
            required
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="Nova senha" hint="Use pelo menos 10 caracteres.">
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </Field>
        <Field label="Repita a nova senha">
          <input
            required
            type="password"
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div className="form-footer">
          <button className="button primary" disabled={busy}>
            <Check size={18} />
            {busy ? 'Salvando…' : 'Alterar senha'}
          </button>
        </div>
      </form>
    </section>
  );
}

import { useState } from 'react';
import { Check, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { Badge, Field, Modal } from '../app/components';
import { ClassPicker, type SchoolClass } from './people';
import { PageHeading } from './workflow';
export type TeamAccount = {
  id: string;
  name: string;
  username: string;
  role: string;
  active: number;
  owner: number;
  permissions: string[];
  classes: string[] | null;
  electionIds: string[];
};
export const electionPermissions = [
  'manageElections',
  'manageVoters',
  'publishElections',
  'viewResults',
];
export const allowed = (me: TeamAccount | undefined, key: string) =>
  !!me && (me.role === 'admin' || me.permissions?.includes(key));
function AccountForm({
  value,
  me,
  classes,
  busy,
  save,
  cancel,
}: {
  value?: TeamAccount;
  me: TeamAccount;
  classes: SchoolClass[];
  busy: boolean;
  save: (v: any) => Promise<void>;
  cancel: () => void;
}) {
  const [v, setV] = useState<any>(
      value
        ? { ...value, password: '' }
        : {
            name: '',
            username: '',
            password: '',
            role: 'staff',
            active: 1,
            permissions: electionPermissions,
            classes: [],
            electionIds: [],
          },
    ),
    [error, setError] = useState('');
  const protectedAccount = !!value && (!!value.owner || value.id === me.id),
    change = (k: string, x: any) => setV((old: any) => ({ ...old, [k]: x }));
  return (
    <form
      className="editor-form team-account-form"
      aria-busy={busy}
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (busy) return;
        setError('');
        try {
          await save(v);
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
      <div className="team-account-fields">
        <Field label="Nome">
          <input
            required
            maxLength={160}
            autoComplete="off"
            value={v.name}
            onChange={(ev) => change('name', ev.target.value)}
          />
        </Field>
        <Field label="Usuário">
          <input
            required
            pattern="[a-z0-9][a-z0-9._-]{2,79}"
            minLength={3}
            maxLength={80}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={!!value?.owner}
            value={v.username}
            onChange={(ev) => change('username', ev.target.value.toLowerCase())}
          />
        </Field>
      </div>
      <div className="team-account-fields team-account-credentials">
        <Field
          label={value ? 'Nova senha (opcional)' : 'Senha de acesso'}
          hint={value ? 'Deixe em branco para manter a senha.' : 'Use pelo menos 10 caracteres.'}
        >
          <input
            type="password"
            required={!value}
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            value={v.password}
            onChange={(ev) => change('password', ev.target.value)}
          />
        </Field>
        <Field label="Tipo de acesso">
          <select
            value={v.role}
            disabled={protectedAccount}
            onChange={(ev) => change('role', ev.target.value)}
          >
            <option value="staff">Equipe</option>
            <option value="admin">Administrador</option>
          </select>
        </Field>
      </div>
      {v.role === 'admin' ? (
        <p className="team-admin-note">
          Acesso completo a eleições, alunos, turmas, usuários e histórico.
        </p>
      ) : (
        <>
          <fieldset className="team-permissions">
            <legend>Permissões nas eleições</legend>
            <label>
              <input
                type="checkbox"
                checked={v.permissions.some((p: string) =>
                  electionPermissions.slice(0, 3).includes(p),
                )}
                onChange={(ev) =>
                  change('permissions', ev.target.checked ? electionPermissions : ['viewResults'])
                }
              />
              <span>
                <strong>Criar e gerenciar próprias eleições</strong>
                <small>
                  Inclui candidatos, seleção de eleitores, agendamento, abertura, encerramento e
                  resultados.
                </small>
              </span>
            </label>
            <p className="team-scope-hint">
              Cada pessoa vê apenas as eleições que criou. Administradores têm acesso a todas.
            </p>
            <p className="team-roster-note">
              Somente administradores podem importar listas ou alterar o cadastro de alunos.
            </p>
          </fieldset>
          <fieldset className="team-class-scope">
            <legend>Turmas disponíveis</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={v.classes === null}
                onChange={(ev) => change('classes', ev.target.checked ? null : [])}
              />
              Todas as turmas
            </label>
            <p className="team-scope-hint">
              {v.classes === null
                ? 'Inclui as turmas cadastradas futuramente.'
                : 'Selecione as turmas que esta pessoa poderá usar nas eleições.'}
            </p>
            {v.classes !== null && (
              <ClassPicker
                options={classes}
                emptyText="Ainda não há turmas cadastradas."
                value={v.classes}
                onChange={(x) => change('classes', x)}
              />
            )}
          </fieldset>
        </>
      )}
      {value && !protectedAccount && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!v.active}
            onChange={(ev) => change('active', ev.target.checked ? 1 : 0)}
          />
          Conta ativa
        </label>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
        <button className="button primary" disabled={busy}>
          <Check size={17} />
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
export function TeamPanel({
  accounts,
  me,
  classes,
  busy,
  save,
}: {
  accounts: TeamAccount[];
  me: TeamAccount;
  classes: SchoolClass[];
  busy: boolean;
  save: (v: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState<TeamAccount | null | undefined>(undefined);
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO"
        title="Acessos"
        description="Usuários com acesso ao painel de eleições."
        icon={<ShieldCheck size={25} />}
        action={
          <button className="button primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Novo acesso
          </button>
        }
      />
      <div className="team-list">
        {accounts.map((a) => (
          <article key={a.id}>
            <span className="team-avatar" aria-hidden="true">
              {a.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{a.name}</h2>
              <p>
                {a.username} ·{' '}
                {a.role === 'admin'
                  ? 'Administrador'
                  : a.classes === null
                    ? 'Todas as turmas'
                    : a.classes.length +
                      (a.classes.length === 1 ? ' turma liberada' : ' turmas liberadas')}
              </p>
            </div>
            <Badge tone={!a.active ? 'neutral' : a.role === 'admin' ? 'blue' : 'green'}>
              {!a.active ? 'Desativado' : a.role === 'admin' ? 'Administrador' : 'Equipe'}
            </Badge>
            <button
              className="icon-button"
              aria-label={'Editar acesso de ' + a.name}
              onClick={() => setEditing(a)}
            >
              <Pencil size={17} />
            </button>
          </article>
        ))}
      </div>
      {editing !== undefined && (
        <Modal
          wide
          title={editing ? 'Editar acesso' : 'Novo acesso'}
          onClose={() => !busy && setEditing(undefined)}
        >
          <AccountForm
            value={editing || undefined}
            me={me}
            classes={classes}
            busy={busy}
            cancel={() => setEditing(undefined)}
            save={async (v) => {
              await save(v);
              setEditing(undefined);
            }}
          />
        </Modal>
      )}
    </>
  );
}

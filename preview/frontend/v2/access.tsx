import { useState } from 'react';
import { Check, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { Badge, Field, Modal } from '../app/components';
import { ClassPicker, type SchoolClass } from './people';
import { PageHeading } from './workflow';
import type { Election } from './domain';
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
export const permissions = [
  {
    id: 'manageElections',
    label: 'Criar e editar eleições',
    text: 'Nome, candidatos, fotos e cópias.',
  },
  {
    id: 'manageVoters',
    label: 'Escolher turmas e gerenciar eleitores',
    text: 'Lista de eleitores, títulos e liberações.',
  },
  {
    id: 'publishElections',
    label: 'Publicar e encerrar eleições',
    text: 'Modelos de urna e período de votação.',
  },
  {
    id: 'viewResults',
    label: 'Consultar e exportar resultados',
    text: 'Apuração das eleições permitidas.',
  },
];
export const allowed = (me: TeamAccount | undefined, key: string) =>
  !!me && (me.role === 'admin' || me.permissions?.includes(key));
function AccountForm({
  value,
  me,
  classes,
  elections,
  busy,
  save,
}: {
  value?: TeamAccount;
  me: TeamAccount;
  classes: SchoolClass[];
  elections: Election[];
  busy: boolean;
  save: (v: any) => Promise<void>;
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
            permissions: ['manageElections', 'manageVoters'],
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
      <Field
        label={value ? 'Nova senha (opcional)' : 'Senha de acesso'}
        hint={
          value
            ? 'Preencha para redefinir a senha e encerrar as sessões desta conta.'
            : 'Use pelo menos 10 caracteres.'
        }
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
          <option value="staff">Equipe · acesso definido pelo administrador</option>
          <option value="admin">Administrador · acesso completo</option>
        </select>
      </Field>
      {v.role === 'admin' ? (
        <p className="info-banner">Administradores gerenciam todas as turmas, eleições e contas.</p>
      ) : (
        <>
          <fieldset className="team-permissions">
            <legend>O que esta pessoa pode fazer?</legend>
            {permissions.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={v.permissions.includes(p.id)}
                  onChange={(ev) =>
                    change(
                      'permissions',
                      ev.target.checked
                        ? [...v.permissions, p.id]
                        : v.permissions.filter((x: string) => x !== p.id),
                    )
                  }
                />
                <span>
                  <strong>{p.label}</strong>
                  <small>{p.text}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="team-class-scope">
            <legend>Turmas permitidas</legend>
            <label className="check-row">
              <input
                type="checkbox"
                checked={v.classes === null}
                onChange={(ev) => change('classes', ev.target.checked ? null : [])}
              />
              Todas as turmas, incluindo futuras importações
            </label>
            {v.classes !== null && (
              <ClassPicker
                options={classes}
                value={v.classes}
                onChange={(x) => change('classes', x)}
              />
            )}
          </fieldset>
          <details className="simple-details">
            <summary>Liberar eleições já existentes ({v.electionIds.length})</summary>
            <p className="simple-hint">
              A pessoa acessa as eleições que criou. Selecione outras que também poderá gerenciar
              com as permissões acima.
            </p>
            <div className="team-election-grants">
              {elections.map((e) => (
                <label key={e.id}>
                  <input
                    type="checkbox"
                    checked={v.electionIds.includes(e.id)}
                    onChange={(ev) =>
                      change(
                        'electionIds',
                        ev.target.checked
                          ? [...v.electionIds, e.id]
                          : v.electionIds.filter((x: string) => x !== e.id),
                      )
                    }
                  />
                  {e.name}
                </label>
              ))}
            </div>
          </details>
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
        <button className="button primary" disabled={busy}>
          <Check size={17} />
          {busy ? 'Salvando…' : 'Salvar acesso'}
        </button>
      </div>
    </form>
  );
}
export function TeamPanel({
  accounts,
  me,
  classes,
  elections,
  busy,
  save,
}: {
  accounts: TeamAccount[];
  me: TeamAccount;
  classes: SchoolClass[];
  elections: Election[];
  busy: boolean;
  save: (v: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState<TeamAccount | null | undefined>(undefined);
  return (
    <>
      <PageHeading
        eyebrow="EQUIPE E PERMISSÕES"
        title="Acessos"
        description="Cada pessoa com as turmas e permissões de que precisa."
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
            elections={elections}
            busy={busy}
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

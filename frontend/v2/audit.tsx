import { useEffect, useState } from 'react';
import { History, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { responseData } from '../app/http';
import { PageHeading } from './workflow';
const ACTIONS: Record<string, string> = {
  login: 'Entrada no painel',
  mfaBegin: 'Configuração de autenticador iniciada',
  password: 'Senha alterada',
  securityUpdated: 'Proteções de dados atualizadas',
  mfaConfirm: 'Proteção em duas etapas ativada',
  mfaRecovery: 'Códigos de recuperação renovados',
  mfaDisable: 'Proteção em duas etapas desativada',
  mfaReset: 'Proteção redefinida pela T.I.',
  election: 'Eleição salva',
  candidate: 'Candidato salvo',
  terminal: 'Urna salva',
  account: 'Acesso atualizado',
  student: 'Aluno salvo',
  deleteStudent: 'Aluno removido',
  renameClass: 'Turma renomeada',
  csvImport: 'Lista importada',
  enroll: 'Eleitores selecionados',
  publish: 'Eleição publicada',
  close: 'Eleição encerrada',
  duplicate: 'Eleição duplicada',
  deleteElection: 'Eleição excluída',
  unlock: 'Liberação cancelada',
  image: 'Imagem adicionada',
};
export default function AuditPanel({ elections, accounts }: { elections: any[]; accounts: any[] }) {
  const [filter, setFilter] = useState({ action: '', actor: '', election: '', from: '', to: '' }),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0),
    [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError('');
    const params = new URLSearchParams({ ...filter, offset: String(offset) });
    fetch('/api/v2/audit?' + params, {
      credentials: 'same-origin',
      headers: { 'X-Urna-Panel': sessionStorage.getItem('urna_panel_key') || '' },
      signal: c.signal,
    })
      .then(responseData)
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [filter, offset, reload]);
  const change = (key: string, value: string) => {
    setOffset(0);
    setFilter((f) => ({ ...f, [key]: value }));
  };
  return (
    <div className="audit-page">
      <PageHeading
        eyebrow="ADMINISTRAÇÃO"
        title="Histórico de atividades"
        description="Acompanhe as alterações e os acessos administrativos da escola."
        icon={<History size={26} />}
        action={
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setReload((x) => x + 1)}
          >
            <RefreshCw size={17} /> Atualizar
          </button>
        }
      />
      <section className="panel">
        <div className="audit-filters">
          <label>
            Ação
            <select value={filter.action} onChange={(e) => change('action', e.target.value)}>
              <option value="">Todas as ações</option>
              {Object.entries(ACTIONS)
                .filter(([id]) => !id.startsWith('mfa'))
                .map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Responsável
            <select value={filter.actor} onChange={(e) => change('actor', e.target.value)}>
              <option value="">Todos</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Eleição
            <select value={filter.election} onChange={(e) => change('election', e.target.value)}>
              <option value="">Todas, incluindo excluídas</option>
              {elections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            De (UTC)
            <input
              type="date"
              value={filter.from}
              onChange={(e) => change('from', e.target.value)}
            />
          </label>
          <label>
            Até (UTC)
            <input type="date" value={filter.to} onChange={(e) => change('to', e.target.value)} />
          </label>
        </div>
        <p className="audit-note">
          O histórico começa com esta atualização. Registros de votação e escolhas dos eleitores não
          fazem parte dele.
        </p>
        {error && (
          <div role="alert" className="error-banner">
            {error}
          </div>
        )}
        {busy ? (
          <p role="status">Carregando histórico…</p>
        ) : (
          !error && (
            <>
              {!data?.rows?.length ? (
                <div className="security-explanation">
                  <History size={28} />
                  <div>
                    <h3>Nenhuma atividade encontrada</h3>
                    <p>
                      As próximas alterações aparecerão aqui. Você também pode ajustar os filtros.
                    </p>
                  </div>
                </div>
              ) : (
                <ol className="audit-list">
                  {data.rows.map((r: any) => (
                    <li key={r.id}>
                      <span className="audit-icon">
                        <History size={18} />
                      </span>
                      <div>
                        <strong>{ACTIONS[r.action] || r.action}</strong>
                        <p>
                          {r.actorName}{' '}
                          <span>· {new Date(r.occurredAt).toLocaleString('pt-BR')}</span>
                        </p>
                        {r.targetId && <small>Registro: {r.targetId}</small>}
                        {r.details.summary && (
                          <small>
                            {Object.entries(r.details.summary)
                              .map(
                                ([k, v]) =>
                                  `${({ added: 'Novos', updated: 'Atualizados', unchanged: 'Sem alteração', reactivated: 'Reativados' } as any)[k] || k}: ${v}`,
                              )
                              .join(' · ')}
                          </small>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div className="audit-pagination">
                <span>
                  {data?.total || 0} registros
                  {data?.total > 0 ? ` · ${offset + 1}–${Math.min(offset + 50, data.total)}` : ''}
                </span>
                <div>
                  <button
                    className="button secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - 50))}
                  >
                    <ChevronLeft size={16} /> Anterior
                  </button>
                  <button
                    className="button secondary"
                    disabled={!data || offset + 50 >= data.total}
                    onClick={() => setOffset(offset + 50)}
                  >
                    Próxima <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )
        )}
      </section>
    </div>
  );
}

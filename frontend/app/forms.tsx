'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  ImagePlus,
  X,
  CalendarDays,
  UserRound,
  Monitor,
  Plus,
  Play,
  Keyboard,
  Images,
} from 'lucide-react';
import { Field, ModelPicker, ModelPreview, localInput, formatted, Empty } from './components';
import { status, candidateNumber, type Data, type Candidate } from './domain';

type EditorProps = {
  kind: string;
  value?: any;
  data: Data;
  busy: boolean;
  save: (action: string, value: any) => Promise<void>;
  upload: (file: File) => Promise<string>;
  onCancel?: () => void;
};
export function Editor({ kind, value, data, busy, save, upload, onCancel }: EditorProps) {
  const [v, setV] = useState<any>({
    name: '',
    code: '',
    image: '',
    location: '',
    model: 'standard',
    active: 1,
    terminalId: '',
    ...value,
    ...(kind === 'candidate' && value?.code ? { code: candidateNumber(value.code) } : {}),
  });
  const [error, setError] = useState(''),
    [uploading, setUploading] = useState(false),
    [fileName, setFileName] = useState('');
  const change = (key: string, val: any) => setV((current: any) => ({ ...current, [key]: val }));
  const usedCodes = new Set(
    data.candidates
      .filter((c) => c.terminalId === v.terminalId && c.id !== v.id)
      .map((c) => c.code),
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const next = kind === 'candidate' ? { ...v, code: v.code.padStart(2, '0') } : v;
    if (!next.name.trim()) {
      setError('Informe um nome para continuar.');
      return;
    }
    if (kind === 'candidate') {
      if (!v.terminalId) {
        setError('Escolha a urna deste candidato.');
        return;
      }
      if (!/^0[0-9]$/.test(next.code) || !v.code) {
        setError('Escolha um número de 0 a 9.');
        return;
      }
      if (usedCodes.has(next.code)) {
        setError('Esse número já está em uso nesta urna. Você pode usá-lo em outra urna.');
        return;
      }
    }
    try {
      await save(kind, next);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function picture(file?: File) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const image = await upload(file);
      change('image', image);
      setFileName(file.name);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <form onSubmit={submit} className="editor-form">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {kind === 'candidate' && (
        <Field
          label="Urna do candidato *"
          hint="Cada urna tem seus próprios personagens. Os números podem se repetir em outra urna."
        >
          <select
            aria-label="Urna do candidato"
            required
            value={v.terminalId}
            disabled={!!value?.id && !!value?.terminalId}
            onChange={(e) => {
              change('terminalId', e.target.value);
              change('code', '');
            }}
          >
            <option value="">Escolha a urna</option>
            {data.terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={kind === 'terminal' ? 'Nome da urna *' : 'Nome *'}>
        <input
          required
          autoFocus
          maxLength={160}
          value={v.name}
          placeholder={
            kind === 'terminal'
              ? 'Ex.: Urna da biblioteca'
              : kind === 'candidate'
                ? 'Ex.: Nome do personagem'
                : 'Nome do responsável'
          }
          onChange={(e) => change('name', e.target.value)}
        />
      </Field>
      {kind === 'candidate' && (
        <>
          <div className="candidate-number-field">
            <Field
              label="Número do candidato *"
              hint="Use 1, 2, 3… Na urna padrão, o 0 continua preenchido automaticamente."
            >
              <input
                required
                aria-label="Número do candidato"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                value={v.code}
                placeholder="Ex.: 1"
                onChange={(e) => change('code', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <div className="number-options" aria-label="Números disponíveis nesta urna">
              {Array.from({ length: 10 }, (_, i) => String(i)).map((code) => (
                <button
                  type="button"
                  key={code}
                  aria-pressed={v.code === code}
                  aria-label={
                    'Escolher número ' +
                    code +
                    (usedCodes.has(code.padStart(2, '0')) ? ' · já utilizado nesta urna' : '')
                  }
                  disabled={!v.terminalId || usedCodes.has(code.padStart(2, '0'))}
                  className={v.code === code ? 'selected' : ''}
                  onClick={() => change('code', code)}
                >
                  {code}
                </button>
              ))}
            </div>
            <small>
              {v.terminalId
                ? 'Números desabilitados já estão em uso nesta urna.'
                : 'Escolha a urna para ver os números disponíveis.'}
            </small>
          </div>
          <div className="field">
            <span>Foto ou desenho</span>
            <div className="picture-upload">
              <label className={'image-upload ' + (v.image ? 'has-picture' : '')}>
                <div className="upload-preview">
                  {v.image ? (
                    <img src={v.image} alt="Prévia do candidato" />
                  ) : (
                    <ImagePlus size={34} />
                  )}
                </div>
                <div>
                  <strong>
                    {uploading
                      ? 'Enviando imagem…'
                      : v.image
                        ? 'Trocar imagem'
                        : 'Adicionar desenho'}
                  </strong>
                  <p>{fileName || 'Escolha um arquivo no dispositivo'}</p>
                  <small>PNG, JPG ou WebP · até 2 MB</small>
                </div>
                <span className="upload-control">
                  <Upload size={18} />
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    void picture(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                  disabled={uploading}
                />
              </label>
              {v.image && (
                <button
                  type="button"
                  className="text-button muted"
                  disabled={uploading}
                  onClick={() => {
                    change('image', '');
                    setFileName('');
                  }}
                >
                  <X size={15} /> Remover imagem
                </button>
              )}
            </div>
            <small>
              A imagem é necessária para a urna infantil. Na urna padrão, ela aparece depois do
              número.
            </small>
          </div>
        </>
      )}
      {kind === 'terminal' && (
        <>
          <Field label="Localização" hint="Opcional. Ajuda a identificar onde a urna será usada.">
            <input
              value={v.location}
              maxLength={160}
              onChange={(e) => change('location', e.target.value)}
              placeholder="Ex.: Biblioteca ou sala 12"
            />
          </Field>
          <div className="field">
            <span>Modelo da urna *</span>
            <ModelPicker value={v.model} onChange={(model) => change('model', model)} />
          </div>
        </>
      )}
      {kind === 'candidate' && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!v.active}
            onChange={(e) => change('active', e.target.checked ? 1 : 0)}
          />
          Disponível para participar das votações
        </label>
      )}
      <div className="form-footer">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={busy || uploading}
        >
          Cancelar
        </button>
        <button className="button primary" disabled={busy || uploading}>
          <Check size={19} />
          {uploading
            ? 'Enviando imagem…'
            : busy
              ? 'Salvando…'
              : 'Salvar ' + ({ candidate: 'candidato', terminal: 'urna' } as any)[kind]}
        </button>
      </div>
    </form>
  );
}

type ElectionProps = {
  data: Data;
  busy: boolean;
  save: (value: any) => Promise<void>;
  onCancel?: () => void;
  onAddCandidate?: (terminalId: string) => void;
  onEditCandidate?: (candidate: Candidate) => void;
  initialTerminalId?: string;
};
export function ElectionEditor({
  data,
  busy,
  save,
  onCancel,
  onAddCandidate,
  onEditCandidate,
  initialTerminalId,
}: ElectionProps) {
  const [step, setStep] = useState(0),
    [error, setError] = useState('');
  const [v, setV] = useState({
    name: '',
    terminalId: initialTerminalId || '',
    candidateIds: initialTerminalId
      ? data.candidates
          .filter(
            (c) =>
              c.terminalId === initialTerminalId &&
              c.active &&
              (data.terminals.find((t) => t.id === initialTerminalId)?.model !== 'images' ||
                c.image),
          )
          .map((c) => c.id)
      : ([] as string[]),
  });
  const [scheduled, setScheduled] = useState(false),
    [hours, setHours] = useState('3');
  const [startsAt, setStartsAt] = useState(localInput(new Date(Date.now() + 3600000))),
    [endsAt, setEndsAt] = useState(localInput(new Date(Date.now() + 14400000)));
  const knownCandidates = useRef(new Set(data.candidates.map((c) => c.id)));
  const terminal = data.terminals.find((t) => t.id === v.terminalId);
  const urnCandidates = data.candidates.filter((c) => c.terminalId === v.terminalId);
  const candidates = urnCandidates.filter((c) => c.active);
  const needsImage = terminal?.model === 'images';
  const eligible = candidates.filter((c) => !needsImage || c.image);
  const picked = eligible.filter((c) => v.candidateIds.includes(c.id));
  const occupied =
    terminal && data.elections.find((e) => e.terminalId === terminal.id && status(e) === 'active');
  const periodValid =
    !scheduled ||
    (Number.isFinite(Date.parse(startsAt)) &&
      Number.isFinite(Date.parse(endsAt)) &&
      Date.parse(endsAt) > Date.parse(startsAt) &&
      Date.parse(endsAt) > Date.now());
  const ready =
    !!v.name.trim() && !!terminal && picked.length > 0 && periodValid && (scheduled || !occupied);
  useEffect(() => {
    const fresh = data.candidates
      .filter(
        (c) =>
          c.terminalId === v.terminalId &&
          c.active &&
          (!needsImage || c.image) &&
          !knownCandidates.current.has(c.id),
      )
      .map((c) => c.id);
    knownCandidates.current = new Set(data.candidates.map((c) => c.id));
    setV((current) => ({
      ...current,
      candidateIds: Array.from(new Set([...current.candidateIds, ...fresh])).filter((id) =>
        data.candidates.some(
          (c) =>
            c.id === id &&
            c.terminalId === current.terminalId &&
            c.active &&
            (!needsImage || c.image),
        ),
      ),
    }));
  }, [data.candidates, needsImage, v.terminalId]);
  function chooseTerminal(terminalId: string) {
    const images = data.terminals.find((t) => t.id === terminalId)?.model === 'images';
    setV((current) => ({
      ...current,
      terminalId,
      candidateIds: data.candidates
        .filter((c) => c.terminalId === terminalId && c.active && (!images || c.image))
        .map((c) => c.id),
    }));
    setError('');
  }
  function choose(id: string) {
    setV((current) => ({
      ...current,
      candidateIds: current.candidateIds.includes(id)
        ? current.candidateIds.filter((x) => x !== id)
        : [...current.candidateIds, id],
    }));
  }
  function move(next: number) {
    setError('');
    setStep(next);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < 2) return;
    setError('');
    if (!ready) {
      setError(
        occupied && !scheduled
          ? 'Esta urna está em uso. Escolha outra ou agende um horário.'
          : !picked.length
            ? 'Selecione pelo menos um candidato.'
            : 'Preencha o nome e confira os horários.',
      );
      return;
    }
    const start = scheduled ? new Date(startsAt) : new Date();
    const end = scheduled ? new Date(endsAt) : new Date(start.getTime() + Number(hours) * 3600000);
    try {
      await save({
        ...v,
        candidateIds: picked.map((c) => c.id),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <form className="preparation" onSubmit={submit}>
      <ol className="preparation-steps" aria-label="Etapas da configuração">
        {['Escolher urna', 'Candidatos', 'Revisar e abrir'].map((title, i) => (
          <li
            key={title}
            aria-current={step === i ? 'step' : undefined}
            className={step === i ? 'current' : step > i ? 'complete' : ''}
          >
            <button type="button" disabled={i > step || busy} onClick={() => move(i)}>
              <span>{step > i ? <Check size={18} /> : i + 1}</span>
              <strong>{title}</strong>
            </button>
          </li>
        ))}
      </ol>
      <div className="preparation-body">
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="preparation-heading">
          <p className="eyebrow">PASSO {step + 1} DE 3</p>
          <h2>
            {
              [
                'Como a turma vai votar?',
                'Quem a turma poderá escolher?',
                'Confira e abra a votação',
              ][step]
            }
          </h2>
          <p>
            {
              [
                'As urnas já estão prontas. Escolha o modelo para a idade das crianças.',
                'Cadastre os personagens desta urna. Os números 1, 2 e 3 também podem ser usados em outra urna.',
                'Dê um nome à votação. Ao concluir, você poderá abrir a urna neste iPad.',
              ][step]
            }
          </p>
        </div>
        {step === 0 && (
          <>
            <div className="preparation-models">
              {data.terminals.map((t) => {
                const current = data.elections.find(
                  (e) => e.terminalId === t.id && status(e) === 'active',
                );
                return (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={v.terminalId === t.id}
                    className={v.terminalId === t.id ? 'selected' : ''}
                    onClick={() => chooseTerminal(t.id)}
                  >
                    <div className="preparation-model-heading">
                      {t.model === 'images' ? <Images size={22} /> : <Keyboard size={22} />}
                      <span>{t.model === 'images' ? 'Para os pequenos' : 'Para os maiores'}</span>
                      <span className="radio-mark">
                        {v.terminalId === t.id && <Check size={15} />}
                      </span>
                    </div>
                    <div className="preparation-model-preview">
                      <ModelPreview model={t.model} />
                    </div>
                    <h3>{t.name}</h3>
                    <p>
                      {t.model === 'images'
                        ? 'Todos os desenhos na tela. A criança toca no favorito.'
                        : 'O 0 vem preenchido. A criança digita o último número.'}
                    </p>
                    {current ? (
                      <small className="model-occupied">
                        Em uso até {formatted(current.endsAt)}. Escolha outra ou agende.
                      </small>
                    ) : (
                      <small>Modelo pronto para usar</small>
                    )}
                  </button>
                );
              })}
            </div>
            {!data.terminals.length && (
              <Empty
                title="Não foi possível carregar as urnas"
                text="Atualize os dados do painel e tente novamente."
              />
            )}
            <a
              className="text-button preparation-test"
              href="/testar"
              target="_blank"
              rel="noopener"
            >
              <Play size={17} /> Testar os modelos antes de escolher
            </a>
          </>
        )}
        {step === 1 && (
          <>
            <div className="preparation-candidate-tools">
              <span>
                <b>{picked.length}</b>{' '}
                {picked.length === 1 ? 'candidato selecionado' : 'candidatos selecionados'}
              </span>
              <button
                type="button"
                className="button primary"
                onClick={() => onAddCandidate?.(v.terminalId)}
              >
                <Plus size={18} /> Adicionar candidato
              </button>
            </div>
            {!!candidates.length && (
              <>
                <div className="selection-tools">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setV((current) => ({ ...current, candidateIds: eligible.map((c) => c.id) }))
                    }
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    className="text-button muted"
                    onClick={() => setV((current) => ({ ...current, candidateIds: [] }))}
                  >
                    Limpar seleção
                  </button>
                </div>
                {needsImage && candidates.some((c) => !c.image) && (
                  <div className="info-banner">
                    Para a urna infantil, cada candidato precisa de um desenho. Use “Editar” para
                    adicionar a imagem.
                  </div>
                )}
                <div className="preparation-candidates">
                  {candidates.map((c) => (
                    <article
                      key={c.id}
                      className={
                        (v.candidateIds.includes(c.id) ? 'selected ' : '') +
                        (needsImage && !c.image ? 'unavailable' : '')
                      }
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={v.candidateIds.includes(c.id)}
                          onChange={() => choose(c.id)}
                          disabled={!!needsImage && !c.image}
                        />
                        {c.image ? (
                          <img src={c.image} alt={c.name} />
                        ) : (
                          <span className="selection-no-image">
                            <UserRound size={25} />
                          </span>
                        )}
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            Número {candidateNumber(c.code)}
                            {needsImage && !c.image ? ' · adicione o desenho' : ''}
                          </small>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onEditCandidate?.(c)}
                      >
                        Editar
                      </button>
                    </article>
                  ))}
                </div>
              </>
            )}
            {!candidates.length && (
              <Empty
                title="Adicione o primeiro candidato"
                text="Cadastre um personagem nesta urna com número de 0 a 9. Depois de salvar, você volta para este passo."
                action={
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => onAddCandidate?.(v.terminalId)}
                  >
                    <Plus size={18} /> Cadastrar candidato
                  </button>
                }
              />
            )}
            {urnCandidates.some((c) => !c.active) && (
              <details className="inactive-candidates">
                <summary>
                  Candidatos desativados · {urnCandidates.filter((c) => !c.active).length}
                </summary>
                <p>Você pode reativar um personagem já cadastrado usando “Editar”.</p>
                {urnCandidates
                  .filter((c) => !c.active)
                  .map((c) => (
                    <div key={c.id}>
                      <span>
                        {candidateNumber(c.code)} · {c.name}
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => onEditCandidate?.(c)}
                      >
                        Editar
                      </button>
                    </div>
                  ))}
              </details>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <Field
              label="Nome da votação *"
              hint="Use um nome que ajude a identificar a turma ou a escolha."
            >
              <input
                required
                autoFocus
                maxLength={160}
                value={v.name}
                onChange={(e) => setV((current) => ({ ...current, name: e.target.value }))}
                placeholder="Ex.: Mascote do 2º ano"
              />
            </Field>
            <div className="preparation-summary">
              <div>
                <Monitor size={23} />
                <span>
                  <small>URNA ESCOLHIDA</small>
                  <strong>{terminal?.name}</strong>
                </span>
                <button type="button" className="text-button" onClick={() => move(0)}>
                  Trocar
                </button>
              </div>
              <div>
                <UserRound size={23} />
                <span>
                  <small>{picked.length} CANDIDATOS</small>
                  <strong>
                    {picked.map((c) => candidateNumber(c.code) + ' ' + c.name).join(' · ')}
                  </strong>
                </span>
                <button type="button" className="text-button" onClick={() => move(1)}>
                  Alterar
                </button>
              </div>
            </div>
            {occupied && !scheduled && (
              <div className="error-banner" role="alert">
                Esta urna está em uso na votação “{occupied.name}”. Ela fica disponível após{' '}
                {formatted(occupied.endsAt)}. Escolha outra urna ou marque um horário abaixo.
              </div>
            )}
            <div className="start-settings">
              <div>
                <CalendarDays size={22} />
                <span>
                  <strong>{scheduled ? 'Votação agendada' : 'Começar agora'}</strong>
                  <small>
                    {scheduled
                      ? 'A urna abrirá e fechará nos horários escolhidos.'
                      : 'O horário começa a contar quando você concluir.'}
                  </small>
                </span>
              </div>
              {!scheduled && (
                <Field label="Manter a urna aberta por">
                  <select value={hours} onChange={(e) => setHours(e.target.value)}>
                    {[1, 2, 3, 4, 6, 8].map((h) => (
                      <option key={h} value={h}>
                        {h} {h === 1 ? 'hora' : 'horas'}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={scheduled}
                  onChange={(e) => setScheduled(e.target.checked)}
                />{' '}
                Agendar para outro horário
              </label>
              {scheduled && (
                <div className="two-fields">
                  <Field label="Começa em">
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </Field>
                  <Field label="Termina em">
                    <input
                      type="datetime-local"
                      required
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                    />
                  </Field>
                </div>
              )}
              <p>Você também pode encerrar a votação antes pelo painel.</p>
            </div>
          </>
        )}
      </div>
      <div className="preparation-footer">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => (step ? move(step - 1) : onCancel?.())}
        >
          <ArrowLeft size={18} />
          {step ? 'Voltar' : 'Cancelar'}
        </button>
        <small>
          {step === 0
            ? terminal
              ? 'Modelo escolhido. Pode continuar.'
              : 'Escolha um modelo para continuar.'
            : step === 1
              ? picked.length
                ? 'Seleção pronta. Pode continuar.'
                : 'Adicione ou selecione um candidato.'
              : 'Somente votos em candidatos serão registrados.'}
        </small>
        {step < 2 ? (
          <button
            type="button"
            className="button primary"
            disabled={busy || (step === 0 ? !terminal : !picked.length)}
            onClick={() => move(step + 1)}
          >
            Continuar <ArrowRight size={18} />
          </button>
        ) : (
          <button type="submit" className="button primary" disabled={busy || !ready}>
            <Check size={20} />
            {busy ? 'Preparando…' : scheduled ? 'Concluir agendamento' : 'Concluir e preparar urna'}
          </button>
        )}
      </div>
    </form>
  );
}

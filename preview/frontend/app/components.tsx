'use client';
import { X, Check, Vote, Images, Keyboard, ArrowRight } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return (
    <span className={'badge ' + tone}>
      {tone === 'green' && <span className="status-dot" />}
      {children}
    </span>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Vote size={34} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled):not([type=file]),select:not(:disabled),a[href]',
          ) || [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = original;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ModelPreview({ model }: { model: string }) {
  return model === 'images' ? (
    <div className="mini-images">
      {['lion', 'owl', 'fox'].map((a) => (
        <img key={a} src={'/characters/' + a + '.svg'} alt="" />
      ))}
      <div className="mini-confirm">
        <Check size={13} /> Confirmar
      </div>
    </div>
  ) : (
    <div className="mini-standard">
      <div className="mini-screen">
        <span>SEU VOTO PARA</span>
        <div>0 _</div>
        <i />
      </div>
      <div className="mini-keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => (
          <i key={x}>{x}</i>
        ))}
        <span />
        <i>0</i>
        <span />
        <b />
        <b />
      </div>
    </div>
  );
}
export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: 'standard' | 'images') => void;
}) {
  return (
    <div className="model-picker" role="radiogroup" aria-label="Modelo de urna">
      {[
        {
          id: 'standard',
          title: 'Urna padrão',
          description: 'O 0 já vem preenchido. Digite só o último dígito.',
          icon: Keyboard,
        },
        {
          id: 'images',
          title: 'Urna com imagens',
          description: 'Todas as figuras aparecem com animações. Basta tocar.',
          icon: Images,
        },
      ].map((m) => (
        <button
          type="button"
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id as 'standard' | 'images')}
          className={value === m.id ? 'selected' : ''}
        >
          <div className="model-heading">
            <m.icon size={19} />
            <span className="radio-mark">{value === m.id && <Check size={12} />}</span>
          </div>
          <ModelPreview model={m.id} />
          <strong>{m.title}</strong>
          <p>{m.description}</p>
          {m.id === 'images' && <span className="recommended">Para os pequenos</span>}
        </button>
      ))}
    </div>
  );
}
export function localInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function formatted(s: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(s));
}
export function csvDownload(filename: string, rows: unknown[][]) {
  const esc = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(u);
}

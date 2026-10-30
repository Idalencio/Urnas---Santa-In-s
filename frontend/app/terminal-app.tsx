'use client';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, RefreshCw } from 'lucide-react';
import Ballot from './ballot';
import { responseData } from './http';
import type { Election, Terminal } from './domain';

export default function TerminalApp({
  terminalId,
  appearance = 'csi',
}: {
  terminalId: string;
  appearance?: 'csi';
}) {
  const [data, setData] = useState<{ terminal: Terminal; election?: Election } | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const saving = useRef(false),
    mounted = useRef(true);
  const endpoint = '/api/urna/' + encodeURIComponent(terminalId);
  async function load() {
    try {
      const next = await responseData(
        await fetch(endpoint, {
          cache: 'no-store',
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        }),
      );
      if (mounted.current) {
        setData(next);
        setError('');
      }
    } catch (e: any) {
      if (mounted.current) setError(e.message);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => {
      if (!saving.current) void load();
    }, 15000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [terminalId]);
  if (!data)
    return (
      <div className={'terminal-entry ' + (appearance === 'csi' ? 'design-alt' : '')}>
        <img
          src={appearance === 'csi' ? '/csi-logo.png' : '/school-mark.png'}
          alt="Colégio Santa Inês"
        />
        <LockKeyhole size={32} />
        <h1>{error ? 'Não foi possível abrir a urna' : 'Abrindo a urna…'}</h1>
        <p>{error || 'A votação já vai aparecer.'}</p>
        {error && (
          <button className="button primary" onClick={() => void load()}>
            <RefreshCw size={18} /> Tentar novamente
          </button>
        )}
      </div>
    );
  return (
    <>
      {error && (
        <div className="terminal-status" role="alert">
          Não foi possível atualizar a urna. Confira a conexão.
        </div>
      )}
      <Ballot
        appearance={appearance}
        key={data.election?.id || data.terminal.id}
        terminal={data.terminal}
        election={data.election}
        busy={busy}
        cast={async (body) => {
          if (saving.current) throw Error('Aguarde o voto atual.');
          saving.current = true;
          setBusy(true);
          try {
            await responseData(
              await fetch(endpoint, {
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(body),
              }),
            );
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      />
    </>
  );
}

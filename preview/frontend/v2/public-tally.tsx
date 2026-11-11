import { Maximize2 } from 'lucide-react';
import { ElectionTally } from './tally';

/** Página pública isolada do painel: o link autoriza somente os resultados agregados. */
export default function PublicTally({ token }: { token: string }) {
  return (
    <div className="public-tally school-panel original-panel v2-app">
      <header className="public-tally-header">
        <div className="public-school-brand">
          <img src="/csi-logo.png" alt="Colégio Santa Inês" />
          <div>
            <strong>Santa Inês</strong>
            <span>Colégio · Eleições escolares</span>
          </div>
        </div>
        <button
          className="button secondary small"
          onClick={() => {
            if (!document.fullscreenElement)
              void document.documentElement.requestFullscreen?.().catch(() => {});
            else void document.exitFullscreen?.().catch(() => {});
          }}
        >
          <Maximize2 size={16} />
          Tela cheia
        </button>
      </header>
      <main className="public-tally-main">
        <div className="public-tally-intro">
          <span>PARTICIPAÇÃO QUE CONSTRÓI</span>
          <h1>Apuração das eleições</h1>
          <p>
            Resultados da comunidade escolar. Atualização automática a cada 5 minutos durante a
            votação.
          </p>
        </div>
        <ElectionTally id={token} publicView />
      </main>
      <footer className="public-tally-footer">
        <span>Colégio Santa Inês · Eleições escolares</span>
        <span>Desenvolvido pela T.I.</span>
      </footer>
    </div>
  );
}

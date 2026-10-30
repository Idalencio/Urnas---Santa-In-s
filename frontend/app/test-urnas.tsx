'use client';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Images, Keyboard, FlaskConical, Info } from 'lucide-react';
import { Badge, ModelPreview } from './components';
import { voteChoice, type Terminal } from './domain';
import { testBallot } from './test-data';
import Ballot from './ballot';

const models = [
  {
    model: 'standard' as const,
    path: '/testar/padrao',
    title: 'Urna padrão',
    subtitle: 'Para os maiores',
    description:
      'O 0 já está preenchido. Digite 1, 2 ou 3 para ver o personagem e confirme com Enter.',
    icon: Keyboard,
  },
  {
    model: 'images' as const,
    path: '/testar/infantil',
    title: 'Urna infantil animada',
    subtitle: 'Para os pequenos',
    description: 'Todos os desenhos aparecem juntos. Toque no seu favorito, confirme o voto.',
    icon: Images,
  },
];

export function TestUrnaCards({ appearance = 'csi' }: { appearance?: 'csi' }) {
  const csi = appearance === 'csi';
  return (
    <section
      className={'test-urnas ' + (csi ? 'test-urnas-csi' : '')}
      aria-labelledby="test-urnas-title"
    >
      <div className="test-urnas-heading">
        <div>
          <h2 id="test-urnas-title">Teste as urnas agora</h2>
          <p>
            Explore os dois modelos com personagens de exemplo. Os testes não entram na apuração.
          </p>
        </div>
        <Badge tone="blue">{csi && <FlaskConical size={16} />} Área de testes</Badge>
      </div>
      <div className="test-urnas-grid">
        {models.map((m) => (
          <a
            className={
              'test-urna-card ' +
              (m.model === 'images' ? 'test-urna-card-images' : 'test-urna-card-standard')
            }
            href={m.path}
            target="_blank"
            rel="noopener"
            key={m.model}
          >
            <div className="test-urna-preview">
              <ModelPreview model={m.model} />
            </div>
            <div className="test-urna-copy">
              <span>{m.subtitle}</span>
              <h3>
                <m.icon size={20} />
                {m.title}
              </h3>
              <p>{m.description}</p>
              <strong>
                Testar urna <ArrowUpRight size={20} />
              </strong>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function TestUrnas({
  initialModel,
  appearance = 'csi',
}: {
  initialModel?: Terminal['model'];
  appearance?: 'csi';
}) {
  const [model, setModel] = useState(initialModel),
    [counts, setCounts] = useState({ standard: 0, images: 0 });
  const confirmed = useRef(new Set<string>());
  if (model) {
    const { terminal, election } = testBallot(model);
    return (
      <Ballot
        appearance={appearance}
        key={model}
        terminal={terminal}
        election={election}
        busy={false}
        testing
        testVotes={counts[model]}
        onExit={() => setModel(undefined)}
        cast={async (body) => {
          voteChoice(election, body.code);
          if (confirmed.current.has(body.requestId)) return;
          confirmed.current.add(body.requestId);
          setCounts((current) => ({ ...current, [model]: current[model] + 1 }));
        }}
      />
    );
  }
  const header = (
    <header className="ballot-header">
      <a className="text-button" href="/">
        <ArrowLeft size={20} /> Voltar ao painel
      </a>
      <div>
        <img
          src={appearance === 'csi' ? '/csi-logo.png' : '/school-mark.png'}
          alt="Colégio Santa Inês"
        />
        <strong>Urna Digital Escolar</strong>
      </div>
      <Badge tone="blue">Teste</Badge>
    </header>
  );
  if (appearance === 'csi')
    return (
      <div className="test-page design-alt test-page-csi">
        {header}
        <section className="test-hero">
          <div className="test-hero-copy">
            <p className="eyebrow">CONHEÇA OS MODELOS</p>
            <h1>
              Uma urna para
              <br />
              <span>cada turma.</span>
            </h1>
            <p>
              Você pode testar quantas vezes quiser. Depois de confirmar, a urna mostra o FIM e
              volta automaticamente para a próxima escolha.
            </p>
          </div>
          <div className="test-hero-art">
            <img
              src="/urna-hero-csi.svg"
              alt="Ilustração de uma urna eletrônica escolar azul e branca"
            />
          </div>
        </section>
        <main className="test-page-main-csi">
          <TestUrnaCards appearance="csi" />
          <div className="test-attention">
            <span>
              <Info size={22} />
            </span>
            <div>
              <strong>Atenção</strong>
              <p>
                Os exemplos existem apenas nesta área. Os votos de teste são descartados ao sair ou
                recarregar a página. Cadastre seus candidatos e prepare a votação no painel para
                usar a votação real.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  return (
    <div className="test-page">
      {header}
      <main>
        <p className="eyebrow">CONHEÇA OS MODELOS</p>
        <h1>Uma urna para cada turma.</h1>
        <p className="test-page-intro">
          Você pode testar quantas vezes quiser. Depois de confirmar, a urna mostra FIM e volta
          automaticamente para a próxima escolha.
        </p>
        <TestUrnaCards />
        <div className="info-banner">
          Os exemplos existem apenas nesta área. Os votos de teste são descartados ao sair ou
          recarregar a página. Cadastre seus candidatos e prepare a votação no painel para usar a
          votação real.
        </div>
      </main>
    </div>
  );
}

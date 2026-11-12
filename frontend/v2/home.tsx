import { Plus, ArrowRight } from 'lucide-react';

/** Boas-vindas e acesso direto à criação; a gestão continua nas abas do painel. */
export default function Home({
  canCreate,
  hasElections,
  onCreate,
  onOpenElections,
}: {
  canCreate: boolean;
  hasElections: boolean;
  onCreate: () => void;
  onOpenElections: () => void;
}) {
  return (
    <div className="school-home">
      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-intro-copy">
          <p className="home-intro-school">COLÉGIO SANTA INÊS</p>
          <h1 id="home-title">Bem-vindo ao painel de eleições.</h1>
          <p className="home-intro-credit">Desenvolvido pela T.I. do Colégio Santa Inês</p>
          <p className="home-intro-description">
            Prepare a eleição da sua turma, cadastre os candidatos e acompanhe a votação.
          </p>
          <div className="home-intro-actions">
            {canCreate ? (
              <button className="button home-create-election" onClick={onCreate}>
                <Plus size={18} />
                {hasElections ? 'Criar nova eleição' : 'Criar sua primeira eleição'}
              </button>
            ) : (
              <button className="button home-create-election" onClick={onOpenElections}>
                Acessar eleições
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </div>
        <div className="home-intro-brand" aria-hidden="true">
          <img className="home-intro-logo" src="/csi-logo.png" alt="" />
          <strong>Santa Inês</strong>
          <span>Eleições escolares</span>
        </div>
      </section>
    </div>
  );
}

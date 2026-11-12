/** Abertura institucional; as ferramentas de gestão ficam nas respectivas abas. */
export default function Home() {
  return (
    <div className="school-home">
      <section className="home-intro" aria-labelledby="home-title">
        <img className="home-intro-logo" src="/csi-logo.png" alt="" />
        <p className="home-intro-school">COLÉGIO SANTA INÊS</p>
        <h1 id="home-title">Bem-vindo ao painel de eleições.</h1>
        <span className="home-intro-divider" aria-hidden="true" />
        <p className="home-intro-credit">Desenvolvido pela T.I. do Colégio Santa Inês</p>
      </section>
    </div>
  );
}

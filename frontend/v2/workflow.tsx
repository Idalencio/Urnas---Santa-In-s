import { useState, type ReactNode } from 'react';
import {
  Monitor,
  Vote,
  Users,
  Settings,
  LogOut,
  ShieldCheck,
  Menu,
  ChevronRight,
} from 'lucide-react';
export function Shell({
  view,
  signedIn,
  admin = false,
  name = '',
  go,
  logout,
  children,
}: {
  view: string;
  signedIn: boolean;
  admin?: boolean;
  name?: string;
  go: (v: string) => void;
  logout: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const nav = [
    { id: 'elections', label: 'Eleições', icon: Vote },
    { id: 'terminals', label: 'Urnas', icon: Monitor },
    { id: 'students', label: 'Turmas', icon: Users },
    ...(admin ? [{ id: 'team', label: 'Acessos', icon: ShieldCheck }] : []),
    { id: 'account', label: 'Conta', icon: Settings },
  ];
  const navigate = (id: string) => {
    setMenu(false);
    go(id);
  };
  return (
    <div className="app-shell design-alt app-shell-csi v2-app original-panel polished-panel">
      <aside id="school-navigation" className={'sidebar ' + (menu ? 'mobile-open' : '')}>
        <a
          className="brand"
          href="/v2"
          onClick={(ev) => {
            ev.preventDefault();
            navigate('elections');
          }}
        >
          <img src="/csi-logo.png" alt="Colégio Santa Inês" />
          <div>
            <strong>Santa Inês</strong>
            <span>Urna escolar</span>
          </div>
        </a>
        <span className="nav-label">PAINEL DE ELEIÇÕES</span>
        <nav aria-label="Navegação principal">
          {nav
            .filter((item) => signedIn || item.id === 'elections')
            .map((item) => (
              <button
                key={item.id}
                className={view === item.id ? 'active' : ''}
                aria-current={view === item.id ? 'page' : undefined}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
        </nav>
        {signedIn && (
          <div className="sidebar-bottom">
            <button onClick={logout}>
              <LogOut size={18} />
              Sair da conta
            </button>
          </div>
        )}
      </aside>
      {menu && (
        <button className="menu-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)} />
      )}
      <div className="app-body">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              aria-expanded={menu}
              aria-controls="school-navigation"
              onClick={() => setMenu((x) => !x)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              Urna escolar <ChevronRight size={16} />
              <b>{nav.find((item) => item.id === view)?.label || 'Eleições'}</b>
            </span>
          </div>
          {signedIn && (
            <div className="top-actions">
              <div className="user-chip">
                <span>{name.slice(0, 1).toUpperCase() || 'A'}</span>
                <div>
                  <strong>{name}</strong>
                  <small>{admin ? 'Administrador' : 'Equipe'}</small>
                </div>
              </div>
              <button className="icon-button" aria-label="Sair da conta" onClick={logout}>
                <LogOut size={20} />
              </button>
            </div>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}
export function UrnaPreview({ model }: { model: string }) {
  return model === 'images' ? (
    <div className="mini-images">
      {['lion', 'owl', 'fox'].map((x) => (
        <img key={x} src={'/characters/' + x + '.svg'} alt="" />
      ))}
      <div className="mini-confirm">✓ Confirmar</div>
    </div>
  ) : (
    <div className="mini-standard">
      <div className="mini-screen">
        <span>SEU VOTO PARA</span>
        <div>_</div>
        <i />
      </div>
      <div className="mini-keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <i key={n}>{n}</i>
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

export function Credit() {
  return <footer className="ti-credit">Desenvolvido pela T.I.</footer>;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  icon,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="clean-page-heading beauty-page-heading">
      <div className="beauty-heading-copy">
        {icon && (
          <span className="beauty-title-mark" aria-hidden="true">
            {icon}
          </span>
        )}
        <div>
          <span className="beauty-kicker">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { menuFor } from './menu';

interface Props {
  roles: string[];
  onSignOut: () => void;
}

export function Sidebar({ roles, onSignOut }: Props) {
  const { pathname, hash } = useLocation();
  const current = pathname + hash;
  const groups = menuFor(roles);
  const isOn = (to: string) => (to.includes('#') ? current === to : to === '/' ? pathname === '/' : pathname === to && !hash);
  return (
    <aside className="side">
      <div className="brand">
        <span className="mk" />
        SIGEC
      </div>
      <div className="clin">Clínica Médica Santa Cruz</div>
      <nav aria-label="Principal" style={{ display: 'contents' }}>
        {groups.map((g) => (
          <div key={g.heading} style={{ display: 'contents' }}>
            <div className="nh">{g.heading}</div>
            {g.items
              
              .map((it) => (
                <Link key={g.heading + it.to} className={isOn(it.to) ? 'nav on' : 'nav'} to={it.to} aria-current={isOn(it.to) ? 'page' : undefined}>
                  {it.label}
                  {it.badge && <small>{it.badge}</small>}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <span className="sp" />
      <button type="button" className="nav" onClick={onSignOut}>
        Cerrar sesión
      </button>
    </aside>
  );
}

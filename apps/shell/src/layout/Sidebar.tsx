import { Link, useLocation } from 'react-router-dom';
import { useGet } from '../api/ApiProvider';
import { menuFor } from './menu';

interface Props {
  roles: string[];
  onSignOut: () => void;
}

export function Sidebar({ roles, onSignOut }: Props) {
  const { pathname, hash } = useLocation();
  const current = pathname + hash;
  const groups = menuFor(roles);
  // El contador de «Alertas» es real: alertas abiertas de los agentes de monitoreo (solo se consulta si el menu lo muestra).
  const verAlertas = roles.includes('administrador');
  const alertas = useGet<{ items: unknown[]; siguiente: string | null }>('/api/inteligencia/alertas', { estado: 'ABIERTA', limite: 100 }, { enabled: verAlertas, refetchMs: 60_000 });
  const nAlertas = alertas.data ? `${alertas.data.items.length}${alertas.data.siguiente ? '+' : ''}` : undefined;
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
                  {it.badge && nAlertas !== undefined && nAlertas !== '0' && <small>{nAlertas}</small>}
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

import { useLocation } from 'react-router-dom';
import { ROLE_LABEL, primaryRole } from './menu';

const SECTION: Record<string, string> = { '/': 'Inicio', '/clinica': 'Clínica', '/gestion': 'Gestión empresarial' };

function initials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function Topbar({ username, roles }: { username: string; roles: string[] }) {
  const { pathname } = useLocation();
  const role = primaryRole(roles);
  return (
    <header className="top">
      <span className="crumb">
        <b>{SECTION[pathname] ?? 'SIGEC'}</b>
      </span>
      <span className="sp" />
      <div className="user" data-testid="session-user">
        <div className="av" aria-hidden="true">{initials(username) || 'U'}</div>
        <div>
          <div className="un">{username}</div>
          <div className="ur">{role ? ROLE_LABEL[role] : roles.join(', ') || 'Sin rol'}</div>
        </div>
      </div>
    </header>
  );
}

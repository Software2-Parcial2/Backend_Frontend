import { useAuth } from 'react-oidc-context';
import { rolesFromToken } from '../auth/sigecUser';

export function Home() {
  const auth = useAuth();
  if (!auth.isAuthenticated || !auth.user) {
    return <p>Inicia sesión para usar SIGEC.</p>;
  }
  const roles = rolesFromToken(auth.user.access_token);
  return (
    <div>
      <h1>SIGEC</h1>
      <p>
        Usuario: <strong data-testid="username">{auth.user.profile.preferred_username}</strong>
      </p>
      <p>
        Roles: <strong data-testid="roles">{roles.join(', ') || '—'}</strong>
      </p>
    </div>
  );
}

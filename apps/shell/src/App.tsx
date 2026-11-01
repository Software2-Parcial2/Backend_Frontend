import { AuthProvider, useAuth } from 'react-oidc-context';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { oidcConfig } from './auth/oidc';
import { rolesFromToken } from './auth/sigecUser';
import { RemoteContainer } from './components/RemoteContainer';
import { Home } from './pages/Home';
import './App.css';

function RequireLogin({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading) return <p>Cargando sesión…</p>;
  if (!auth.isAuthenticated) {
    return (
      <div>
        <p>Necesitas iniciar sesión para ver esta sección.</p>
        <button type="button" onClick={() => void auth.signinRedirect({ state: { returnTo: location.pathname } })}>
          Iniciar sesión
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

function Layout() {
  const auth = useAuth();
  const roles = auth.user ? rolesFromToken(auth.user.access_token) : [];
  return (
    <>
      <header className="topbar">
        <strong>SIGEC</strong>
        <nav>
          <NavLink to="/">Inicio</NavLink>
          <NavLink to="/clinica">Clínica</NavLink>
          <NavLink to="/gestion">Gestión</NavLink>
        </nav>
        <div className="session">
          {auth.isAuthenticated && auth.user ? (
            <>
              <span data-testid="session-user">
                {auth.user.profile.preferred_username} ({roles.join(', ')})
              </span>
              <button type="button" onClick={() => void auth.signoutRedirect()}>
                Cerrar sesión
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void auth.signinRedirect({ state: { returnTo: window.location.pathname } })}>
              Iniciar sesión
            </button>
          )}
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/clinica"
            element={
              <RequireLogin>
                <RemoteContainer remote="remoteAngular" title="Clínica (Angular)" />
              </RequireLogin>
            }
          />
          <Route
            path="/gestion"
            element={
              <RequireLogin>
                <RemoteContainer remote="remoteVue" title="Gestión (Vue)" />
              </RequireLogin>
            }
          />
          <Route path="*" element={<p>Página no encontrada.</p>} />
        </Routes>
      </main>
    </>
  );
}

function AuthWithRouter() {
  const navigate = useNavigate();
  return (
    <AuthProvider
      {...oidcConfig}
      onSigninCallback={(user) => {
        const returnTo = (user?.state as { returnTo?: string } | undefined)?.returnTo ?? '/';
        navigate(returnTo, { replace: true });
      }}
    >
      <Layout />
    </AuthProvider>
  );
}

const App = () => (
  <BrowserRouter>
    <AuthWithRouter />
  </BrowserRouter>
);

export default App;

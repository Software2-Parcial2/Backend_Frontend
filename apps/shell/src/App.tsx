import { AuthProvider, useAuth } from 'react-oidc-context';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { oidcConfig } from './auth/oidc';
import { rolesFromToken } from './auth/sigecUser';
import { RemoteContainer } from './components/RemoteContainer';
import { Sidebar } from './layout/Sidebar';
import { Topbar } from './layout/Topbar';
import { Home } from './pages/Home';
import { NoEncontrada, SinPermiso } from './pages/Estados';
import { Login } from './pages/Login';
import './App.css';

const STAFF = ['administrador', 'medico', 'recepcion', 'caja'];

function RequireLogin({ children, staff }: { children: ReactNode; staff?: boolean }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isLoading) return <p className="shell-loading" role="status">Cargando sesión…</p>;
  if (!auth.isAuthenticated) {
    return (
      <Login
        expirada={Boolean(auth.user?.expired)}
        onSignIn={() => void auth.signinRedirect({ state: { returnTo: location.pathname + location.hash } })}
      />
    );
  }
  if (staff && auth.user) {
    const roles = rolesFromToken(auth.user.access_token);
    if (!roles.some((r) => STAFF.includes(r))) return <SinPermiso />;
  }
  return <>{children}</>;
}

function Layout() {
  const auth = useAuth();
  const location = useLocation();
  const roles = auth.user ? rolesFromToken(auth.user.access_token) : [];

  if (!auth.isLoading && !auth.isAuthenticated && location.pathname === '/') {
    return (
      <div className="sigec sigec-root">
        <Login onSignIn={() => void auth.signinRedirect({ state: { returnTo: '/' } })} />
      </div>
    );
  }

  return (
    <div className="sigec sigec-root">
      <div className="app">
        {auth.isAuthenticated && auth.user ? (
          <Sidebar roles={roles} onSignOut={() => void auth.signoutRedirect()} />
        ) : null}
        <div className="main">
          {auth.isAuthenticated && auth.user ? (
            <Topbar username={String(auth.user.profile.preferred_username ?? '')} roles={roles} />
          ) : null}
          <main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route
                path="/clinica"
                element={
                  <RequireLogin staff>
                    <RemoteContainer remote="remoteAngular" title="Clínica" />
                  </RequireLogin>
                }
              />
              <Route
                path="/gestion"
                element={
                  <RequireLogin staff>
                    <RemoteContainer remote="remoteVue" title="Gestión" />
                  </RequireLogin>
                }
              />
              <Route path="*" element={<NoEncontrada />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
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

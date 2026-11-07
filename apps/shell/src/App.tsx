import { AuthProvider, useAuth } from 'react-oidc-context';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ApiProvider } from './api/ApiProvider';
import { oidcConfig } from './auth/oidc';
import { rolesFromToken } from './auth/sigecUser';
import { RemoteContainer } from './components/RemoteContainer';
import { ROLE_LABEL, primaryRole } from './layout/menu';
import { Sidebar } from './layout/Sidebar';
import { Topbar } from './layout/Topbar';
import { Home } from './pages/Home';
import { NoEncontrada, SinPermiso } from './pages/Estados';
import { Login } from './pages/Login';
import { Perfil } from './pages/Perfil';
import { Recuperar } from './pages/Recuperar';
import { Seguridad } from './pages/admin/Seguridad';
import { Servicios } from './pages/admin/Servicios';
import { UsuarioNuevo } from './pages/admin/UsuarioNuevo';
import { Usuarios } from './pages/admin/Usuarios';
import { useOnline } from './useOnline';
import './App.css';

const STAFF = ['administrador', 'medico', 'recepcion', 'caja'];

function RequireLogin({ children, staff, admin }: { children: ReactNode; staff?: boolean; admin?: boolean }) {
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
    if (admin && !roles.includes('administrador')) return <SinPermiso rol={ROLE_LABEL[primaryRole(roles) ?? ''] ?? undefined} />;
  }
  return <>{children}</>;
}

function Layout() {
  const auth = useAuth();
  const location = useLocation();
  const roles = auth.user ? rolesFromToken(auth.user.access_token) : [];
  const online = useOnline();

  if (location.pathname === '/recuperar') {
    return (
      <div className="sigec sigec-root">
        <Recuperar />
      </div>
    );
  }

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
          {!online && (
            <div className="page" style={{ paddingBottom: 0 }}>
              <div className="banner err" role="alert">
                <div><b>Sin conexión con el servidor</b><span>La web del personal necesita conexión. Puede consultar lo ya cargado, pero no registrar ni reservar.</span></div>
              </div>
            </div>
          )}
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
              <Route path="/perfil" element={<RequireLogin><Perfil /></RequireLogin>} />
              <Route path="/admin/usuarios" element={<RequireLogin staff admin><Usuarios /></RequireLogin>} />
              <Route path="/admin/usuarios/nuevo" element={<RequireLogin staff admin><UsuarioNuevo /></RequireLogin>} />
              <Route path="/admin/seguridad" element={<RequireLogin staff admin><Seguridad /></RequireLogin>} />
              <Route path="/admin/servicios" element={<RequireLogin staff admin><Servicios /></RequireLogin>} />
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
      <ApiProvider>
        <Layout />
      </ApiProvider>
    </AuthProvider>
  );
}

const App = () => (
  <BrowserRouter>
    <AuthWithRouter />
  </BrowserRouter>
);

export default App;

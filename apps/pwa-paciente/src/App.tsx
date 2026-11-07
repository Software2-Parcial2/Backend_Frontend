import { useAuth } from 'react-oidc-context'
import { Layout } from './pages/Layout'
import { Citas, Confirmada, Datos, Estudios, Inicio, Instalar, Pendientes, Preferencias, Solicitar } from './pages/Paginas'
import { useHashRoute } from './useHashRoute'
import { useOnline } from './useOnline'
import './portal.css'

function Pantalla({ route, online }: { route: string; online: boolean }) {
  switch (route) {
    case 'citas': return <Citas />
    case 'solicitar': return <Solicitar online={online} />
    case 'pendientes': return <Pendientes />
    case 'confirmada': return <Confirmada />
    case 'datos': return <Datos />
    case 'estudios': return <Estudios />
    case 'preferencias': return <Preferencias />
    case 'instalar': return <Instalar />
    default: return <Inicio online={online} />
  }
}

function App() {
  const online = useOnline()
  const auth = useAuth()
  const route = useHashRoute()

  if (auth.isLoading) return <div className="sigec sigec-root"><p className="muted" style={{ padding: 32 }} role="status">Cargando sesión…</p></div>

  if (!auth.isAuthenticated) {
    return (
      <div className="sigec sigec-root">
        <div className="center">
          <div className="card col" style={{ width: '100%', maxWidth: 420, padding: 28, gap: 16 }}>
            <div className="brand" style={{ color: 'var(--ink)', padding: 0 }}><span className="mk" />SIGEC</div>
            <div><h1 className="h1">Portal del paciente</h1><p className="sub">Consulte sus citas y solicítelas desde su teléfono, incluso sin conexión.</p></div>
            {auth.error && <div className="banner err" role="alert"><div><b>Error de sesión</b><span>{auth.error.message}</span></div></div>}
            <span className={`chip ${online ? 'ok' : 'warn'}`} role="status" data-testid="estado-conexion" style={{ alignSelf: 'flex-start' }}>{online ? 'En línea' : 'Sin conexión'}</span>
            <button type="button" className="btn pri" style={{ height: 48 }} onClick={() => void auth.signinRedirect()}>Iniciar sesión</button>
          </div>
        </div>
      </div>
    )
  }

  const nombre = String(auth.user?.profile.preferred_username ?? '')
  return (
    <div className="sigec sigec-root">
      <Layout route={route === 'pendientes' || route === 'confirmada' ? 'citas' : route} online={online} nombre={nombre} onSignOut={() => void auth.signoutRedirect()}>
        <Pantalla route={route} online={online} />
      </Layout>
    </div>
  )
}

export default App

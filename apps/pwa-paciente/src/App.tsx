import { useAuth } from 'react-oidc-context'
import { useOnline } from './useOnline'

function App() {
  const online = useOnline()
  const auth = useAuth()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1rem' }}>
      <h1>SIGEC Paciente</h1>
      <p role="status" data-testid="estado-conexion">
        {online ? 'En línea' : 'Sin conexión'}
      </p>
      {auth.isLoading && <p>Cargando sesión…</p>}
      {auth.error && <p role="alert">Error de sesión: {auth.error.message}</p>}
      {auth.isAuthenticated ? (
        <>
          <p>
            Sesión: <strong>{auth.user?.profile.preferred_username}</strong>
          </p>
          <button type="button" onClick={() => void auth.signoutRedirect()}>
            Cerrar sesión
          </button>
        </>
      ) : (
        !auth.isLoading && (
          <button type="button" onClick={() => void auth.signinRedirect()}>
            Iniciar sesión
          </button>
        )
      )}
    </main>
  )
}

export default App

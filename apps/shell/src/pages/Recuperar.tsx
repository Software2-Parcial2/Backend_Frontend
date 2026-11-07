import { useAuth } from 'react-oidc-context'
import { Link } from 'react-router-dom'

/** Recuperacion de contrasena (m1-recuperar). Pantalla publica: el restablecimiento real es de Keycloak (enlace «olvide mi contrasena» de su login). */
export function Recuperar() {
  const auth = useAuth()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 460px', background: '#0E2A33', color: '#C5D9DE', padding: '56px 64px', display: 'flex', flexDirection: 'column', gap: 24, justifyContent: 'space-between' }}>
        <div className="brand" style={{ fontSize: 22 }}><span className="mk" style={{ width: 34, height: 34 }} />SIGEC</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 440 }}>
          <h1 style={{ fontSize: 38, lineHeight: 1.12, letterSpacing: '-.02em', fontWeight: 650, color: '#fff' }}>Recupere el acceso a su cuenta</h1>
          <p style={{ fontSize: 16, lineHeight: 1.55 }}>Le enviaremos un enlace de un solo uso para crear una contraseña nueva. Por seguridad, el enlace vence pronto.</p>
        </div>
        <div className="sm" style={{ color: '#93B0B8' }}>Clínica Médica Santa Cruz · Autenticación centralizada con Keycloak</div>
      </div>
      <div style={{ flex: '1 1 520px', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 32 }}>
        <div className="card" style={{ width: '100%', maxWidth: 420, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div><h2 style={{ fontSize: 22, fontWeight: 650 }}>¿Olvidó su contraseña?</h2><p className="ink2" style={{ marginTop: 4 }}>El restablecimiento lo hace Keycloak, el servicio de identidad de la clínica.</p></div>
          <ol className="ink2" style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Pulse «Ir a Keycloak».</li>
            <li>En la pantalla de acceso elija «¿Olvidó su contraseña?».</li>
            <li>Indique su correo: recibirá un enlace de un solo uso.</li>
          </ol>
          <button type="button" className="btn pri" style={{ height: 46 }} onClick={() => void auth.signinRedirect({ state: { returnTo: '/' } })}>Ir a Keycloak</button>
          <div className="banner"><div><b>¿No recibe el correo?</b><span>Pida a un administrador que le envíe el enlace desde «Usuarios y roles».</span></div></div>
          <Link className="b" to="/">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  )
}

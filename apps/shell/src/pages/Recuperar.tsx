import { useState } from 'react'
import { Link } from 'react-router-dom'

/** Recuperacion de contrasena (m1-recuperar). Pantalla publica; el envio real lo haria Keycloak (accion "olvide mi contrasena"). */
export function Recuperar() {
  const [enviado, setEnviado] = useState(false)
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
        <form className="card" style={{ width: '100%', maxWidth: 420, padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }} onSubmit={(e) => { e.preventDefault(); setEnviado(true) }}>
          <div><h2 style={{ fontSize: 22, fontWeight: 650 }}>¿Olvidó su contraseña?</h2><p className="ink2" style={{ marginTop: 4 }}>Indique el correo con el que se registró.</p></div>
          <div className="field"><label htmlFor="e">Correo electrónico</label><input className="in" id="e" type="email" defaultValue="rosa.mamani@clinicasantacruz.bo" required /></div>
          <button type="submit" className="btn pri" style={{ height: 46 }}>Enviar enlace de recuperación</button>
          {enviado && <div className="banner ok" role="status"><div><b>Revise su bandeja de entrada</b><span>Si el correo existe en SIGEC, recibirá las instrucciones en unos minutos.</span></div></div>}
          <Link className="b" to="/">Volver a iniciar sesión</Link>
        </form>
      </div>
    </div>
  )
}

import { useAuth } from 'react-oidc-context'
import { rolesFromToken } from '../auth/sigecUser'
import { ROLE_LABEL, primaryRole } from '../layout/menu'

export function Perfil() {
  const auth = useAuth()
  const p = auth.user?.profile
  const rol = primaryRole(auth.user ? rolesFromToken(auth.user.access_token) : [])
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Mi perfil</h1><p className="sub">Datos de su cuenta y seguridad</p></div></div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="card col" style={{ gap: 12 }}>
          <div className="ct">Datos</div>
          <div className="li"><span className="muted">Usuario</span><span className="sp" /><span className="b">{String(p?.preferred_username ?? '—')}</span></div>
          <div className="li"><span className="muted">Rol</span><span className="sp" /><span className="b">{rol ? ROLE_LABEL[rol] : '—'}</span></div>
          <div className="li"><span className="muted">Correo</span><span className="sp" /><span className="b">{String(p?.email ?? '—')}</span></div>
        </div>
        <div className="card col" style={{ gap: 14 }}>
          <div className="ct">Cambiar contraseña</div>
          <div className="banner"><div><b>Se cambia en Keycloak</b><span>Por seguridad, la contraseña se gestiona en la cuenta central; SIGEC no la almacena.</span></div></div>
          <div className="fx" style={{ justifyContent: 'flex-end' }}><a className="btn pri" href="http://localhost:8080/realms/sigec/account/#/security/signing-in">Abrir mi cuenta</a></div>
        </div>
      </div>
    </div>
  )
}

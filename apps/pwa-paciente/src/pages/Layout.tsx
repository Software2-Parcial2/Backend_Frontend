import type { ReactNode } from 'react'

const NAV = [
  { to: 'inicio', label: 'Inicio' },
  { to: 'citas', label: 'Mis citas' },
  { to: 'solicitar', label: 'Solicitar cita' },
  { to: 'datos', label: 'Mis datos' },
  { to: 'estudios', label: 'Estudios' },
  { to: 'preferencias', label: 'Avisos' },
]

interface Props {
  route: string
  online: boolean
  nombre: string
  onSignOut: () => void
  children: ReactNode
}

/** Marco del portal (diseno pwa-*): topbar con navegacion, estado de conexion y avatar. */
export function Layout({ route, online, nombre, onSignOut, children }: Props) {
  return (
    <div className="pw">
      <header className="pt">
        <div className="brand">
          <span className="mk" />
          SIGEC <span className="muted sm" style={{ fontWeight: 500, letterSpacing: 0 }}>Portal del paciente</span>
        </div>
        <nav className="pn" aria-label="Principal">
          {NAV.map((n) => (
            <a key={n.to} href={`#/${n.to}`} className={route === n.to ? 'on' : undefined} aria-current={route === n.to ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <span className="sp" />
        <span className={`chip ${online ? 'ok' : 'warn'}`} role="status" data-testid="estado-conexion">
          {online ? 'En línea' : 'Sin conexión'}
        </span>
        <div className="user">
          <div className="av" aria-hidden="true">{nombre.slice(0, 2).toUpperCase() || 'P'}</div>
          <div className="un">{nombre}</div>
        </div>
        <button type="button" className="btn s" onClick={onSignOut}>Cerrar sesión</button>
      </header>
      <div className="pc">{children}</div>
    </div>
  )
}

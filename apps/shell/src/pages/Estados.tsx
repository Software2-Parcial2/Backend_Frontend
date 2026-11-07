import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

function Estado({ chip, titulo, texto, children }: { chip?: string; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div className="page">
      <div className="card col" style={{ maxWidth: 520, gap: 10, textAlign: 'center', alignItems: 'center', margin: '0 auto', padding: 32 }} role="alert">
        {chip && <span className="chip err">{chip}</span>}
        <h1 className="h1" style={{ fontSize: 20 }}>{titulo}</h1>
        <p className="ink2">{texto}</p>
        <div className="fx wrap" style={{ justifyContent: 'center' }}>{children}</div>
      </div>
    </div>
  )
}

export const NoEncontrada = () => (
  <Estado titulo="Página no encontrada" texto="La dirección no existe o fue movida.">
    <Link className="btn pri" to="/">Ir al inicio</Link>
  </Estado>
)

export const SinPermiso = ({ rol }: { rol?: string }) => (
  <Estado chip="Error 403" titulo="No tiene permiso para ver esta página" texto={`${rol ? `Su rol (${rol}) no incluye el acceso a esta sección. ` : 'Su rol no incluye el acceso a esta sección. '}El intento quedó registrado.`}>
    <Link className="btn pri" to="/" style={{ height: 46 }}>Ir al inicio</Link>
  </Estado>
)

export const ServicioNoDisponible = ({ onRetry }: { onRetry?: () => void }) => (
  <Estado chip="Error 503" titulo="El servicio no está disponible" texto="No pudimos completar la operación. Sus datos no se perdieron ni se duplicaron; puede reintentar de forma segura.">
    <Link className="btn" to="/">Ir al inicio</Link>
    {onRetry && <button type="button" className="btn pri" onClick={onRetry}>Reintentar</button>}
  </Estado>
)

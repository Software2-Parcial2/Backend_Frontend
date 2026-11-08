import { ApiError } from '@sigec/api-client'
import type { ReactNode } from 'react'
import { ahoraTexto } from '../offline/datos'

export const H1 = { fontSize: 28 }

export function mensaje(e: ApiError): { titulo: string; texto: string } {
  switch (e.estado) {
    case 0: return { titulo: 'Sin conexión con el servidor', texto: 'Revise su red e intente de nuevo.' }
    case 401: return { titulo: 'Su sesión venció', texto: 'Vuelva a iniciar sesión para continuar.' }
    case 403: return { titulo: 'No tiene permiso para esto', texto: 'Su cuenta no incluye esta operación.' }
    case 404: return { titulo: 'No se encontró', texto: e.detalle ?? 'El registro no existe.' }
    case 409: return { titulo: 'No se pudo completar', texto: e.detalle ?? 'El estado actual no lo permite.' }
    case 503: return { titulo: 'El servicio no está disponible', texto: e.detalle ?? 'Intente de nuevo en unos minutos.' }
    default: return { titulo: e.estado >= 500 ? 'Error del servidor' : 'No se pudo completar', texto: e.detalle ?? e.message }
  }
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="card col" style={{ gap: 12 }} role="status" aria-live="polite">{[0, 1, 2].map((i) => <div key={i} style={{ width: `${90 - i * 18}%`, height: 14, borderRadius: 6, background: 'var(--line)', opacity: 0.7 }} />)}<span className="sm muted">{texto}</span></div>
}

export function ErrorApi({ error, onReintentar }: { error: ApiError; onReintentar?: () => void }) {
  const m = mensaje(error)
  return (
    <div className="banner err" role="alert">
      <div><b>{m.titulo}</b><span>{m.texto}</span>{error.correlationId && <span className="sm mono" data-testid="correlation-id">Código de soporte: {error.correlationId}</span>}</div>
      {onReintentar && <button type="button" className="btn s" onClick={onReintentar}>Reintentar</button>}
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="card col muted" style={{ textAlign: 'center', padding: 24, gap: 8 }} data-testid="vacio">{children}</div>
}

/** Aviso de que lo mostrado viene de la copia guardada en este dispositivo. */
export function Desactualizado({ en }: { en: number | undefined }) {
  return <div className="banner warn" role="status" data-testid="copia-local"><div><b>Datos guardados en este dispositivo</b><span>No hay conexión con el servidor. Última sincronización: {ahoraTexto(en)}.</span></div></div>
}

export function Interruptor({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={on ? 'sw on' : 'sw'} onClick={() => onChange(!on)} />
}

export const nombreEsp = (c: string | null | undefined) => (c ? c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ') : '—')

export const estadoCita = (e: string): { t: string; tono: string } => {
  switch (e) {
    case 'CONFIRMADA': return { t: 'Confirmada', tono: 'ok' }
    case 'EN_SALA': return { t: 'En sala', tono: 'info' }
    case 'ATENDIDA': return { t: 'Atendida', tono: '' }
    case 'NO_ASISTIO': return { t: 'No asistió', tono: 'err' }
    case 'CANCELADA_USUARIO': return { t: 'Cancelada', tono: 'err' }
    case 'CANCELADA': case 'ANULADA': return { t: 'No se confirmó', tono: 'err' }
    default: return { t: 'En proceso', tono: 'warn' }
  }
}

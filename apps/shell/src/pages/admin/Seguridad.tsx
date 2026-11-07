import { useState } from 'react'

const SESIONES = [
  { n: 'Rosa Mamani Quispe', c: 'Shell', ip: '186.121.40.18', ini: '08:12', act: 'Hace 1 min' },
  { n: 'Dra. Valeria Antelo Rojas', c: 'Shell', ip: '186.121.40.22', ini: '08:40', act: 'Hace 3 min' },
  { n: 'Carla Rojas Vaca', c: 'PWA paciente', ip: '190.181.7.64', ini: '09:03', act: 'Hace 6 min' },
  { n: 'Marcelo Terrazas Roca', c: 'App móvil', ip: '200.87.113.9', ini: '09:21', act: 'Hace 12 min' },
]
const EVENTOS = [
  { t: '03 nov 09:21:07', e: 'Inicio de sesión', u: 'Marcelo Terrazas Roca', d: 'Cliente app móvil, PKCE', r: 'Correcto', tono: 'ok', tipo: 'ok' },
  { t: '03 nov 08:55:41', e: 'Inicio de sesión', u: 'lucia.paz@clinicasantacruz.bo', d: 'Contraseña incorrecta (3.º intento)', r: 'Fallido', tono: 'err', tipo: 'fallido' },
  { t: '03 nov 08:55:44', e: 'Bloqueo de cuenta', u: 'Dra. Lucía Paz Soliz', d: 'Superó los intentos permitidos', r: 'Bloqueada', tono: 'warn', tipo: 'fallido' },
  { t: '02 nov 16:30:12', e: 'Cambio de rol', u: 'Jorge Choque Limachi', d: 'Agregado el rol Cajero por Elena Camacho', r: 'Registrado', tono: 'info', tipo: 'rol' },
  { t: '02 nov 12:02:30', e: 'Sesión revocada', u: 'Rosa Mamani Quispe', d: 'Equipo de recepción 2, por administrador', r: 'Registrado', tono: 'info', tipo: 'otro' },
]
const FILTROS = [['Todos', ''], ['Fallidos', 'fallido'], ['Cambios de rol', 'rol']] as const

export function Seguridad() {
  const [revocadas, setRevocadas] = useState<string[]>([])
  const [filtro, setFiltro] = useState('')
  const activas = SESIONES.filter((s) => !revocadas.includes(s.n))
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Sesiones y eventos de seguridad</h1><p className="sub">Revoque sesiones y revise los accesos registrados por Keycloak</p></div></div>
      <div className="g3">
        <div className="card kpi"><span className="v">{10 + activas.length}</span><span className="l">Sesiones activas ahora</span></div>
        <div className="card kpi"><span className="v">3</span><span className="l">Intentos fallidos en 24 horas</span></div>
        <div className="card kpi"><span className="v">1</span><span className="l">Cuenta bloqueada</span></div>
      </div>
      <div className="card flush">
        <div className="ch"><div className="ct">Sesiones activas</div><span className="sp" /><button type="button" className="btn s dng" onClick={() => setRevocadas(SESIONES.map((s) => s.n))}>Revocar todas</button></div>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Usuario</th><th>Cliente OIDC</th><th>Origen</th><th>Inicio</th><th>Última actividad</th><th></th></tr></thead>
          <tbody>
            {activas.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No quedan sesiones activas en esta lista</td></tr>}
            {activas.map((s) => (
              <tr key={s.n}><td className="b">{s.n}</td><td><span className="tag">{s.c}</span></td><td className="mono">{s.ip}</td><td>{s.ini}</td><td>{s.act}</td><td className="tr"><button type="button" className="btn s" onClick={() => setRevocadas((r) => [...r, s.n])}>Revocar</button></td></tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <div className="card flush">
        <div className="ch"><div className="ct">Eventos de seguridad</div><span className="sp" /><div className="seg">{FILTROS.map(([n, v]) => <button key={n} type="button" className={filtro === v ? 'on' : undefined} onClick={() => setFiltro(v)}>{n}</button>)}</div></div>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Usuario</th><th>Detalle</th><th>Resultado</th></tr></thead>
          <tbody>
            {EVENTOS.filter((e) => !filtro || e.tipo === filtro).map((e) => (
              <tr key={e.t}><td className="mono">{e.t}</td><td>{e.e}</td><td>{e.u}</td><td className="muted">{e.d}</td><td><span className={`chip ${e.tono}`}>{e.r}</span></td></tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}

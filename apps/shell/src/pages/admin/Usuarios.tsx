import { useState } from 'react';
import { Link } from 'react-router-dom';

// Datos de ejemplo del diseno (m1-usuarios). La administracion real se hara contra la API de Keycloak.
interface U { ini: string; n: string; mail: string; rol: string; esp?: string; mat?: string; acceso: string; estado: 'Activo' | 'Bloqueado'; paciente?: boolean }
const USUARIOS: U[] = [
  { ini: 'RM', n: 'Rosa Mamani Quispe', mail: 'rosa.mamani@clinicasantacruz.bo', rol: 'Recepción', acceso: 'Hoy 08:12', estado: 'Activo' },
  { ini: 'VA', n: 'Dra. Valeria Antelo Rojas', mail: 'valeria.antelo@clinicasantacruz.bo', rol: 'Médico', esp: 'Cardiología', mat: 'SC-4821', acceso: 'Hoy 08:40', estado: 'Activo' },
  { ini: 'MS', n: 'Dr. Marcelo Suárez Vaca', mail: 'marcelo.suarez@clinicasantacruz.bo', rol: 'Médico', esp: 'Neumología', mat: 'SC-3977', acceso: 'Ayer 17:55', estado: 'Activo' },
  { ini: 'JC', n: 'Jorge Choque Limachi', mail: 'jorge.choque@clinicasantacruz.bo', rol: 'Cajero', acceso: 'Hoy 07:58', estado: 'Activo' },
  { ini: 'LP', n: 'Dra. Lucía Paz Soliz', mail: 'lucia.paz@clinicasantacruz.bo', rol: 'Médico', esp: 'Pediatría', mat: 'SC-5120', acceso: '28 oct 2026', estado: 'Bloqueado' },
  { ini: 'CR', n: 'Carla Rojas Vaca', mail: 'Portal del paciente', rol: 'Paciente', acceso: 'Hoy 09:03', estado: 'Activo', paciente: true },
]
const GRUPOS = ['Todos', 'Personal', 'Pacientes'] as const

export function Usuarios() {
  const [grupo, setGrupo] = useState<(typeof GRUPOS)[number]>('Todos')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(1)
  const [habilitada, setHabilitada] = useState<Record<string, boolean>>({})
  const visibles = USUARIOS.map((u, i) => ({ u, i })).filter(({ u }) =>
    (grupo === 'Todos' || (grupo === 'Pacientes') === !!u.paciente) &&
    (q === '' || (u.n + u.mail + (u.mat ?? '')).toLowerCase().includes(q.toLowerCase())),
  )
  const u = USUARIOS[sel]
  const on = habilitada[u.mail] ?? u.estado === 'Activo'
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Usuarios y roles</h1><p className="sub">Cuentas del personal y de pacientes administradas desde Keycloak</p></div><span className="sp" /><Link className="btn pri" to="/admin/usuarios/nuevo">Nuevo usuario</Link></div>
      <div className="fx wrap">
        <label className="search"><span className="muted">Buscar</span><input type="text" placeholder="Nombre, correo o matrícula" aria-label="Buscar usuario" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="seg">{GRUPOS.map((g) => <button key={g} type="button" className={g === grupo ? 'on' : undefined} onClick={() => setGrupo(g)}>{g}</button>)}</div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card flush" style={{ flex: '999 1 560px', minWidth: 0 }}>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Usuario</th><th>Rol</th><th>Especialidad · Matrícula</th><th>Último acceso</th><th>Estado</th></tr></thead>
            <tbody>
              {visibles.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 32 }}>Sin resultados para «{q}»</td></tr>}
              {visibles.map(({ u: r, i }) => (
                <tr key={r.mail} className={i === sel ? 'sel' : undefined} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
                  <td><div className="fx"><div className="av" aria-hidden="true">{r.ini}</div><div><div className="b">{r.n}</div><div className="sm muted">{r.mail}</div></div></div></td>
                  <td>{r.rol}</td>
                  <td>{r.esp ? <>{r.esp} · <span className="mono">{r.mat}</span></> : <span className="muted">—</span>}</td>
                  <td>{r.acceso}</td>
                  <td><span className={`chip ${(habilitada[r.mail] ?? r.estado === 'Activo') ? 'ok' : 'warn'}`}>{(habilitada[r.mail] ?? r.estado === 'Activo') ? 'Activo' : 'Bloqueado'}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <div className="card col" style={{ flex: '1 1 320px', maxWidth: 400, gap: 16 }}>
          <div className="fx"><div className="av" style={{ width: 44, height: 44, fontSize: 15 }} aria-hidden="true">{u.ini}</div><div><div className="ct">{u.n}</div><div className="sm muted">Alta el 14 mar 2026</div></div></div>
          <div className="field"><label htmlFor="rol">Rol</label><select className="in" id="rol" value={u.rol} onChange={() => undefined}>{['Recepción', 'Médico', 'Cajero', 'Paciente'].map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="fg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label htmlFor="esp">Especialidad</label><input className="in" id="esp" type="text" key={u.mail + 'e'} defaultValue={u.esp ?? ''} /></div>
            <div className="field"><label htmlFor="mat">Matrícula</label><input className="in" id="mat" type="text" key={u.mail + 'm'} defaultValue={u.mat ?? ''} /></div>
          </div>
          <div className="sm muted">La especialidad y la matrícula viajan en el token como atributos del usuario.</div>
          <hr className="hr" />
          <div className="fx"><div><div className="b">Cuenta habilitada</div><div className="sm muted">Puede iniciar sesión</div></div><span className="sp" /><button type="button" className={on ? 'sw on' : 'sw'} role="switch" aria-checked={on} aria-label="Cuenta habilitada" onClick={() => setHabilitada((h) => ({ ...h, [u.mail]: !on }))} /></div>
          <div className="fx"><div><div className="b">Sesiones activas</div><div className="sm muted">2 (shell, equipo de consultorio 3)</div></div><span className="sp" /><Link className="btn s dng" to="/admin/seguridad">Revocar</Link></div>
          <button type="button" className="btn pri">Guardar cambios</button>
        </div>
      </div>
    </div>
  )
}

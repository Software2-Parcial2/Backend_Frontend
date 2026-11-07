import { useState } from 'react'
import { Link } from 'react-router-dom'

const PERMISOS: Record<string, [string, boolean][]> = {
  'Recepción': [['Registrar y buscar pacientes', true], ['Reservar y reprogramar citas', true], ['Ver historia clínica', false], ['Registrar cobros', false]],
  'Médico': [['Registrar y buscar pacientes', false], ['Reservar y reprogramar citas', false], ['Ver historia clínica', true], ['Registrar cobros', false]],
  'Cajero': [['Registrar y buscar pacientes', false], ['Reservar y reprogramar citas', false], ['Ver historia clínica', false], ['Registrar cobros', true]],
  'Administrador': [['Registrar y buscar pacientes', true], ['Reservar y reprogramar citas', true], ['Ver historia clínica', false], ['Registrar cobros', true]],
  'Dirección': [['Registrar y buscar pacientes', false], ['Reservar y reprogramar citas', false], ['Ver historia clínica', false], ['Registrar cobros', false]],
}

export function UsuarioNuevo() {
  const [rol, setRol] = useState('Recepción')
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Nuevo usuario</h1><p className="sub">La cuenta se crea en Keycloak y el usuario define su contraseña por correo</p></div></div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="card col" style={{ gap: 14 }}>
          <div className="field"><label htmlFor="n">Nombre completo</label><input className="in" id="n" type="text" defaultValue="Mariana Salvatierra" /></div>
          <div className="field"><label htmlFor="c">Correo institucional</label><input className="in" id="c" type="text" defaultValue="m.salvatierra@clinicasc.example" /></div>
          <div className="field"><label htmlFor="r">Rol</label><select className="in" id="r" value={rol} onChange={(e) => setRol(e.target.value)}>{Object.keys(PERMISOS).map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="field"><label htmlFor="e">Especialidad (solo médicos)</label><input className="in" id="e" type="text" placeholder={rol === 'Médico' ? 'Ej.: Cardiología' : 'No aplica para este rol'} disabled={rol !== 'Médico'} /></div>
          <div className="fx" style={{ justifyContent: 'flex-end' }}><Link className="btn" to="/admin/usuarios">Cancelar</Link><Link className="btn pri" to="/admin/usuarios">Crear y enviar invitación</Link></div>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card col" style={{ gap: 8 }}>
            <div className="ct">Permisos del rol {rol}</div>
            {PERMISOS[rol].map(([p, si]) => <div className="li" style={{ padding: '8px 0' }} key={p}><span>{p}</span><span className="sp" /><span className={`chip ${si ? 'ok' : 'err'}`}>{si ? 'Sí' : 'No'}</span></div>)}
          </div>
          <div className="banner"><div><b>Seguridad</b><span>Se exige un segundo factor para Administrador y Dirección.</span></div></div>
        </div>
      </div>
    </div>
  )
}

import { esValidacion } from '@sigec/api-client';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccion } from '../../api/ApiProvider';
import { ErrorApi } from '../../components/Estado';
import { PERMISOS, ROLES, nombreCompleto, type UsuarioApi } from './identidad';

interface CampoProps { id: string; label: string; valor: string; onChange: (e: { target: { value: string } }) => void; error?: string; tipo?: string; ph?: string; req?: boolean }

/** Campo de formulario con su mensaje de error por campo (definido fuera del formulario: si no, pierde el foco al escribir). */
function Campo({ id, label, valor, onChange, error, tipo = 'text', ph, req }: CampoProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input className="in" id={id} type={tipo} value={valor} onChange={onChange} placeholder={ph} required={req} aria-invalid={Boolean(error)} />
      {error && <span className="sm" style={{ color: 'var(--err, #b42318)' }} role="alert">{error}</span>}
    </div>
  );
}

export function UsuarioNuevo() {
  const navigate = useNavigate();
  const [rol, setRol] = useState('recepcion');
  const [f, setF] = useState({ username: '', nombre: '', apellido: '', email: '', password: '', pacienteId: '', medicoId: '', especialidad: '', matricula: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const crear = useAccion((api, _: void) =>
    api.post<UsuarioApi>('/api/identidad/usuarios', {
      username: f.username.trim(),
      email: f.email.trim(),
      nombre: f.nombre.trim(),
      apellido: f.apellido.trim(),
      roles: [rol],
      ...(rol === 'paciente' ? { pacienteId: f.pacienteId.trim() } : {}),
      ...(rol === 'medico' ? { medicoId: f.medicoId.trim() || undefined, especialidad: f.especialidad.trim() || undefined, matricula: f.matricula.trim() || undefined } : {}),
      ...(f.password ? { passwordTemporal: f.password } : {}),
    }, { clave: false }),
  ['/api/identidad/usuarios']);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate(undefined, { onSuccess: (u) => navigate('/admin/usuarios', { state: { creado: nombreCompleto(u) } }) });
  };
  const err = crear.error;
  const campo = (c: string) => err?.mensajeDe(c);
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Nuevo usuario</h1><p className="sub">La cuenta se crea en Keycloak. Sin contraseña temporal, el usuario la define por correo (requiere SMTP en Keycloak)</p></div></div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <form className="card col" style={{ gap: 14 }} onSubmit={enviar}>
          <Campo id="u" label="Usuario" ph="nombre.apellido" req valor={f.username} onChange={set('username')} error={campo('username')} />
          <div className="fg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Campo id="n" label="Nombre" req valor={f.nombre} onChange={set('nombre')} error={campo('nombre')} />
            <Campo id="a" label="Apellido" req valor={f.apellido} onChange={set('apellido')} error={campo('apellido')} />
          </div>
          <Campo id="c" label="Correo institucional" tipo="email" req valor={f.email} onChange={set('email')} error={campo('email')} />
          <div className="field"><label htmlFor="r">Rol</label><select className="in" id="r" value={rol} onChange={(e) => setRol(e.target.value)}>{ROLES.map((r) => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}</select></div>
          {rol === 'paciente' && <Campo id="p" label="Paciente vinculado (id en MS2)" ph="UUID del paciente" req valor={f.pacienteId} onChange={set('pacienteId')} error={campo('pacienteId')} />}
          {rol === 'medico' && (
            <>
              <Campo id="e" label="Especialidad" ph="Ej.: cardiologia" valor={f.especialidad} onChange={set('especialidad')} error={campo('especialidad')} />
              <Campo id="m" label="Matrícula" valor={f.matricula} onChange={set('matricula')} error={campo('matricula')} />
              <Campo id="mi" label="Médico del catálogo (id en MS2)" ph="UUID opcional" valor={f.medicoId} onChange={set('medicoId')} error={campo('medicoId')} />
            </>
          )}
          <Campo id="pw" label="Contraseña temporal (opcional)" tipo="password" ph="Mínimo 8 caracteres" valor={f.password} onChange={set('password')} error={campo('password')} />
          {err && !esValidacion(err) && <ErrorApi error={err} />}
          {err && esValidacion(err) && err.errores.length === 0 && <ErrorApi error={err} />}
          <div className="fx" style={{ justifyContent: 'flex-end' }}>
            <Link className="btn" to="/admin/usuarios">Cancelar</Link>
            <button type="submit" className="btn pri" disabled={crear.isPending}>{crear.isPending ? 'Creando…' : 'Crear usuario'}</button>
          </div>
        </form>
        <div className="col" style={{ gap: 16 }}>
          <div className="card col" style={{ gap: 8 }}>
            <div className="ct">Permisos del rol {ROLES.find((r) => r.clave === rol)?.etiqueta}</div>
            {PERMISOS[rol]!.map(([p, si]) => <div className="li" style={{ padding: '8px 0' }} key={p}><span>{p}</span><span className="sp" /><span className={`chip ${si ? 'ok' : 'err'}`}>{si ? 'Sí' : 'No'}</span></div>)}
          </div>
          <div className="banner"><div><b>Seguridad</b><span>Cambiar el rol de un usuario cierra sus sesiones: los permisos viajan en el token.</span></div></div>
        </div>
      </div>
    </div>
  );
}

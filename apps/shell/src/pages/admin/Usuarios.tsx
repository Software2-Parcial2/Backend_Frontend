import { formatoFecha } from '@sigec/api-client';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccion, useGet, useLista } from '../../api/ApiProvider';
import { Cargando, ErrorApi, Vacio } from '../../components/Estado';
import { ROLES, etiquetaRol, inicialesDe, nombreCompleto, type Pagina, type SesionApi, type UsuarioApi } from './identidad';

const GRUPOS = ['Todos', 'Personal', 'Pacientes'] as const;

function useRetraso<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

export function Usuarios() {
  const estado = useLocation().state as { creado?: string; email?: string | null; invitacion?: { enviada: boolean; detalle: string | null } } | null;
  const aviso = estado?.creado;
  const inv = estado?.invitacion;
  const [grupo, setGrupo] = useState<(typeof GRUPOS)[number]>('Todos');
  const [q, setQ] = useState('');
  const busqueda = useRetraso(q.trim());
  const [sel, setSel] = useState<string | null>(null);

  const lista = useLista<UsuarioApi>('/api/identidad/usuarios', { q: busqueda || undefined, rol: grupo === 'Pacientes' ? 'paciente' : undefined }, { limite: 50 });
  const visibles = useMemo(() => (grupo === 'Personal' ? lista.items.filter((u) => !u.roles.includes('paciente')) : lista.items), [lista.items, grupo]);
  const u = visibles.find((x) => x.id === sel) ?? visibles[0];

  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Usuarios y roles</h1><p className="sub">Cuentas del personal y de pacientes administradas desde Keycloak</p></div><span className="sp" /><Link className="btn pri" to="/admin/usuarios/nuevo">Nuevo usuario</Link></div>
      {aviso && !inv && <div className="banner ok" role="status"><div><b>Usuario creado</b><span>{aviso} ya puede iniciar sesión con la contraseña temporal indicada (la cambiará al entrar).</span></div></div>}
      {aviso && inv?.enviada && <div className="banner ok" role="status"><div><b>Usuario creado</b><span>Se envió a {estado?.email} un correo para que {aviso} cree su contraseña.</span></div></div>}
      {aviso && inv && !inv.enviada && <div className="banner warn" role="status"><div><b>Usuario creado, pero el correo no salió</b><span>{inv.detalle}. Configure el correo (SMTP) de Keycloak y use «Enviar enlace» en el detalle del usuario para reenviarlo.</span></div></div>}
      <div className="fx wrap">
        <label className="search"><span className="muted">Buscar</span><input type="text" placeholder="Nombre, correo o usuario" aria-label="Buscar usuario" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="seg">{GRUPOS.map((g) => <button key={g} type="button" className={g === grupo ? 'on' : undefined} onClick={() => setGrupo(g)}>{g}</button>)}</div>
      </div>
      {lista.isLoading ? <Cargando filas={4} etiqueta="Cargando usuarios…" /> : lista.isError ? <ErrorApi error={lista.error} onRetry={() => void lista.refetch()} /> : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="card flush" style={{ flex: '999 1 560px', minWidth: 0 }}>
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Especialidad · Matrícula</th><th>Estado</th></tr></thead>
              <tbody>
                {visibles.length === 0 && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 32 }} data-testid="vacio">{busqueda ? `Sin resultados para «${busqueda}»` : 'No hay usuarios en este grupo'}</td></tr>}
                {visibles.map((r) => (
                  <tr key={r.id} className={r.id === u?.id ? 'sel' : undefined} onClick={() => setSel(r.id)} style={{ cursor: 'pointer' }} data-testid="fila-usuario">
                    <td><div className="fx"><div className="av" aria-hidden="true">{inicialesDe(r)}</div><div><div className="b">{nombreCompleto(r)}</div><div className="sm muted">{r.email ?? r.username}</div></div></div></td>
                    <td>{r.roles.map(etiquetaRol).join(', ') || '—'}</td>
                    <td>{r.especialidad || r.matricula ? <>{r.especialidad ?? '—'} · <span className="mono">{r.matricula ?? '—'}</span></> : <span className="muted">—</span>}</td>
                    <td><span className={`chip ${r.activo ? 'ok' : 'warn'}`}>{r.activo ? 'Activo' : 'Deshabilitado'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {lista.hasNextPage && <div className="ch" style={{ justifyContent: 'center' }}><button type="button" className="btn s" disabled={lista.isFetchingNextPage} onClick={() => void lista.fetchNextPage()}>{lista.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}</button></div>}
          </div>
          {u ? <Detalle key={u.id} u={u} /> : <Vacio texto="Seleccione un usuario" />}
        </div>
      )}
    </div>
  );
}

function Detalle({ u }: { u: UsuarioApi }) {
  const [rol, setRol] = useState(u.roles[0] ?? 'recepcion');
  const [esp, setEsp] = useState(u.especialidad ?? '');
  const [mat, setMat] = useState(u.matricula ?? '');
  const [ok, setOk] = useState<string | null>(null);
  const sesiones = useGet<Pagina<SesionApi>>(`/api/identidad/usuarios/${u.id}/sesiones`);
  const invalidar = ['/api/identidad/usuarios'];

  const habilitar = useAccion((api, activo: boolean) => api.post(`/api/identidad/usuarios/${u.id}/${activo ? 'habilitar' : 'deshabilitar'}`, undefined, { clave: false }), invalidar);
  const revocar = useAccion((api, _: void) => api.post(`/api/identidad/usuarios/${u.id}/revocar-sesiones`, undefined, { clave: false }), [`/api/identidad/usuarios/${u.id}/sesiones`, '/api/identidad/sesiones']);
  const recuperar = useAccion((api, _: void) => api.post<{ enviadoA: string }>(`/api/identidad/usuarios/${u.id}/recuperar`, undefined, { clave: false }));
  const guardar = useAccion(async (api, _: void) => {
    const medico = rol === 'medico';
    if (JSON.stringify(u.roles) !== JSON.stringify([rol])) {
      await api.put(`/api/identidad/usuarios/${u.id}/roles`, { roles: [rol] }, { clave: false });
    }
    if (medico && (esp !== (u.especialidad ?? '') || mat !== (u.matricula ?? ''))) {
      await api.put(`/api/identidad/usuarios/${u.id}`, { especialidad: esp || undefined, matricula: mat || undefined }, { clave: false });
    }
  }, invalidar);

  const hayCambios = rol !== (u.roles[0] ?? '') || (rol === 'medico' && (esp !== (u.especialidad ?? '') || mat !== (u.matricula ?? '')));
  const varios = u.roles.length > 1;
  const error = habilitar.error ?? revocar.error ?? recuperar.error ?? guardar.error;
  const n = sesiones.data?.items.length;

  return (
    <div className="card col" style={{ flex: '1 1 320px', maxWidth: 400, gap: 16 }} data-testid="detalle-usuario">
      <div className="fx"><div className="av" style={{ width: 44, height: 44, fontSize: 15 }} aria-hidden="true">{inicialesDe(u)}</div><div><div className="ct">{nombreCompleto(u)}</div><div className="sm muted">{u.username}{u.creadoEn.startsWith('1970') ? '' : ` · alta el ${formatoFecha(u.creadoEn)}`}</div></div></div>
      <div className="field"><label htmlFor="rol">Rol</label><select className="in" id="rol" value={rol} onChange={(e) => setRol(e.target.value)}>{ROLES.map((r) => <option key={r.clave} value={r.clave}>{r.etiqueta}</option>)}</select></div>
      {varios && <div className="sm muted">Tiene varios roles ({u.roles.map(etiquetaRol).join(', ')}); guardar con otro rol los reemplaza.</div>}
      {rol === 'medico' && (
        <>
          <div className="fg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label htmlFor="esp">Especialidad</label><input className="in" id="esp" type="text" value={esp} onChange={(e) => setEsp(e.target.value)} /></div>
            <div className="field"><label htmlFor="mat">Matrícula</label><input className="in" id="mat" type="text" value={mat} onChange={(e) => setMat(e.target.value)} /></div>
          </div>
          <div className="sm muted">La especialidad y la matrícula viajan en el token como atributos del usuario.</div>
        </>
      )}
      <hr className="hr" />
      <div className="fx"><div><div className="b">Cuenta habilitada</div><div className="sm muted">Puede iniciar sesión</div></div><span className="sp" /><button type="button" className={u.activo ? 'sw on' : 'sw'} role="switch" aria-checked={u.activo} aria-label="Cuenta habilitada" disabled={habilitar.isPending} onClick={() => habilitar.mutate(!u.activo, { onSuccess: () => setOk(u.activo ? 'Cuenta deshabilitada y sesiones cerradas.' : 'Cuenta habilitada.') })} /></div>
      <div className="fx"><div><div className="b">Sesiones activas</div><div className="sm muted">{sesiones.isLoading ? 'Consultando…' : sesiones.isError ? 'No se pudieron leer' : `${n}${n ? ` (${[...new Set(sesiones.data!.items.flatMap((s) => s.clientes))].join(', ') || 'sin cliente'})` : ''}`}</div></div><span className="sp" /><button type="button" className="btn s dng" disabled={!n || revocar.isPending} onClick={() => revocar.mutate(undefined, { onSuccess: () => setOk('Sesiones revocadas.') })}>Revocar</button></div>
      <div className="fx"><div><div className="b">Contraseña</div><div className="sm muted">{u.email ? `Envía a ${u.email} un enlace para crear una nueva` : 'Sin correo: no se puede enviar el enlace'}</div></div><span className="sp" /><button type="button" className="btn s" disabled={!u.email || recuperar.isPending} onClick={() => recuperar.mutate(undefined, { onSuccess: (r) => setOk(`Enlace enviado a ${r.enviadoA}.`) })} data-testid="recuperar">{recuperar.isPending ? 'Enviando…' : 'Enviar enlace'}</button></div>
      {error && <ErrorApi error={error} />}
      {ok && !error && <div className="banner ok" role="status"><div><span>{ok}</span></div></div>}
      <button type="button" className="btn pri" disabled={!hayCambios || guardar.isPending} onClick={() => guardar.mutate(undefined, { onSuccess: () => setOk('Cambios guardados. El usuario debe volver a iniciar sesión.') })}>{guardar.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
    </div>
  );
}

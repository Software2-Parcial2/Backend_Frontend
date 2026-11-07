import { formatoFechaHora, formatoHora, hace } from '@sigec/api-client';
import { useMemo, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useAccion, useGet, useLista } from '../../api/ApiProvider';
import { Cargando, ErrorApi } from '../../components/Estado';
import { etiquetaRol, nombreCompleto, type Pagina, type SesionApi, type UsuarioApi } from './identidad';

interface EventoApi { fecha: string; tipo: string; usuarioId: string | null; cliente: string | null; ip: string | null; error: string | null }
interface AuditoriaApi { en: string; actor: string; accion: string; objetivo: string; detalle?: string }

const CLIENTE: Record<string, string> = { 'sigec-shell': 'Shell', 'sigec-pwa': 'PWA paciente', 'sigec-mobile': 'App móvil' };
const TIPO_EVENTO: Record<string, [string, string, string]> = {
  LOGIN: ['Inicio de sesión', 'Correcto', 'ok'],
  LOGIN_ERROR: ['Inicio de sesión', 'Fallido', 'err'],
  LOGOUT: ['Cierre de sesión', 'Registrado', 'info'],
  UPDATE_PASSWORD: ['Cambio de contraseña', 'Correcto', 'ok'],
  RESET_PASSWORD: ['Recuperación de contraseña', 'Registrado', 'info'],
  USER_DISABLED_BY_PERMANENT_LOCKOUT: ['Bloqueo de cuenta', 'Bloqueada', 'warn'],
  USER_DISABLED_BY_TEMPORARY_LOCKOUT: ['Bloqueo temporal', 'Bloqueada', 'warn'],
};
const FILTROS = [['Todos', ''], ['Fallidos', 'LOGIN_ERROR'], ['Cambios de rol', 'ROLES']] as const;
const ACCION_AUDITORIA: Record<string, string> = {
  ROLES_CAMBIADOS: 'Cambio de rol',
  USUARIO_CREADO: 'Usuario creado',
  USUARIO_HABILITADO: 'Cuenta habilitada',
  USUARIO_DESHABILITADO: 'Cuenta deshabilitada',
  SESIONES_REVOCADAS: 'Sesiones revocadas',
  SESION_CERRADA: 'Sesión cerrada',
  USUARIO_ACTUALIZADO: 'Datos actualizados',
  RECUPERACION_ENVIADA: 'Recuperación enviada',
};

export function Seguridad() {
  const miSub = useAuth().user?.profile.sub;
  const [filtro, setFiltro] = useState('');
  const sesiones = useLista<SesionApi>('/api/identidad/sesiones', undefined, { limite: 50 });
  const usuarios = useGet<Pagina<UsuarioApi>>('/api/identidad/usuarios', { limite: 100 });
  const bloqueadas = useGet<Pagina<UsuarioApi>>('/api/identidad/usuarios', { activo: false, limite: 100 });
  const eventos = useGet<Pagina<EventoApi>>('/api/identidad/eventos', { tipo: filtro === 'LOGIN_ERROR' ? 'LOGIN_ERROR' : undefined, limite: 50 }, { enabled: filtro !== 'ROLES' });
  const fallidos = useGet<Pagina<EventoApi>>('/api/identidad/eventos', { tipo: 'LOGIN_ERROR', limite: 100 });
  const auditoria = useGet<{ items: AuditoriaApi[] }>('/api/identidad/auditoria', { limite: 50 }, { enabled: filtro === 'ROLES' });

  const nombres = useMemo(() => new Map((usuarios.data?.items ?? []).map((u) => [u.id, nombreCompleto(u)])), [usuarios.data]);
  const roles = useMemo(() => new Map((usuarios.data?.items ?? []).map((u) => [u.id, u.roles.map(etiquetaRol).join(', ')])), [usuarios.data]);

  const cerrar = useAccion((api, id: string) => api.delete(`/api/identidad/sesiones/${id}`, { clave: false }), ['/api/identidad/sesiones']);
  const cerrarOtras = useAccion(async (api, ids: string[]) => {
    for (const id of ids) await api.delete(`/api/identidad/sesiones/${id}`, { clave: false });
  }, ['/api/identidad/sesiones']);

  const otras = sesiones.items.filter((s) => s.usuarioId !== miSub);
  const hace24h = Date.now() - 86_400_000;
  const nFallidos = fallidos.data?.items.filter((e) => Date.parse(e.fecha) >= hace24h).length;

  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Sesiones y eventos de seguridad</h1><p className="sub">Revoque sesiones y revise los accesos registrados por Keycloak</p></div></div>
      <div className="g3" data-testid="kpis">
        <div className="card kpi"><span className="v">{sesiones.isLoading ? '…' : `${sesiones.items.length}${sesiones.hasNextPage ? '+' : ''}`}</span><span className="l">Sesiones activas ahora</span></div>
        <div className="card kpi"><span className="v">{nFallidos ?? '…'}</span><span className="l">Intentos fallidos en 24 horas</span></div>
        <div className="card kpi"><span className="v">{bloqueadas.data ? bloqueadas.data.items.length : '…'}</span><span className="l">Cuentas deshabilitadas</span></div>
      </div>

      <div className="card flush">
        <div className="ch"><div className="ct">Sesiones activas</div><span className="sp" /><button type="button" className="btn s dng" disabled={otras.length === 0 || cerrarOtras.isPending} onClick={() => cerrarOtras.mutate(otras.map((s) => s.id))} title="No cierra su propia sesión">Revocar las demás ({otras.length})</button></div>
        {sesiones.isLoading ? <Cargando filas={3} /> : sesiones.isError ? <ErrorApi error={sesiones.error} onRetry={() => void sesiones.refetch()} /> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Usuario</th><th>Cliente OIDC</th><th>Origen</th><th>Inicio</th><th>Última actividad</th><th></th></tr></thead>
            <tbody>
              {sesiones.items.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }} data-testid="vacio">No hay sesiones activas</td></tr>}
              {sesiones.items.map((s) => (
                <tr key={s.id} data-testid="fila-sesion">
                  <td className="b">{nombres.get(s.usuarioId) ?? s.username}{s.usuarioId === miSub && <span className="tag" style={{ marginLeft: 8 }}>usted</span>}</td>
                  <td>{s.clientes.map((c) => <span className="tag" key={c}>{CLIENTE[c] ?? c}</span>)}</td>
                  <td className="mono">{s.ip ?? '—'}</td>
                  <td>{formatoHora(s.inicio)}</td>
                  <td>{hace(s.ultimoAcceso)}</td>
                  <td className="tr"><button type="button" className="btn s" disabled={cerrar.isPending} onClick={() => cerrar.mutate(s.id)}>Revocar</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {(cerrar.error || cerrarOtras.error) && <div style={{ padding: 12 }}><ErrorApi error={cerrar.error ?? cerrarOtras.error} /></div>}
        {sesiones.hasNextPage && <div className="ch" style={{ justifyContent: 'center' }}><button type="button" className="btn s" onClick={() => void sesiones.fetchNextPage()}>Cargar más</button></div>}
      </div>

      <div className="card flush">
        <div className="ch"><div className="ct">Eventos de seguridad</div><span className="sp" /><div className="seg">{FILTROS.map(([n, v]) => <button key={n} type="button" className={filtro === v ? 'on' : undefined} onClick={() => setFiltro(v)}>{n}</button>)}</div></div>
        {filtro === 'ROLES' ? (
          auditoria.isLoading ? <Cargando filas={3} /> : auditoria.isError ? <ErrorApi error={auditoria.error} onRetry={() => void auditoria.refetch()} /> : (
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Usuario afectado</th><th>Detalle</th><th>Resultado</th></tr></thead>
              <tbody>
                {(auditoria.data?.items ?? []).filter((a) => a.accion === 'ROLES_CAMBIADOS').length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }} data-testid="vacio">Sin cambios de rol desde que arrancó el servicio de identidad</td></tr>}
                {(auditoria.data?.items ?? []).filter((a) => a.accion === 'ROLES_CAMBIADOS').map((a, i) => (
                  <tr key={a.en + i}><td className="mono">{formatoFechaHora(a.en)}</td><td>{ACCION_AUDITORIA[a.accion] ?? a.accion}</td><td>{nombres.get(a.objetivo) ?? a.objetivo}</td><td className="muted">{a.detalle ?? ''}</td><td><span className="chip info">Registrado</span></td></tr>
                ))}
              </tbody>
            </table></div>
          )
        ) : eventos.isLoading ? <Cargando filas={3} /> : eventos.isError ? <ErrorApi error={eventos.error} onRetry={() => void eventos.refetch()} /> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Usuario</th><th>Detalle</th><th>Resultado</th></tr></thead>
            <tbody>
              {(eventos.data?.items ?? []).length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 24 }} data-testid="vacio">Sin eventos registrados</td></tr>}
              {(eventos.data?.items ?? []).map((e, i) => {
                const [nombre, resultado, tono] = TIPO_EVENTO[e.tipo] ?? [e.tipo, 'Registrado', 'info'];
                return (
                  <tr key={e.fecha + i}>
                    <td className="mono">{formatoFechaHora(e.fecha)}</td>
                    <td>{nombre}</td>
                    <td>{e.usuarioId ? (nombres.get(e.usuarioId) ?? e.usuarioId.slice(0, 8)) : <span className="muted">—</span>}{e.usuarioId && roles.get(e.usuarioId) ? <span className="sm muted"> · {roles.get(e.usuarioId)}</span> : null}</td>
                    <td className="muted">{[e.cliente && (CLIENTE[e.cliente] ?? e.cliente), e.error && e.error.replace(/_/g, ' '), e.ip].filter(Boolean).join(' · ')}</td>
                    <td><span className={`chip ${tono}`}>{resultado}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

import { formatoDiaLargo, formatoFecha, formatoHora } from '@sigec/api-client'
import { useApi } from '../api'
import { useDatos } from '../offline/datos'
import { useCola } from '../offline/cola'
import { ahoraTexto } from '../offline/datos'
import { Cargando, Desactualizado, ErrorApi, H1, estadoCita, nombreEsp } from './ui'
import type { Cita, Estudio, Medico, Paciente } from './tipos'

export function Inicio({ online }: { online: boolean }) {
  const api = useApi()
  const cola = useCola(api)
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }))
  const citas = useDatos<Cita[]>(me.datos ? `citas:${me.datos.id}` : null, (a, signal) => a.pagina<Cita>('/api/citas', { query: { pacienteId: me.datos!.id }, limite: 50, signal }).then((p) => p.items))
  const estudios = useDatos<Estudio[]>('estudios', (a, signal) => a.pagina<Estudio>('/api/imagenes', { limite: 20, signal }).then((p) => p.items))
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items))

  if (me.error) return <ErrorApi error={me.error} onReintentar={me.recargar} />
  if (!me.datos) return <Cargando texto="Cargando su portal…" />
  const proxima = (citas.datos ?? []).filter((c) => c.estado === 'CONFIRMADA' && Date.parse(c.fechaHora) >= Date.now()).sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))[0]
  const medico = proxima ? medicos.datos?.find((m) => m.id === proxima.medicoId) : undefined
  const sinEnviar = cola.filter((s) => s.estado === 'PENDIENTE' || s.estado === 'ENVIANDO' || s.estado === 'CONFIRMANDO').length
  const validados = (estudios.datos ?? []).filter((e) => e.validacion === 'VALIDADO').length
  return (
    <>
      <div><h1 className="h1" style={H1} data-testid="saludo">Hola, {me.datos.nombre.split(' ')[0]}</h1><p className="sub">{formatoDiaLargo(new Date())}</p></div>
      {me.desactualizado && <Desactualizado en={me.guardadoEn} />}
      {proxima ? (
        <div className="card col" style={{ gap: 14, padding: 22 }} data-testid="proxima-cita">
          <div className="fx wrap"><span className={`chip ${estadoCita(proxima.estado).tono}`}>{estadoCita(proxima.estado).t}</span><span className="sp" /><span className="sm muted">{formatoFecha(proxima.fechaHora)}</span></div>
          <div><div className="b" style={{ fontSize: 22 }}>{nombreEsp(proxima.especialidad)} · {formatoHora(proxima.fechaHora)}</div><div className="ink2">{medico?.nombre ?? 'Su médico'}{medico?.consultorio ? ` · Consultorio ${medico.consultorio}` : ''}</div></div>
          <div className="fx wrap"><a className="btn pri" href="#/citas">Ver detalle</a><a className="btn" href={`#/solicitar?reprogramar=${proxima.citaId}`}>Reprogramar</a></div>
        </div>
      ) : (
        <div className="card col" style={{ gap: 8 }} data-testid="sin-proxima"><div className="b">No tiene citas próximas</div><a className="btn pri" style={{ alignSelf: 'flex-start' }} href="#/solicitar">Solicitar una cita</a></div>
      )}
      <div className="g3">
        <a className="card col" href="#/solicitar" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Solicitar una cita</span><span className="ink2">Elija especialidad, médico y horario. Funciona también sin conexión.</span></a>
        <a className="card col" href="#/estudios" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Mis estudios</span><span className="ink2">{validados} informe{validados === 1 ? '' : 's'} validado{validados === 1 ? '' : 's'} por su médico.</span></a>
        <a className="card col" href="#/preferencias" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Avisos por correo y Telegram</span><span className="ink2">Elija cómo recibir confirmaciones y recordatorios.</span></a>
      </div>
      {sinEnviar > 0 && <div className="banner warn"><div><b>{sinEnviar} solicitud{sinEnviar === 1 ? '' : 'es'} sin confirmar</b><span>Guardada{sinEnviar === 1 ? '' : 's'} en este dispositivo.</span></div><span className="sp" /><a className="btn s" href="#/pendientes">Ver estado</a></div>}
      <div className="banner"><div><b>Instale el portal en su dispositivo</b><span>Ábralo como una aplicación y consulte sus citas aunque no tenga conexión.</span></div><span className="sp" /><a className="btn s" href="#/instalar">Instalar</a></div>
      <div className="fx sm muted"><span className={`chip ${online && sinEnviar === 0 ? 'ok' : 'warn'}`} data-testid="sync">{!online ? 'Sin conexión' : sinEnviar === 0 ? 'Todo sincronizado' : 'Cambios sin sincronizar'}</span><span data-testid="ultima-sync">Última sincronización: {ahoraTexto(Math.max(me.guardadoEn ?? 0, citas.guardadoEn ?? 0) || undefined)}</span></div>
    </>
  )
}

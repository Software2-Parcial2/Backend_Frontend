import { ApiError, fechaLocal, formatoHora, inicioDelDia, sumarDias, formatoDiaLargo, formatoFecha, formatoFechaHora } from '@sigec/api-client'
import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../api'
import { agregarSolicitud, descartarSolicitud, procesarCola, reintentarSolicitud, useCola } from '../offline/cola'
import { useDatos } from '../offline/datos'
import { useHashParams } from '../useHashRoute'
import { Cargando, Desactualizado, ErrorApi, H1, Vacio, nombreEsp } from './ui'
import type { Cita, Especialidad, Franja, Medico, Paciente } from './tipos'

const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaDia = (f: string) => { const d = new Date(`${f}T12:00:00Z`); return { s: DIAS_CORTO[d.getUTCDay()]!, n: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` } }

export function Solicitar({ online }: { online: boolean }) {
  const api = useApi()
  const reprogramarId = useHashParams().get('reprogramar')
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }))
  const esps = useDatos<Especialidad[]>('especialidades', (a, signal) => a.todas<Especialidad>('/api/especialidades', { limite: 100, signal }).then((r) => r.items.filter((e) => e.activa)))
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items.filter((m) => !('activo' in m) || (m as Medico & { activo?: boolean }).activo !== false)))
  const original = useDatos<Cita>(reprogramarId ? `cita:${reprogramarId}` : null, (a, signal) => a.get<Cita>(`/api/citas/${reprogramarId}`, { signal }))

  const [esp, setEsp] = useState('')
  const [medicoId, setMedicoId] = useState('')
  const dias = useMemo(() => Array.from({ length: 8 }, (_, i) => sumarDias(fechaLocal(), i)), [])
  const [dia, setDia] = useState(dias[0]!)
  const [hora, setHora] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => { // en reprogramacion, se parte del medico de la cita original
    const o = original.datos
    if (o) { setEsp(o.especialidad); setMedicoId(o.medicoId) }
  }, [original.datos])
  useEffect(() => { if (!esp && esps.datos?.[0] && !reprogramarId) setEsp(esps.datos[0].codigo) }, [esps.datos, esp, reprogramarId])

  const delEsp = (medicos.datos ?? []).filter((m) => m.especialidad.codigo === esp)
  const medico = delEsp.find((m) => m.id === medicoId)
  useEffect(() => { if (esp && !delEsp.some((m) => m.id === medicoId) && delEsp[0] && !reprogramarId) setMedicoId(delEsp[0].id) }, [esp, delEsp, medicoId, reprogramarId])

  const franjas = useDatos<Franja[]>(medicoId ? `disp:${medicoId}:${dia}` : null, (a, signal) =>
    a.pagina<Franja>('/api/citas/disponibilidad', { query: { medicoId, desde: inicioDelDia(dia), hasta: inicioDelDia(sumarDias(dia, 1)) }, limite: 100, signal }).then((p) => p.items))

  const libres = (franjas.datos ?? []).filter((f) => f.estado === 'LIBRE')
  const nombreEspecialidad = esps.datos?.find((e) => e.codigo === esp)?.nombre ?? nombreEsp(esp)

  async function guardar() {
    if (!me.datos || !medico || !hora) return
    setGuardando(true)
    setError(null)
    try {
      if (reprogramarId) {
        await api.post(`/api/citas/${reprogramarId}/reprogramar`, { fechaHora: hora })
        window.location.hash = '#/citas'
      } else {
        await agregarSolicitud({ pacienteId: me.datos.id, medicoId: medico.id, especialidad: esp, fechaHora: hora }, { especialidad: esp, medico: medico.nombre })
        void procesarCola(api) // si hay conexion, sale de inmediato; si no, queda guardada
        window.location.hash = '#/pendientes'
      }
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, undefined, 'No se pudo guardar'))
    } finally {
      setGuardando(false)
    }
  }

  if (me.error) return <ErrorApi error={me.error} onReintentar={me.recargar} />
  if (!me.datos || !esps.datos || !medicos.datos) return <Cargando texto="Cargando especialidades y médicos…" />
  const puedeReprogramar = !reprogramarId || online
  return (
    <>
      <div><h1 className="h1" style={H1}>{reprogramarId ? 'Reprogramar una cita' : 'Solicitar una cita'}</h1><p className="sub">Elija especialidad, médico y horario</p></div>
      {!online && !reprogramarId && (
        <div className="banner warn"><div><b>Está sin conexión</b><span>Puede preparar su solicitud: se guardará en este dispositivo y se enviará al volver la conexión. La cita no estará confirmada hasta que el servidor la acepte.</span></div></div>
      )}
      {!online && reprogramarId && <div className="banner warn"><div><b>Reprogramar necesita conexión</b><span>Conéctese para cambiar el horario de una cita confirmada.</span></div></div>}
      {franjas.desactualizado && <Desactualizado en={franjas.guardadoEn} />}
      <div className="steps">
        <div className="st done"><b>1 · Especialidad</b>{nombreEspecialidad}</div>
        <div className="st done"><b>2 · Médico</b>{medico?.nombre ?? '—'}</div>
        <div className={hora ? 'st done' : 'st'}><b>3 · Horario</b>{hora ? `${formatoDiaLargo(hora)} · ${formatoHora(hora)}` : 'Elija un horario'}</div>
        <div className="st"><b>4 · Guardar</b></div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card col" style={{ flex: '999 1 520px', minWidth: 0, gap: 14 }}>
          {!reprogramarId && (
            <div className="fg">
              <div className="field"><label htmlFor="esp">Especialidad</label><select className="in" id="esp" value={esp} onChange={(e) => { setEsp(e.target.value); setMedicoId(''); setHora('') }}>{esps.datos.map((e) => <option key={e.id} value={e.codigo}>{e.nombre}</option>)}</select></div>
              <div className="field"><label htmlFor="med">Médico</label><select className="in" id="med" value={medicoId} onChange={(e) => { setMedicoId(e.target.value); setHora('') }}>{delEsp.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
            </div>
          )}
          <div className="ch" style={{ marginBottom: 0 }}><div className="ct">Horarios disponibles</div><span className="sp" />{franjas.guardadoEn && <span className="sm muted">{franjas.desactualizado ? 'Según la última sincronización' : 'Actualizado ahora'}</span>}</div>
          <div className="fx wrap" style={{ gap: 8 }}>
            {dias.map((d) => <button key={d} type="button" className={`day${d === dia ? ' on' : ''}`} data-testid="dia" onClick={() => { setDia(d); setHora('') }}>{etiquetaDia(d).s}<small>{etiquetaDia(d).n}</small></button>)}
          </div>
          {franjas.error ? <ErrorApi error={franjas.error} onReintentar={franjas.recargar} />
            : franjas.cargando && !franjas.datos ? <Cargando texto="Buscando horarios…" />
            : libres.length === 0 ? <Vacio>No hay horarios libres ese día. Pruebe otro día.</Vacio>
            : <div className="fx wrap" style={{ gap: 8 }}>{libres.map((f) => <button key={f.fechaHora} type="button" className={`slot${hora === f.fechaHora ? ' on' : ''}`} data-testid="horario" style={{ height: 44 }} onClick={() => setHora(f.fechaHora)}>{formatoHora(f.fechaHora)}</button>)}</div>}
        </div>
        <div className="card col" style={{ flex: '1 1 300px', maxWidth: 360, gap: 12 }}>
          <div className="ct">Su solicitud</div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Médico</span><span className="sp" /><span className="b">{medico?.nombre ?? '—'}</span></div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Fecha</span><span className="sp" /><span className="b">{hora ? `${formatoDiaLargo(hora)} · ${formatoHora(hora)}` : '—'}</span></div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Estado</span><span className="sp" /><span className="chip warn">Sin enviar</span></div>
          {error && <ErrorApi error={error} />}
          <button type="button" className="btn pri" style={{ height: 48 }} data-testid="guardar-solicitud" disabled={!hora || guardando || !puedeReprogramar} onClick={() => void guardar()}>{reprogramarId ? 'Reprogramar cita' : online ? 'Solicitar cita' : 'Guardar solicitud'}</button>
          {!reprogramarId && <div className="sm muted">Se reenviará automáticamente con la misma clave de seguridad, sin crear reservas duplicadas.</div>}
        </div>
      </div>
    </>
  )
}

const CHIP: Record<string, { t: string; tono: string }> = {
  PENDIENTE: { t: 'Pendiente', tono: 'warn' }, ENVIANDO: { t: 'Enviando', tono: 'info' }, CONFIRMANDO: { t: 'Confirmando', tono: 'info' },
  CONFIRMADA: { t: 'Confirmada', tono: 'ok' }, CONFLICTO: { t: 'Conflicto', tono: 'err' }, CADUCADA: { t: 'Caducada', tono: 'err' },
}

export function Pendientes({ online }: { online: boolean }) {
  const api = useApi()
  const cola = useCola(api)
  const enCurso = cola.filter((s) => ['PENDIENTE', 'ENVIANDO', 'CONFIRMANDO'].includes(s.estado)).length
  return (
    <>
      <div><h1 className="h1" style={H1}>Solicitudes pendientes</h1><p className="sub">Solicitudes guardadas en este dispositivo y su estado de sincronización</p></div>
      {enCurso > 0 && online && <div className="banner ok"><div><b>Enviando al servidor</b><span>{enCurso} solicitud{enCurso === 1 ? '' : 'es'} en proceso.</span></div></div>}
      {enCurso > 0 && !online && <div className="banner warn"><div><b>Sin conexión</b><span>{enCurso} solicitud{enCurso === 1 ? '' : 'es'} se enviará{enCurso === 1 ? '' : 'n'} al volver la conexión.</span></div></div>}
      {cola.length === 0 ? <Vacio>No hay solicitudes guardadas.<a className="btn pri" href="#/solicitar">Solicitar cita</a></Vacio> : (
        <div className="card flush"><div style={{ padding: '0 18px' }}>
          {[...cola].reverse().map((s) => (
            <div key={s.id} className="li" style={{ alignItems: 'flex-start', padding: '16px 0' }} data-testid="solicitud" data-estado={s.estado}>
              <span className={`chip ${CHIP[s.estado]!.tono}`} data-testid="estado-solicitud">{CHIP[s.estado]!.t}</span>
              <div style={{ flex: 1 }}>
                <div className="b">{nombreEsp(s.cuerpo.especialidad)} · {formatoFecha(s.cuerpo.fechaHora)} {formatoHora(s.cuerpo.fechaHora)}</div>
                <div className="sm muted">{s.resumen.medico} · guardada {formatoFechaHora(new Date(s.creada))} · clave <span className="mono" data-testid="clave">{s.clave.slice(0, 8)}…{s.clave.slice(-4)}</span></div>
                {s.error && <div className={s.estado === 'CONFLICTO' || s.estado === 'CADUCADA' ? 'ink2' : 'sm muted'}>{s.error}</div>}
              </div>
              {s.estado === 'CONFIRMADA' && s.citaId && <a className="btn s" href={`#/confirmada?id=${s.citaId}`}>Ver cita</a>}
              {(s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') && <a className="btn s pri" href="#/solicitar" onClick={() => void descartarSolicitud(s.id)}>Elegir otro horario</a>}
              {s.estado === 'PENDIENTE' && <button type="button" className="btn s" onClick={() => { void reintentarSolicitud(s.id).then(() => procesarCola(api)) }}>Enviar ahora</button>}
              {(s.estado === 'CONFIRMADA' || s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') && <button type="button" className="btn s" onClick={() => void descartarSolicitud(s.id)}>Quitar</button>}
            </div>
          ))}
        </div></div>
      )}
      <div className="sm muted">Cada solicitud se reenvía con su misma clave, de modo que un reintento nunca crea una reserva duplicada. Las claves caducan a las 24 horas.</div>
    </>
  )
}

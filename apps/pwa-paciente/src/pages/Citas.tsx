import { formatoDiaLargo, formatoFecha, formatoFechaHora, formatoHora, dinero } from '@sigec/api-client'
import { useState } from 'react'
import { useApi } from '../api'
import { useHashParams } from '../useHashRoute'
import { useCola } from '../offline/cola'
import { useDatos } from '../offline/datos'
import { Cargando, Desactualizado, ErrorApi, H1, Vacio, estadoCita, nombreEsp } from './ui'
import type { Cita, Factura, Medico, Paciente } from './tipos'
import { ApiError } from '@sigec/api-client'

export function Citas({ online }: { online: boolean }) {
  const api = useApi()
  const cola = useCola(api)
  const [tab, setTab] = useState<'proximas' | 'historial'>('proximas')
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<ApiError | null>(null)
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }))
  const citas = useDatos<Cita[]>(me.datos ? `citas:${me.datos.id}` : null, (a, signal) => a.pagina<Cita>('/api/citas', { query: { pacienteId: me.datos!.id }, limite: 100, signal }).then((p) => p.items))
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items))

  if (me.error) return <ErrorApi error={me.error} onReintentar={me.recargar} />
  if (citas.error) return <ErrorApi error={citas.error} onReintentar={citas.recargar} />
  if (!citas.datos) return <Cargando texto="Cargando sus citas…" />
  const ahora = Date.now()
  const todas = [...citas.datos].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
  const proximas = todas.filter((c) => Date.parse(c.fechaHora) >= ahora && ['CONFIRMADA', 'EN_SALA', 'PENDIENTE', 'RESERVADA', 'COBRO_PROVISIONAL'].includes(c.estado))
  const historial = todas.filter((c) => !proximas.includes(c)).reverse()
  const enCola = cola.filter((s) => s.estado !== 'CONFIRMADA')
  const medico = (id: string) => medicos.datos?.find((m) => m.id === id)

  async function cancelar(c: Cita) {
    setErrorAccion(null)
    setCancelando(c.citaId)
    try {
      await api.post(`/api/citas/${c.citaId}/cancelar`, { motivo: 'Cancelada por el paciente desde el portal' })
      citas.recargar()
    } catch (e) {
      setErrorAccion(e instanceof ApiError ? e : new ApiError(0, undefined, 'No se pudo cancelar'))
    } finally {
      setCancelando(null)
    }
  }

  return (
    <>
      <div className="ph"><div><h1 className="h1" style={H1}>Mis citas</h1><p className="sub">Próximas citas e historial de reservas</p></div><span className="sp" /><a className="btn pri" href="#/solicitar">Solicitar cita</a></div>
      {citas.desactualizado && <Desactualizado en={citas.guardadoEn} />}
      {errorAccion && <ErrorApi error={errorAccion} />}
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'proximas'} className={tab === 'proximas' ? 'tab on' : 'tab'} onClick={() => setTab('proximas')}>Próximas</button>
        <button type="button" role="tab" aria-selected={tab === 'historial'} className={tab === 'historial' ? 'tab on' : 'tab'} onClick={() => setTab('historial')}>Historial</button>
      </div>
      {tab === 'proximas' ? (
        <>
          {proximas.map((c) => (
            <div key={c.citaId} className="card col" style={{ gap: 12 }} data-testid="cita">
              <div className="fx wrap"><span className={`chip ${estadoCita(c.estado).tono}`}>{estadoCita(c.estado).t}</span><span className="sp" /><span className="mono muted">{c.citaId.slice(0, 8)}</span></div>
              <div className="fx wrap" style={{ gap: 20 }}>
                <div><div className="b" style={{ fontSize: 20 }}>{formatoDiaLargo(c.fechaHora)} · {formatoHora(c.fechaHora)}</div><div className="ink2">{nombreEsp(c.especialidad)} · {medico(c.medicoId)?.nombre ?? 'Su médico'}</div></div>
                <span className="sp" />
                {c.estado === 'CONFIRMADA' && <>
                  <a className="btn" href={`#/solicitar?reprogramar=${c.citaId}`} aria-disabled={!online}>Reprogramar</a>
                  <button type="button" className="btn dng" data-testid="cancelar" disabled={!online || cancelando === c.citaId} onClick={() => void cancelar(c)}>{cancelando === c.citaId ? 'Cancelando…' : 'Cancelar'}</button>
                </>}
              </div>
              {!online && c.estado === 'CONFIRMADA' && <span className="sm muted">Para cancelar o reprogramar se necesita conexión.</span>}
            </div>
          ))}
          {enCola.map((s) => (
            <div key={s.id} className="card col" style={{ gap: 12 }} data-testid="cita-pendiente">
              <div className="fx wrap"><span className={`chip ${s.estado === 'CONFLICTO' || s.estado === 'CADUCADA' ? 'err' : 'warn'}`}>{s.estado === 'CONFLICTO' ? 'Conflicto' : s.estado === 'CADUCADA' ? 'Caducada' : 'Pendiente de envío'}</span><span className="sp" /><span className="sm muted">Guardada en este dispositivo</span></div>
              <div className="fx wrap" style={{ gap: 20 }}><div><div className="b" style={{ fontSize: 20 }}>{formatoFecha(s.cuerpo.fechaHora)} · {formatoHora(s.cuerpo.fechaHora)}</div><div className="ink2">{nombreEsp(s.resumen.especialidad)} · {s.resumen.medico}</div></div><span className="sp" /><a className="btn" href="#/pendientes">Ver estado</a></div>
            </div>
          ))}
          {!proximas.length && !enCola.length && <Vacio>No tiene citas próximas.<a className="btn pri" href="#/solicitar">Solicitar cita</a></Vacio>}
        </>
      ) : historial.length ? (
        <div className="card">
          {historial.map((c) => (
            <div key={c.citaId} className="li" data-testid="cita-historial"><div><div className="b">{formatoFechaHora(c.fechaHora)}</div><div className="sm muted">{nombreEsp(c.especialidad)} · {medico(c.medicoId)?.nombre ?? 'Su médico'}</div></div><span className="sp" /><span className={`chip ${estadoCita(c.estado).tono}`}>{estadoCita(c.estado).t}</span></div>
          ))}
        </div>
      ) : <Vacio>Todavía no tiene historial de citas.</Vacio>}
      <div className="sm muted">Una cita queda confirmada solo cuando el servidor acepta la solicitud y se registra su cargo.</div>
    </>
  )
}

export function Confirmada() {
  const id = useHashParams().get('id')
  const api = useApi()
  const cita = useDatos<Cita>(id ? `cita:${id}` : null, (a, signal) => a.get<Cita>(`/api/citas/${id}`, { signal }))
  const medicos = useDatos<Medico[]>('medicos', (a, signal) => a.todas<Medico>('/api/medicos', { limite: 100, signal }).then((r) => r.items))
  const factura = useDatos<Factura | null>(cita.datos?.facturaId ? `factura:${cita.datos.facturaId}` : null, (a, signal) => a.get<Factura>(`/api/facturacion/facturas/${cita.datos!.facturaId}`, { signal }).catch(() => null))
  void api
  if (!id) return <Vacio>Abra una cita desde «Mis citas».<a className="btn pri" href="#/citas">Mis citas</a></Vacio>
  if (cita.error) return <ErrorApi error={cita.error} onReintentar={cita.recargar} />
  const c = cita.datos
  if (!c) return <Cargando />
  const ok = c.estado === 'CONFIRMADA' || c.estado === 'EN_SALA' || c.estado === 'ATENDIDA'
  return (
    <>
      <div className={ok ? 'banner ok' : 'banner err'}><div><b>{ok ? 'Su cita está confirmada' : 'La cita no se confirmó'}</b><span>{ok ? 'Recibirá un correo y un mensaje de Telegram con los datos.' : (c.motivoFallo ?? 'Elija otro horario.')}</span></div></div>
      <div className="card col" style={{ gap: 12, maxWidth: 640 }}>
        <div className="fx"><div className="ct">{nombreEsp(c.especialidad)}</div><span className="sp" /><span className={`chip ${estadoCita(c.estado).tono}`}>{estadoCita(c.estado).t}</span></div>
        <div className="li"><span className="muted">Fecha y hora</span><span className="sp" /><span className="b">{formatoDiaLargo(c.fechaHora)} · {formatoHora(c.fechaHora)}</span></div>
        <div className="li"><span className="muted">Médico</span><span className="sp" /><span className="b">{medicos.datos?.find((m) => m.id === c.medicoId)?.nombre ?? '—'}</span></div>
        {factura.datos && <div className="li"><span className="muted">Cargo registrado</span><span className="sp" /><span className="b">{dinero(factura.datos.monto, factura.datos.moneda, { sinCentavos: true })}</span></div>}
        <div className="fx"><a className="btn pri" href="#/citas">Ir a mis citas</a><a className="btn" href="#/solicitar">Solicitar otra cita</a></div>
      </div>
    </>
  )
}

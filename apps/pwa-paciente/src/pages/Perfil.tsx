import { ApiError, formatoFecha, formatoFechaHora, nuevaIntencion } from '@sigec/api-client'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api'
import { useDatos } from '../offline/datos'
import { Cargando, Desactualizado, ErrorApi, H1, Interruptor, Vacio } from './ui'
import type { Aviso, Contacto, Estudio, Paciente, Preferencias, SolicitudDato } from './tipos'

const aErr = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, undefined, e instanceof Error ? e.message : 'Error'))

export function Datos({ online }: { online: boolean }) {
  const api = useApi()
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }))
  const contactos = useDatos<Contacto[]>(me.datos ? `contactos:${me.datos.id}` : null, (a, signal) => a.pagina<Contacto>(`/api/pacientes/${me.datos!.id}/contactos`, { limite: 20, signal }).then((p) => p.items))
  const solicitudes = useDatos<SolicitudDato[]>(me.datos ? `solicitudes:${me.datos.id}` : null, (a, signal) => a.pagina<SolicitudDato>(`/api/pacientes/${me.datos!.id}/solicitudes`, { limite: 10, signal }).then((p) => p.items))
  const [f, setF] = useState({ telefono: '', email: '', direccion: '' })
  const [enviando, setEnviando] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [ok, setOk] = useState(false)
  useEffect(() => { if (me.datos) setF({ telefono: me.datos.telefono ?? '', email: me.datos.email ?? '', direccion: me.datos.direccion ?? '' }) }, [me.datos])

  if (me.error) return <ErrorApi error={me.error} onReintentar={me.recargar} />
  const p = me.datos
  if (!p) return <Cargando />
  const cambios = ([['TELEFONO', f.telefono, p.telefono], ['EMAIL', f.email, p.email], ['DIRECCION', f.direccion, p.direccion]] as const).filter(([, nuevo, viejo]) => nuevo.trim() && nuevo.trim() !== (viejo ?? ''))
  const pendientes = (solicitudes.datos ?? []).filter((s) => s.estado === 'PENDIENTE')

  async function solicitar() {
    setEnviando(true); setErr(null); setOk(false)
    try {
      for (const [campo, valor] of cambios) await api.post(`/api/pacientes/${p!.id}/solicitudes`, { campo, valorPropuesto: valor.trim() })
      setOk(true); solicitudes.recargar()
    } catch (e) { setErr(aErr(e)) } finally { setEnviando(false) }
  }
  return (
    <>
      <div><h1 className="h1" style={H1}>Mis datos</h1><p className="sub">Revise su información y solicite cambios en sus datos de contacto</p></div>
      {me.desactualizado && <Desactualizado en={me.guardadoEn} />}
      <div className="card">
        <div className="ch"><div className="ct">Datos personales</div><span className="sp" /><span className="sm muted">Para cambiarlos, acuda a recepción</span></div>
        <div className="fg" style={{ rowGap: 14 }}>
          <div><div className="sm muted">Nombre</div><div className="b" data-testid="nombre">{p.nombre}</div></div>
          <div><div className="sm muted">Documento de identidad</div><div className="b">{p.documento}</div></div>
          <div><div className="sm muted">Fecha de nacimiento</div><div className="b">{formatoFecha(p.fechaNacimiento + 'T12:00:00Z')}</div></div>
          <div><div className="sm muted">N.° de historia</div><div className="b mono">{p.numeroHistoria}</div></div>
        </div>
      </div>
      <div className="card col" style={{ gap: 14 }}>
        <div className="ch" style={{ marginBottom: 0 }}><div className="ct">Datos de contacto</div><span className="sp" />{pendientes.length > 0 && <span className="chip info" data-testid="en-revision">Solicitud en revisión</span>}</div>
        <div className="fg">
          <div className="field"><label htmlFor="t">Teléfono</label><input className="in" id="t" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></div>
          <div className="field"><label htmlFor="c">Correo electrónico</label><input className="in" id="c" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="d">Dirección</label><input className="in" id="d" value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></div>
        </div>
        {err && <ErrorApi error={err} />}
        {ok && <div className="banner ok" role="status"><div><b>Solicitud enviada</b><span>Recepción la revisará antes de actualizar su ficha.</span></div></div>}
        <div className="fx wrap"><span className="sm muted" style={{ flex: '1 1 260px' }}>Recepción revisará su solicitud antes de actualizar su ficha.</span><button type="button" className="btn pri" data-testid="solicitar-cambio" disabled={!cambios.length || enviando || !online} onClick={() => void solicitar()}>Solicitar actualización</button></div>
        {(solicitudes.datos ?? []).slice(0, 3).map((s) => <div key={s.id} className="li sm" data-testid="solicitud-dato"><span>{s.campo.toLowerCase()}: {s.valorPropuesto}</span><span className="sp" /><span className={`chip ${s.estado === 'APROBADA' ? 'ok' : s.estado === 'RECHAZADA' ? 'err' : 'info'}`}>{s.estado === 'APROBADA' ? 'Aprobada' : s.estado === 'RECHAZADA' ? 'Rechazada' : 'En revisión'}</span></div>)}
      </div>
      <div className="card">
        <div className="ch"><div className="ct">Contactos de emergencia</div></div>
        {(contactos.datos ?? []).map((c) => <div key={c.id} className="li"><div className="av" aria-hidden="true">{c.nombre.slice(0, 2).toUpperCase()}</div><div><div className="b">{c.nombre}</div><div className="sm muted">{c.parentesco}</div></div><span className="sp" /><span className="mono">{c.telefono}</span></div>)}
        {contactos.datos && !contactos.datos.length && <p className="ink2">Sin contactos de emergencia registrados. Recepción puede agregarlos.</p>}
      </div>
    </>
  )
}

export function Estudios({ online }: { online: boolean }) {
  const api = useApi()
  const estudios = useDatos<Estudio[]>('estudios', (a, signal) => a.pagina<Estudio>('/api/imagenes', { limite: 50, signal }).then((p) => p.items))
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [ok, setOk] = useState(false)
  const intencion = useRef(nuevaIntencion())
  const problema = archivo && !['image/png', 'image/jpeg'].includes(archivo.type) ? 'Suba una imagen PNG o JPEG.' : archivo && archivo.size > 20 * 1024 * 1024 ? 'El archivo supera 20 MB.' : null

  function elegir(f: File | undefined) {
    if (vista) URL.revokeObjectURL(vista)
    setArchivo(f ?? null); setVista(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null); setErr(null); setOk(false); intencion.current.renovar()
  }
  async function descargar(e: Estudio) {
    try { const r = await api.get<{ url: string }>(`/api/imagenes/${e.id}/url`); window.open(r.url, '_blank', 'noopener') } catch (x) { setErr(aErr(x)) }
  }
  async function subir() {
    if (!archivo || problema) return
    setSubiendo(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('archivo', archivo); fd.append('estudio', 'radiografia-torax'); fd.append('origen', 'PACIENTE')
      await api.subir('/api/imagenes', fd, { clave: intencion.current.clave })
      setOk(true); setArchivo(null); setVista(null); estudios.recargar()
    } catch (e) { setErr(aErr(e)) } finally { setSubiendo(false) }
  }
  if (estudios.error) return <ErrorApi error={estudios.error} onReintentar={estudios.recargar} />
  return (
    <>
      <div><h1 className="h1" style={H1}>Mis estudios</h1><p className="sub">Informes validados por su médico y estudios que usted sube</p></div>
      {estudios.desactualizado && <Desactualizado en={estudios.guardadoEn} />}
      {!estudios.datos ? <Cargando /> : estudios.datos.length === 0 ? <Vacio>Todavía no tiene informes validados.</Vacio> : estudios.datos.map((e) => (
        <div key={e.id} className="card col" style={{ gap: 12 }} data-testid="estudio">
          <div className="fx wrap"><div><div className="ct">Radiografía de tórax</div><div className="sm muted">{formatoFecha(e.creadaEn)}</div></div><span className="sp" /><span className={`chip ${e.validacion === 'VALIDADO' ? 'ok' : 'warn'}`}>{e.validacion === 'VALIDADO' ? 'Informe validado' : 'En revisión'}</span></div>
          <p className="ink2">{e.informe ? e.informe.texto : 'Su médico aún no valida este estudio.'}</p>
          <div className="fx wrap"><button type="button" className="btn" disabled={!online} onClick={() => void descargar(e)}>Ver imagen</button><span className="sm muted">El enlace seguro vence en unos minutos.</span></div>
        </div>
      ))}
      <div className="card col" style={{ gap: 14, borderStyle: 'dashed', borderColor: 'var(--bd)' }}>
        <div className="ct">Subir un estudio previo</div>
        <div className="fx wrap" style={{ gap: 16 }}>
          <div className="xray" style={{ width: 120, height: 120, flex: 'none', overflow: 'hidden' }}>{vista ? <img src={vista} alt="Vista previa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : 'Vista previa'}</div>
          <div className="col" style={{ gap: 6, flex: '1 1 260px' }}>
            <label className="btn s" style={{ width: 'fit-content' }}>{archivo ? 'Cambiar archivo' : 'Elegir archivo'}<input type="file" accept="image/png,image/jpeg" data-testid="archivo" style={{ display: 'none' }} onChange={(e) => elegir(e.target.files?.[0])} /></label>
            {archivo && <div className="b">{archivo.name}</div>}
            {problema && <div className="chip err" style={{ alignSelf: 'flex-start' }}>{problema}</div>}
            <div className="sm muted">El servidor comprueba que sea una radiografía de tórax y la analiza. Un médico debe validarla antes de que aparezca como informe.</div>
          </div>
          <button type="button" className="btn pri" data-testid="enviar-estudio" disabled={!archivo || !!problema || subiendo || !online} onClick={() => void subir()}>{subiendo ? 'Enviando…' : 'Enviar estudio'}</button>
        </div>
        {err && <ErrorApi error={err} />}
        {ok && <div className="banner ok" role="status"><div><b>Estudio enviado</b><span>Lo verá aquí cuando su médico lo valide.</span></div></div>}
      </div>
    </>
  )
}

const TIPOS: { k: string; n: string }[] = [
  { k: 'RECORDATORIO', n: 'Recordatorio' }, { k: 'CITA_REPROGRAMADA', n: 'Reprogramación' }, { k: 'ESTUDIO_VALIDADO', n: 'Estudio validado' },
]
const TXT_AVISO: Record<string, string> = { CITA_CONFIRMADA: 'Confirmación de cita', CITA_CANCELADA: 'Cancelación', CITA_REPROGRAMADA: 'Reprogramación', RECORDATORIO: 'Recordatorio', RECORDATORIO_REFUERZO: 'Recordatorio', ESTUDIO_VALIDADO: 'Estudio validado' }

export function PreferenciasPaciente({ online }: { online: boolean }) {
  const api = useApi()
  const me = useDatos<Paciente>('me', (a, signal) => a.get<Paciente>('/api/pacientes/me', { signal }))
  const prefs = useDatos<Preferencias>(me.datos ? `prefs:${me.datos.id}` : null, (a, signal) => a.get<Preferencias>(`/api/notificaciones/preferencias/${me.datos!.id}`, { signal }))
  const avisos = useDatos<Aviso[]>(me.datos ? `avisos:${me.datos.id}` : null, (a, signal) => a.pagina<Aviso>('/api/notificaciones', { query: { pacienteId: me.datos!.id }, limite: 10, signal }).then((p) => p.items))
  const [canales, setCanales] = useState<string[]>([])
  const [tipos, setTipos] = useState<string[]>([])
  const [antelacion, setAntelacion] = useState(24)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<ApiError | null>(null)
  const [ok, setOk] = useState(false)
  const [codigo, setCodigo] = useState<{ codigo: string; expiraEn: string } | null>(null)
  const [restante, setRestante] = useState(0)
  useEffect(() => { const p = prefs.datos; if (p) { setCanales(p.canales); setTipos(p.tiposAviso); setAntelacion(p.antelacionHoras) } }, [prefs.datos])
  useEffect(() => {
    if (!codigo) return
    const t = setInterval(() => setRestante(Math.max(0, Math.round((Date.parse(codigo.expiraEn) - Date.now()) / 1000))), 1000)
    setRestante(Math.max(0, Math.round((Date.parse(codigo.expiraEn) - Date.now()) / 1000)))
    return () => clearInterval(t)
  }, [codigo])

  if (me.error) return <ErrorApi error={me.error} onReintentar={me.recargar} />
  if (prefs.error) return <ErrorApi error={prefs.error} onReintentar={prefs.recargar} />
  const p = prefs.datos
  if (!p || !me.datos) return <Cargando />
  const alternar = (lista: string[], set: (x: string[]) => void, k: string) => (v: boolean) => { set(v ? [...lista, k] : lista.filter((x) => x !== k)); setOk(false) }
  const hayCambios = JSON.stringify([[...canales].sort(), [...tipos].sort(), antelacion]) !== JSON.stringify([[...p.canales].sort(), [...p.tiposAviso].sort(), p.antelacionHoras])

  async function guardar() {
    setGuardando(true); setErr(null)
    try { await api.put(`/api/notificaciones/preferencias/${me.datos!.id}`, { canales, tiposAviso: tipos, antelacionHoras: antelacion }); setOk(true); prefs.recargar() } catch (e) { setErr(aErr(e)) } finally { setGuardando(false) }
  }
  async function vincular() {
    setErr(null)
    try { setCodigo(await api.post<{ codigo: string; expiraEn: string }>('/api/notificaciones/telegram/vinculo', {})) } catch (e) { setErr(aErr(e)) }
  }
  async function desvincular() {
    setErr(null)
    try { await api.delete('/api/notificaciones/telegram/vinculo'); prefs.recargar() } catch (e) { setErr(aErr(e)) }
  }
  async function leer(a: Aviso) { try { await api.patch(`/api/notificaciones/${a.id}/leida`); avisos.recargar() } catch (e) { setErr(aErr(e)) } }
  const mm = String(Math.floor(restante / 60)).padStart(2, '0'), ss = String(restante % 60).padStart(2, '0')
  return (
    <>
      <div><h1 className="h1" style={H1}>Preferencias de aviso</h1><p className="sub">Usted elige por dónde recibir los avisos de sus citas</p></div>
      {prefs.desactualizado && <Desactualizado en={prefs.guardadoEn} />}
      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="ch"><div className="ct">Canales</div></div>
            <div className="li"><div><div className="b">Correo electrónico</div><div className="sm muted">{p.email ?? 'Sin correo registrado'}</div></div><span className="sp" /><Interruptor on={canales.includes('EMAIL')} onChange={alternar(canales, setCanales, 'EMAIL')} label="Correo electrónico" disabled={!p.email} /></div>
            <div className="li"><div><div className="b">Telegram</div><div className="sm muted">{p.telegramVinculado ? 'Cuenta vinculada' : 'Pendiente de vincular'}</div></div><span className="sp" /><Interruptor on={canales.includes('TELEGRAM')} onChange={alternar(canales, setCanales, 'TELEGRAM')} label="Telegram" disabled={!p.telegramVinculado} /></div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Tipos de aviso</div></div>
            <div className="li"><div><div className="b">Confirmación y cancelación</div><div className="sm muted">Siempre se envían</div></div></div>
            {TIPOS.map((t) => <div key={t.k} className="li"><div className="b">{t.n}</div><span className="sp" /><Interruptor on={tipos.includes(t.k)} onChange={alternar(tipos, setTipos, t.k)} label={t.n} /></div>)}
            <div className="li"><div className="b">Recordatorio con antelación</div><span className="sp" /><select className="in" style={{ width: 'auto' }} aria-label="Antelación del recordatorio" value={antelacion} onChange={(e) => { setAntelacion(Number(e.target.value)); setOk(false) }}>{[2, 6, 12, 24, 48].map((h) => <option key={h} value={h}>{h} horas antes</option>)}</select></div>
          </div>
          {err && <ErrorApi error={err} />}
          {ok && <div className="banner ok" role="status"><div><b>Preferencias guardadas</b></div></div>}
          <button type="button" className="btn pri" data-testid="guardar-prefs" disabled={!hayCambios || guardando || !online} onClick={() => void guardar()}>Guardar preferencias</button>
        </div>
        <div className="col" style={{ gap: 16 }}>
          <div className="card col" style={{ gap: 14 }}>
            <div className="ct">Vincular Telegram</div>
            {p.telegramVinculado ? <><div className="chip ok" style={{ alignSelf: 'flex-start' }}>Cuenta vinculada</div><button type="button" className="btn" disabled={!online} onClick={() => void desvincular()}>Desvincular</button></> : <>
              <div className="li" style={{ alignItems: 'flex-start' }}><span className="chip pri">1</span><div>Abra el bot de la clínica en Telegram.</div></div>
              <div className="li" style={{ alignItems: 'flex-start' }}><span className="chip pri">2</span><div>Pida su código de un solo uso y envíelo al bot:</div></div>
              {codigo && restante > 0 ? <>
                <div className="mono" data-testid="codigo-telegram" style={{ fontSize: 32, letterSpacing: '.2em', padding: 16, background: 'var(--pri-t)', color: 'var(--pri-d)', borderRadius: 10, textAlign: 'center', fontWeight: 500 }}>{codigo.codigo}</div>
                <div className="sm muted" style={{ textAlign: 'center' }}>El código vence en {mm}:{ss}</div></> : <button type="button" className="btn pri" data-testid="pedir-codigo" disabled={!online} onClick={() => void vincular()}>Generar código</button>}
            </>}
            <hr className="hr" />
            <div className="sm muted">Así nadie recibe mensajes de otra persona. Los avisos nunca incluyen diagnósticos, estudios ni especialidades; el detalle se consulta aquí.</div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Mis avisos</div></div>
            {(avisos.datos ?? []).map((a) => <div key={a.id} className="li" data-testid="aviso"><div><div className={a.leida ? '' : 'b'}>{TXT_AVISO[a.tipo] ?? a.tipo}</div><div className="sm muted">{formatoFechaHora(a.creadaEn)}</div></div><span className="sp" />{!a.leida && <button type="button" className="btn s" disabled={!online} onClick={() => void leer(a)}>Marcar como leído</button>}</div>)}
            {avisos.datos && !avisos.datos.length && <p className="ink2">Todavía no tiene avisos.</p>}
          </div>
        </div>
      </div>
    </>
  )
}

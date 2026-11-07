import { useState } from 'react'

// Datos de ejemplo del diseno. La logica offline (IndexedDB + Idempotency-Key) y las APIs llegan en una fase posterior.
const H1 = { fontSize: 28 }

export function Inicio({ online }: { online: boolean }) {
  return (
    <>
      <div><h1 className="h1" style={H1}>Hola, Carla</h1><p className="sub">Martes 3 de noviembre de 2026</p></div>
      <div className="card col" style={{ gap: 14, padding: 22 }}>
        <div className="fx wrap"><span className="chip ok">Confirmada</span><span className="sp" /><span className="sm muted">Hoy</span></div>
        <div><div className="b" style={{ fontSize: 22 }}>Cardiología · 10:00</div><div className="ink2">Dra. Valeria Antelo · Consultorio 3</div></div>
        <div className="fx wrap"><a className="btn pri" href="#/citas">Ver detalle</a><a className="btn" href="#/solicitar">Reprogramar</a></div>
      </div>
      <div className="g3">
        <a className="card col" href="#/solicitar" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Solicitar una cita</span><span className="ink2">Elija especialidad, médico y horario. Funciona también sin conexión.</span></a>
        <a className="card col" href="#/estudios" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Mis estudios</span><span className="ink2">1 informe validado por su médico.</span></a>
        <a className="card col" href="#/preferencias" style={{ textDecoration: 'none', color: 'var(--ink)', gap: 4 }}><span className="ct">Avisos por correo y Telegram</span><span className="ink2">Elija cómo recibir confirmaciones y recordatorios.</span></a>
      </div>
      <div className="banner"><div><b>Instale el portal en su dispositivo</b><span>Ábralo como una aplicación y consulte sus citas aunque no tenga conexión.</span></div><span className="sp" /><a className="btn s" href="#/instalar">Instalar</a></div>
      <div className="fx sm muted"><span className={`chip ${online ? 'ok' : 'warn'}`}>{online ? 'Todo sincronizado' : 'Cambios sin sincronizar'}</span><span>Última sincronización: hoy 09:05</span></div>
    </>
  )
}

export function Citas() {
  const [tab, setTab] = useState<'proximas' | 'historial'>('proximas')
  return (
    <>
      <div className="ph"><div><h1 className="h1" style={H1}>Mis citas</h1><p className="sub">Próximas citas e historial de reservas</p></div><span className="sp" /><a className="btn pri" href="#/solicitar">Solicitar cita</a></div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'proximas'} className={tab === 'proximas' ? 'tab on' : 'tab'} onClick={() => setTab('proximas')}>Próximas</button>
        <button type="button" role="tab" aria-selected={tab === 'historial'} className={tab === 'historial' ? 'tab on' : 'tab'} onClick={() => setTab('historial')}>Historial</button>
      </div>
      {tab === 'proximas' ? (
        <>
          <div className="card col" style={{ gap: 12 }}>
            <div className="fx wrap"><span className="chip ok">Confirmada</span><span className="sp" /><span className="mono muted">CT-20261103-0412</span></div>
            <div className="fx wrap" style={{ gap: 20 }}><div><div className="b" style={{ fontSize: 20 }}>Hoy, 3 nov · 10:00</div><div className="ink2">Cardiología · Dra. Valeria Antelo · Consultorio 3</div></div><span className="sp" /><a className="btn" href="#/solicitar">Reprogramar</a><button type="button" className="btn dng">Cancelar</button></div>
          </div>
          <div className="card col" style={{ gap: 12 }}>
            <div className="fx wrap"><span className="chip warn">Pendiente de envío</span><span className="sp" /><span className="sm muted">Guardada en este dispositivo</span></div>
            <div className="fx wrap" style={{ gap: 20 }}><div><div className="b" style={{ fontSize: 20 }}>Lun 9 nov · 08:30</div><div className="ink2">Neumología · Dr. Marcelo Suárez</div></div><span className="sp" /><a className="btn" href="#/pendientes">Ver estado</a></div>
          </div>
        </>
      ) : (
        <div className="card">
          <div className="li"><div><div className="b">12 sep · 16:30</div><div className="sm muted">Medicina general · Dr. Rodrigo Egüez</div></div><span className="sp" /><span className="chip">Atendida</span></div>
          <div className="li"><div><div className="b">4 may · 09:00</div><div className="sm muted">Neumología · Dr. Marcelo Suárez</div></div><span className="sp" /><span className="chip err">Cancelada</span></div>
        </div>
      )}
      <div className="sm muted">Una cita queda confirmada solo cuando el servidor acepta la solicitud y se registra su cargo.</div>
    </>
  )
}

const DIAS = [{ s: 'Mié', n: '4 nov' }, { s: 'Jue', n: '5 nov' }, { s: 'Vie', n: '6 nov' }, { s: 'Lun', n: '9 nov' }]
const HORAS = [{ h: '08:30' }, { h: '09:00' }, { h: '09:30', off: true }, { h: '10:30' }, { h: '11:00' }]

export function Solicitar({ online }: { online: boolean }) {
  const [dia, setDia] = useState(3)
  const [hora, setHora] = useState('08:30')
  return (
    <>
      <div><h1 className="h1" style={H1}>Solicitar una cita</h1><p className="sub">Elija especialidad, médico y horario</p></div>
      {!online && (
        <div className="banner warn"><div><b>Está sin conexión</b><span>Puede preparar su solicitud: se guardará en este dispositivo y se enviará al volver la conexión. La cita no estará confirmada hasta que el servidor la acepte.</span></div></div>
      )}
      <div className="steps">
        <div className="st done"><b>1 · Especialidad</b>Cardiología</div>
        <div className="st done"><b>2 · Médico</b>Dra. Valeria Antelo</div>
        <div className="st done"><b>3 · Horario</b>{DIAS[dia].s} {DIAS[dia].n} · {hora}</div>
        <div className="st"><b>4 · Guardar</b></div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="card col" style={{ flex: '999 1 520px', minWidth: 0, gap: 14 }}>
          <div className="ch" style={{ marginBottom: 0 }}><div className="ct">Horarios disponibles</div><span className="sp" /><span className="sm muted">Según la última sincronización · hoy 08:40</span></div>
          <div className="fx wrap" style={{ gap: 8 }}>
            {DIAS.map((d, i) => (
              <button key={d.n} type="button" className={`day${i === dia ? ' on' : ''}`} onClick={() => setDia(i)}>{d.s}<small>{d.n}</small></button>
            ))}
          </div>
          <div className="fx wrap" style={{ gap: 8 }}>
            {HORAS.map((h) => (
              <button key={h.h} type="button" className={`slot${h.off ? ' off' : hora === h.h ? ' on' : ''}`} style={{ height: 44 }} disabled={h.off} onClick={() => setHora(h.h)}>{h.h}</button>
            ))}
          </div>
        </div>
        <div className="card col" style={{ flex: '1 1 300px', maxWidth: 360, gap: 12 }}>
          <div className="ct">Su solicitud</div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Médico</span><span className="sp" /><span className="b">Dra. Valeria Antelo</span></div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Fecha</span><span className="sp" /><span className="b">{DIAS[dia].s} {DIAS[dia].n} · {hora}</span></div>
          <div className="li" style={{ padding: '6px 0' }}><span className="muted">Estado</span><span className="sp" /><span className="chip warn">Sin enviar</span></div>
          <a className="btn pri" href="#/pendientes" style={{ height: 48 }}>Guardar solicitud</a>
          <div className="sm muted">Se reenviará automáticamente con la misma clave de seguridad, sin crear reservas duplicadas.</div>
        </div>
      </div>
    </>
  )
}

export function Pendientes() {
  return (
    <>
      <div><h1 className="h1" style={H1}>Solicitudes pendientes</h1><p className="sub">Solicitudes guardadas en este dispositivo y su estado de sincronización</p></div>
      <div className="banner ok"><div><b>Conexión restablecida</b><span>Se están enviando 3 solicitudes guardadas.</span></div></div>
      <div className="card flush"><div style={{ padding: '0 18px' }}>
        <div className="li" style={{ alignItems: 'flex-start', padding: '16px 0' }}><span className="chip info">Enviando</span><div style={{ flex: 1 }}><div className="b">Cardiología · Lun 9 nov · 08:30</div><div className="sm muted">Guardada hoy 08:49 · clave <span className="mono">b84f20d1…8b36</span></div></div></div>
        <div className="li" style={{ alignItems: 'flex-start', padding: '16px 0' }}><span className="chip ok">Confirmada</span><div style={{ flex: 1 }}><div className="b">Medicina general · Jue 5 nov · 15:00</div><div className="sm muted">El servidor aceptó la solicitud y registró el cargo</div></div><a className="btn s" href="#/confirmada">Ver cita</a></div>
        <div className="li" style={{ alignItems: 'flex-start', padding: '16px 0' }}><span className="chip err">Conflicto</span><div style={{ flex: 1 }}><div className="b">Neumología · Mié 4 nov · 09:00</div><div className="ink2">Ese horario ya no está disponible. Elija otro turno.</div></div><a className="btn s pri" href="#/solicitar">Elegir otro horario</a></div>
      </div></div>
      <div className="sm muted">Cada solicitud se reenvía con su misma clave, de modo que un reintento nunca crea una reserva duplicada. Las claves caducan a las 24 horas.</div>
    </>
  )
}

export function Confirmada() {
  return (
    <>
      <div className="banner ok"><div><b>Su cita está confirmada</b><span>Recibirá un correo y un mensaje de Telegram con los datos.</span></div></div>
      <div className="card col" style={{ gap: 12, maxWidth: 640 }}>
        <div className="fx"><div className="ct">Cardiología</div><span className="sp" /><span className="chip ok">Confirmada</span></div>
        <div className="li"><span className="muted">Fecha y hora</span><span className="sp" /><span className="b">Martes 3 de noviembre · 10:00</span></div>
        <div className="li"><span className="muted">Médico</span><span className="sp" /><span className="b">Dra. Valeria Antelo</span></div>
        <div className="li"><span className="muted">Cargo registrado</span><span className="sp" /><span className="b">Bs 180</span></div>
        <div className="fx"><a className="btn pri" href="#/citas">Ir a mis citas</a><a className="btn" href="#/solicitar">Solicitar otra cita</a></div>
      </div>
    </>
  )
}

export function Datos() {
  return (
    <>
      <div><h1 className="h1" style={H1}>Mis datos</h1><p className="sub">Revise su información y solicite cambios en sus datos de contacto</p></div>
      <div className="card">
        <div className="ch"><div className="ct">Datos personales</div><span className="sp" /><span className="sm muted">Para cambiarlos, acuda a recepción</span></div>
        <div className="fg" style={{ rowGap: 14 }}>
          <div><div className="sm muted">Nombre</div><div className="b">Carla Rojas Vaca</div></div>
          <div><div className="sm muted">Documento de identidad</div><div className="b">7845123 SC</div></div>
          <div><div className="sm muted">Fecha de nacimiento</div><div className="b">12 abr 1992</div></div>
          <div><div className="sm muted">N.° de historia</div><div className="b mono">HC-004218</div></div>
        </div>
      </div>
      <div className="card col" style={{ gap: 14 }}>
        <div className="ch" style={{ marginBottom: 0 }}><div className="ct">Datos de contacto</div><span className="sp" /><span className="chip info">Solicitud en revisión</span></div>
        <div className="fg">
          <div className="field"><label htmlFor="t">Teléfono</label><input className="in" id="t" defaultValue="7612-3045" /></div>
          <div className="field"><label htmlFor="c">Correo electrónico</label><input className="in" id="c" defaultValue="carla.rojas@correo.com" /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="d">Dirección</label><input className="in" id="d" defaultValue="Av. Banzer, 3.er anillo, Santa Cruz de la Sierra" /></div>
        </div>
        <div className="fx wrap"><span className="sm muted" style={{ flex: '1 1 260px' }}>Recepción revisará su solicitud antes de actualizar su ficha.</span><button type="button" className="btn pri">Solicitar actualización</button></div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">Contactos de emergencia</div></div>
        <div className="li"><div className="av" aria-hidden="true">MR</div><div><div className="b">Marcelo Rojas Vaca</div><div className="sm muted">Hermano</div></div><span className="sp" /><span className="mono">7098-5521</span></div>
        <div className="li"><div className="av" aria-hidden="true">HV</div><div><div className="b">Hilda Vaca de Rojas</div><div className="sm muted">Madre</div></div><span className="sp" /><span className="mono">7144-2309</span></div>
      </div>
    </>
  )
}

export function Estudios() {
  return (
    <>
      <div><h1 className="h1" style={H1}>Mis estudios</h1><p className="sub">Informes validados por su médico y estudios que usted sube</p></div>
      <div className="card col" style={{ gap: 12 }}>
        <div className="fx wrap"><div><div className="ct">Radiografía de tórax</div><div className="sm muted">18 sep 2026 · Dr. Rodrigo Egüez</div></div><span className="sp" /><span className="chip ok">Informe validado</span></div>
        <p className="ink2">Informe firmado por su médico. Para conocer el significado de los resultados, consulte con su médico tratante.</p>
        <div className="fx wrap"><button type="button" className="btn">Descargar informe</button><span className="sm muted">El enlace seguro vence en unos minutos.</span></div>
      </div>
      <div className="card col" style={{ gap: 14, borderStyle: 'dashed', borderColor: 'var(--bd)' }}>
        <div className="ct">Subir un estudio previo</div>
        <div className="fx wrap" style={{ gap: 16 }}>
          <div className="xray" style={{ width: 120, height: 120, flex: 'none' }}>Vista previa</div>
          <div className="col" style={{ gap: 6, flex: '1 1 260px' }}>
            <div className="b">radiografia_2025.jpg</div>
            <div className="chip ok" style={{ alignSelf: 'flex-start' }}>Es una radiografía de tórax</div>
            <div className="sm muted">Comprobado en su dispositivo con un modelo local; la imagen aún no salió de aquí.</div>
          </div>
          <button type="button" className="btn pri">Enviar estudio</button>
        </div>
      </div>
    </>
  )
}

function Interruptor({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'sw on' : 'sw'} onClick={() => onChange(!on)} />
}

export function Preferencias() {
  const [v, setV] = useState({ correo: true, telegram: false, conf: true, rec: true, canc: true })
  const set = (k: keyof typeof v) => (x: boolean) => setV((p) => ({ ...p, [k]: x }))
  return (
    <>
      <div><h1 className="h1" style={H1}>Preferencias de aviso</h1><p className="sub">Usted elige por dónde recibir los avisos de sus citas</p></div>
      <div className="g2" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 16 }}>
          <div className="card">
            <div className="ch"><div className="ct">Canales</div></div>
            <div className="li"><div><div className="b">Correo electrónico</div><div className="sm muted">carla.rojas@correo.com</div></div><span className="sp" /><Interruptor on={v.correo} onChange={set('correo')} label="Correo electrónico" /></div>
            <div className="li"><div><div className="b">Telegram</div><div className="sm muted">Pendiente de vincular</div></div><span className="sp" /><Interruptor on={v.telegram} onChange={set('telegram')} label="Telegram" /></div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Tipos de aviso</div></div>
            <div className="li"><div className="b">Confirmación de cita</div><span className="sp" /><Interruptor on={v.conf} onChange={set('conf')} label="Confirmación de cita" /></div>
            <div className="li"><div className="b">Recordatorio</div><span className="sp" /><Interruptor on={v.rec} onChange={set('rec')} label="Recordatorio" /></div>
            <div className="li"><div className="b">Cancelación o reprogramación</div><span className="sp" /><Interruptor on={v.canc} onChange={set('canc')} label="Cancelación o reprogramación" /></div>
          </div>
        </div>
        <div className="card col" style={{ gap: 14 }}>
          <div className="ct">Vincular Telegram</div>
          <div className="li" style={{ alignItems: 'flex-start' }}><span className="chip pri">1</span><div>Abra el bot de la clínica en Telegram.</div></div>
          <div className="li" style={{ alignItems: 'flex-start' }}><span className="chip pri">2</span><div>Envíe este código de un solo uso:</div></div>
          <div className="mono" style={{ fontSize: 32, letterSpacing: '.2em', padding: 16, background: 'var(--pri-t)', color: 'var(--pri-d)', borderRadius: 10, textAlign: 'center', fontWeight: 500 }}>482 915</div>
          <div className="sm muted" style={{ textAlign: 'center' }}>El código vence en 09:42</div>
          <hr className="hr" />
          <div className="sm muted">Así nadie recibe mensajes de otra persona. Los avisos nunca incluyen diagnósticos, estudios ni especialidades; el detalle se consulta aquí.</div>
        </div>
      </div>
    </>
  )
}

export function Instalar() {
  return (
    <>
      <div><h1 className="h1" style={H1}>Instale la app en su teléfono</h1><p className="sub">Acceda más rápido y reserve citas aunque no tenga señal</p></div>
      <div className="card col" style={{ gap: 14, maxWidth: 640 }}>
        <div className="li"><span className="chip pri">1</span><div><div className="b">Abra el menú del navegador</div><div className="sm muted">Toque los tres puntos o el botón de compartir</div></div></div>
        <div className="li"><span className="chip pri">2</span><div><div className="b">Elija «Agregar a la pantalla de inicio»</div><div className="sm muted">Se creará un ícono de SIGEC</div></div></div>
        <div className="li"><span className="chip pri">3</span><div><div className="b">Abra SIGEC desde el ícono</div><div className="sm muted">Sus solicitudes guardadas se enviarán al volver la conexión</div></div></div>
        <div className="fx"><a className="btn pri" href="#/inicio" style={{ height: 46 }}>Instalar ahora</a><a className="btn gh" href="#/inicio">Ahora no</a></div>
      </div>
    </>
  )
}

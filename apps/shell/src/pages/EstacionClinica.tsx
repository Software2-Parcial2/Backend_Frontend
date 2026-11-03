import { useState } from 'react'
import './EstacionClinica.css'

type IconName =
  | 'activity'
  | 'home'
  | 'stethoscope'
  | 'chart'
  | 'wallet'
  | 'phone'
  | 'shield'
  | 'chevron'
  | 'search'
  | 'check'
  | 'x'
  | 'image'
  | 'lock'
  | 'alert'
  | 'undo'
  | 'external'

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M3 12h4l2.5-6 4 12 2.5-6h5" /></>,
    home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    stethoscope: <><path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4" /><path d="M10 12v2a5 5 0 0 0 10 0v-1" /><circle cx="20" cy="10" r="2" /></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 19h22" /></>,
    wallet: <><path d="M3 6h17v14H3zM3 8V5h14v3" /><path d="M15 12h7v5h-7z" /></>,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 5h4M11 19h2" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 15-5-5L5 20" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 9v5M12 17h.01" /></>,
    undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v7H4V6h7" /></>,
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

const navItems: { icon: IconName; label: string; meta?: string }[] = [
  { icon: 'home', label: 'Shell Inicio' },
  { icon: 'stethoscope', label: 'Estación Clínica', meta: 'Angular' },
  { icon: 'chart', label: 'Gestión BI & MCP', meta: 'Vue' },
  { icon: 'wallet', label: 'Caja & SAGA', meta: 'Laravel' },
  { icon: 'phone', label: 'PWA Móvil' },
]

const medications = [
  { drug: 'Amoxicilina + Ác. clavulánico', form: '875 / 125 mg · VO · c/12 h', duration: '7 días', notes: 'Después de alimentos' },
  { drug: 'Paracetamol', form: '500 mg · VO · c/8 h', duration: '3 días', notes: 'Si T° ≥ 38 °C' },
  { drug: 'Salbutamol inhalador', form: '100 mcg · 2 puff · c/8 h', duration: '5 días', notes: 'Usar con aerocámara' },
]

const sagaSteps = [
  { code: 'MS3', title: 'Reserva Cita', db: 'DynamoDB', status: 'Completed', state: 'done' },
  { code: 'MS6', title: 'Cargo Provisional Bs. 150', db: 'PostgreSQL', status: 'Completed', state: 'done' },
  { code: 'CAJA', title: 'Liquidación Ventanilla', db: 'POS Core', status: 'En Proceso', state: 'active' },
  { code: 'MS8', title: 'Notificación Telegram/Email', db: 'EventBridge', status: 'En Cola', state: 'queued' },
]

export function EstacionClinica() {
  const [role, setRole] = useState('Médico')
  const [roleOpen, setRoleOpen] = useState(false)
  const [gradCam, setGradCam] = useState(true)
  const [opacity, setOpacity] = useState(68)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [notice, setNotice] = useState('')
  const [notes, setNotes] = useState('Paciente refiere cuadro febril de 5 días de evolución, tos productiva y dolor pleurítico derecho. A la auscultación: crépitos basales derechos, sin signos de dificultad respiratoria aguda.')

  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2800)
  }

  return (
    <div className="app-shell">
      {notice && <div className="toast"><Icon name="check" />{notice}</div>}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="activity" size={23} /></div>
          <div>
            <div className="brand-name">SIGEC <strong>Enterprise</strong></div>
            <div className="brand-tag">MODULE FEDERATION SHELL</div>
          </div>
        </div>

        <nav className="module-nav" aria-label="Módulos SIGEC">
          {navItems.map((item, index) => (
            <button key={item.label} className={`module-tab ${index === 1 ? 'active' : ''}`} aria-current={index === 1 ? 'page' : undefined}>
              <Icon name={item.icon} />
              <span>{item.label}{item.meta && <small>{item.meta}</small>}</span>
            </button>
          ))}
        </nav>

        <div className="session-area">
          <div className="session-user">
            <div className="avatar">RT</div>
            <div><strong>Dr. Roberto Torrez</strong><span>Neumología · SCZ-4821</span></div>
          </div>
          <div className="connection"><i />Azure Container Apps · Conectado</div>
          <div className="role-control">
            <span>ROL ACTIVO</span>
            <button className="role-button" onClick={() => setRoleOpen(!roleOpen)}>{role}<Icon name="chevron" /></button>
            {roleOpen && (
              <div className="role-menu">
                {['Médico', 'Recepción', 'Caja', 'Admin'].map((item) => (
                  <button key={item} onClick={() => { setRole(item); setRoleOpen(false) }} className={role === item ? 'selected' : ''}>
                    {item}{role === item && <Icon name="check" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="workspace-heading">
        <div>
          <div className="breadcrumb"><span>Estación clínica</span><b>/</b><span>Consulta ambulatoria</span><b>/</b><strong>CONS-2025-008412</strong></div>
          <h1>Consulta neumológica</h1>
        </div>
        <div className="heading-meta">
          <span>Miércoles, 28 mayo 2025</span><b>14:32:09 BOT</b>
          <button><Icon name="external" /> Ver historia completa</button>
        </div>
      </div>

      <main className="clinical-grid">
        <section className="ehr-panel" aria-label="Historia clínica electrónica">
          <article className="patient-card">
            <div className="patient-primary">
              <div className="patient-avatar">MP</div>
              <div>
                <div className="eyebrow">PACIENTE ACTIVO · HC-0029841</div>
                <h2>Mario Paz Arteaga</h2>
                <div className="demographics">
                  <span>45 años</span><span>CI: <b>8392102 SCZ</b></span><span>Sexo: <b>M</b></span><span>Sangre: <b className="blood">O+</b></span>
                </div>
              </div>
            </div>
            <div className="emergency">
              <span>CONTACTO DE EMERGENCIA</span>
              <strong>Ana Arteaga <small>(Esposa)</small></strong>
              <b>+591 76012345</b>
            </div>
            <div className="appointment-badge">
              <div><span>Turno</span><strong>#14</strong></div>
              <p><b><i /> Confirmado</b><span>Dr. Torrez · 14:20</span></p>
            </div>
          </article>

          <div className="section-card consultation-card">
            <div className="section-header">
              <div><span className="section-index">01</span><div><h3>Anamnesis y signos vitales</h3><p>Registro clínico de la consulta actual</p></div></div>
              <span className="autosave"><i /> Autoguardado 14:31</span>
            </div>
            <div className="vitals">
              <div><span>Presión arterial</span><strong>120/80</strong><small>mmHg</small><em>En rango</em></div>
              <div><span>Frecuencia cardíaca</span><strong>84</strong><small>lpm</small><em>Regular</em></div>
              <div className="warning"><span>Saturación O₂</span><strong>93%</strong><small>SpO₂</small><em><Icon name="alert" /> Bajo</em></div>
              <div className="critical"><span>Temperatura</span><strong>38.4</strong><small>°C</small><em>Febril</em></div>
            </div>
            <label className="field-label" htmlFor="evolution">
              <span>Evolución clínica <b>OBLIGATORIO</b></span>
              <small>{notes.length} / 2.000</small>
            </label>
            <textarea id="evolution" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="section-card diagnostics-card">
            <div className="section-header">
              <div><span className="section-index">02</span><div><h3>Diagnóstico y plan terapéutico</h3><p>Codificación CIE-10 y prescripción estructurada</p></div></div>
              <span className="required-note">* Campos obligatorios</span>
            </div>
            <label className="field-label" htmlFor="diagnosis"><span>Diagnóstico principal <b>OBLIGATORIO</b></span></label>
            <div className="diagnostic-input">
              <Icon name="search" /><span className="code">CIE-10 · J18.9</span>
              <input id="diagnosis" defaultValue="Neumonía bacteriana no especificada" />
              <button aria-label="Eliminar diagnóstico"><Icon name="x" /></button>
            </div>
            <div className="table-title"><span>Prescripción farmacológica</span><button onClick={() => notify('Nueva fila de medicación habilitada')}>+ Añadir medicamento</button></div>
            <div className="medication-table">
              <div className="table-row table-head"><span>MEDICAMENTO</span><span>DOSIS / FRECUENCIA</span><span>DURACIÓN</span><span>INDICACIONES</span><span /></div>
              {medications.map((med, index) => (
                <div className="table-row" key={med.drug}>
                  <span><b>{med.drug}</b><small>Rx-{String(index + 1).padStart(2, '0')}</small></span>
                  <span>{med.form}</span><span>{med.duration}</span><span>{med.notes}</span>
                  <button aria-label={`Opciones para ${med.drug}`}>•••</button>
                </div>
              ))}
            </div>
          </div>

          <div className="signature-bar">
            <div className="certificate">
              <span><Icon name="shield" /></span>
              <div><strong>Certificado digital válido</strong><small>FNMT-SIGEC · vence 12/2026</small></div>
            </div>
            <div className="signature-actions">
              <span>Se guardará offline si pierde conexión</span>
              <button className="secondary-button" onClick={() => notify('Borrador guardado localmente')}>Guardar borrador</button>
              <button className="primary-button" onClick={() => notify('Consulta firmada y enviada al Outbox')}><Icon name="lock" /> Firmar y guardar en Outbox</button>
            </div>
          </div>
        </section>

        <aside className="radiology-panel" aria-label="Visor radiológico e inteligencia artificial">
          <div className="viewer-header">
            <div><span className="viewer-icon"><Icon name="image" /></span><div><h2>Visor Radiológico 2D</h2><p>Estudio Torácico PA · DICOM</p></div></div>
            <span className="validated"><Icon name="shield" />MobileNet Pre-Triage<span>VALIDATED · 99.8%</span></span>
          </div>

          <div className="viewer-canvas">
            <div className="image-toolbar">
              <span>W 1650 · L -600</span>
              <div><button title="Ajustar">FIT</button><button title="Vista previa">1:1</button><button title="Más opciones">•••</button></div>
            </div>
            <div className="orientation top">AP</div><div className="orientation left">R</div>
            <img src="https://images.unsplash.com/photo-1631651363531-fd29aec4cb5c?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=88&w=900&h=1050" alt="Radiografía torácica frontal del paciente" />
            {gradCam && <div className="heatmap" style={{ opacity: opacity / 100 }} />}
            <div className="scan-data left-data">SIGEC PACS<br />PA CHEST<br />KVp 120<br />SID 180 cm</div>
            <div className="scan-data right-data">2025-05-28<br />14:24:18<br />IMG 01/01</div>
            <div className="inference-pill"><span><i /> IA</span><div>Probabilidad Neumonía<strong>89.4%</strong></div><small>Inferencia CNN</small></div>
          </div>

          <div className="xai-controls">
            <div className="toggle-row">
              <button className={`toggle ${gradCam ? 'on' : ''}`} onClick={() => setGradCam(!gradCam)} role="switch" aria-checked={gradCam}><i /></button>
              <div><strong>Capa Grad-CAM Explicable (XAI)</strong><span>Mapa de activación · Lóbulo inferior derecho</span></div>
              <b>{gradCam ? 'ACTIVA' : 'OCULTA'}</b>
            </div>
            <div className="opacity-row">
              <label htmlFor="opacity">Opacidad de superposición</label>
              <input id="opacity" type="range" min="10" max="100" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} disabled={!gradCam} />
              <output>{opacity}%</output>
            </div>
          </div>

          <div className="ai-findings">
            <div className="finding-heading"><span>ANÁLISIS ASISTIDO</span><b>FASTAPI · 428 ms</b></div>
            <div className="finding-row"><span className="finding-dot high" /><div><strong>Consolidación pulmonar</strong><small>Lóbulo inferior derecho</small></div><b>0.894</b></div>
            <div className="finding-row"><span className="finding-dot medium" /><div><strong>Derrame pleural</strong><small>Ángulo costofrénico derecho</small></div><b>0.312</b></div>
          </div>

          <div className="mandate"><Icon name="alert" /><p><strong>Validación médica obligatoria</strong><span>Apoyo computacional asistivo. Este resultado no constituye diagnóstico y requiere firma médica legal.</span></p></div>
          <div className="decision-actions">
            <button className="confirm-button" onClick={() => notify('Hallazgo confirmado y adjuntado a la historia')}><Icon name="check" />Confirmar hallazgo y adjuntar</button>
            <button className="discard-button" onClick={() => notify('Hallazgo descartado; se registró la auditoría')}><Icon name="x" />Descartar</button>
          </div>
          <div className="viewer-footer"><span>AWS S3 · <b>cifrado AES-256</b></span><span>Series UID · <b>1.2.840…77109</b></span></div>
        </aside>
      </main>

      <section className={`saga-drawer ${drawerOpen ? 'open' : ''}`}>
        <button className="drawer-handle" onClick={() => setDrawerOpen(!drawerOpen)} aria-expanded={drawerOpen}>
          <span className="saga-icon"><Icon name="activity" /></span>
          <span><strong>SAGA Transaction State Monitor</strong><small>SAGA-ID: <b>sg_01JY8M42SP9W</b> · Orquestación activa</small></span>
          <i className="live-dot" />
          <em>1 EN PROCESO</em>
          <Icon name="chevron" />
        </button>
        {drawerOpen && (
          <div className="saga-content">
            <div className="saga-steps">
              {sagaSteps.map((step, index) => (
                <div className={`saga-step ${step.state}`} key={step.code}>
                  <div className="node">{step.state === 'done' ? <Icon name="check" /> : index + 1}</div>
                  <div><span>{step.code}</span><strong>{step.title}</strong><small>{step.db} · <b>{step.status}</b></small></div>
                </div>
              ))}
            </div>
            <button className="rollback-button" onClick={() => notify('Simulación de compensación preparada')}><Icon name="undo" />Simular Rollback / Compensación SAGA</button>
          </div>
        )}
      </section>
    </div>
  )
}

export default EstacionClinica;


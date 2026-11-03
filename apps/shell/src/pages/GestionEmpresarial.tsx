import { useState } from 'react'
import './GestionEmpresarial.css'

type IconName = 'pulse' | 'grid' | 'calendar' | 'chart' | 'bot' | 'bell' | 'chevron' | 'trend' | 'users' | 'clock' | 'mic' | 'send' | 'volume' | 'excel' | 'pdf' | 'spark' | 'check' | 'database' | 'filter' | 'arrow'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /><path d="M2 20h21" /></>,
    bot: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 20h4" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    trend: <><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></>,
    users: <><circle cx="9" cy="8" r="4" /><path d="M2 20a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
    volume: <><path d="M5 10H2v4h3l5 4V6zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></>,
    excel: <><path d="M5 3h10l4 4v14H5zM15 3v5h5" /><path d="m8 12 5 6M13 12l-5 6" /></>,
    pdf: <><path d="M5 3h10l4 4v14H5zM15 3v5h5" /><path d="M8 16h8M8 12h5" /></>,
    spark: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2zM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    filter: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const riskPatients = [
  { initials: 'MV', name: 'M. Vargas', specialty: 'Cardiología', time: 'Hoy · 16:30', risk: 78 },
  { initials: 'AR', name: 'A. Rojas', specialty: 'Neumología', time: 'Mañana · 08:15', risk: 72 },
  { initials: 'LC', name: 'L. Cuéllar', specialty: 'Med. General', time: 'Mañana · 11:00', risk: 68 },
]

const clusters = [
  { name: 'Med. General', value: 92, time: '08–11h', color: '#0284c7' },
  { name: 'Cardiología', value: 71, time: '14–17h', color: '#0d9488' },
  { name: 'Neumología', value: 64, time: '09–12h', color: '#0b3d5c' },
  { name: 'Pediatría', value: 53, time: '16–19h', color: '#f59e0b' },
]

function CardHeader({ icon, title, subtitle, tag }: { icon: IconName; title: string; subtitle: string; tag?: string }) {
  return (
    <div className="card-header">
      <span className="card-icon"><Icon name={icon} /></span>
      <div><h2>{title}</h2><p>{subtitle}</p></div>
      {tag && <span className="model-tag">{tag}</span>}
      <button className="more-button" aria-label="Más opciones">•••</button>
    </div>
  )
}

export function GestionEmpresarial() {
  const [period, setPeriod] = useState('Últimos 30 días')
  const [query, setQuery] = useState('')
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const submitQuery = () => {
    if (!query.trim()) return
    setMessages((current) => [...current, query.trim()])
    setQuery('')
    notify('Consulta procesada por el agente MCP')
  }

  return (
    <div className="management-app">
      {toast && <div className="toast"><Icon name="check" />{toast}</div>}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="pulse" size={22} /></span>
          <div><strong>SIGEC</strong><span>MANAGEMENT</span></div>
        </div>
        <div className="module-title">
          <span className="module-icon"><Icon name="grid" /></span>
          <div><strong>Módulo de Gestión Empresarial</strong><span>Vue 3 / GraphQL</span></div>
        </div>
        <nav aria-label="Navegación principal">
          <button className="active"><Icon name="grid" />Resumen ejecutivo</button>
          <button><Icon name="calendar" />Operaciones</button>
          <button><Icon name="chart" />Analítica</button>
          <button><Icon name="bot" />Agente MCP</button>
        </nav>
        <div className="top-actions">
          <button className="notification" aria-label="Notificaciones"><Icon name="bell" /><i /></button>
          <div className="profile"><span>FA</span><div><strong>Dr. Fernando Angulo</strong><small>Director Médico</small></div><Icon name="chevron" /></div>
        </div>
      </header>

      <main>
        <section className="page-heading">
          <div>
            <div className="breadcrumb">SIGEC <b>/</b> Gestión Empresarial <b>/</b> <strong>Resumen</strong></div>
            <h1>Visión ejecutiva</h1>
            <p>Indicadores operativos, financieros y predictivos de la red asistencial.</p>
          </div>
          <div className="heading-actions">
            <span className="sync-status"><i />Datos sincronizados · 09:42</span>
            <button className="period-button"><Icon name="calendar" />{period}<Icon name="chevron" /></button>
            <button className="filter-button" onClick={() => setPeriod(period === 'Últimos 30 días' ? 'Mes actual' : 'Últimos 30 días')}><Icon name="filter" />Filtros</button>
          </div>
        </section>

        <section className="summary-strip">
          <div><span className="summary-icon blue"><Icon name="users" /></span><p><small>CONSULTAS DEL MES</small><strong>1.284</strong><em><Icon name="trend" /> 8,2%</em></p></div>
          <div><span className="summary-icon green"><Icon name="calendar" /></span><p><small>OCUPACIÓN DE AGENDA</small><strong>87,6%</strong><em><Icon name="trend" /> 3,1%</em></p></div>
          <div><span className="summary-icon amber"><Icon name="clock" /></span><p><small>ESPERA PROMEDIO</small><strong>18 min</strong><em className="neutral">−2 min</em></p></div>
          <div><span className="summary-icon slate"><Icon name="bot" /></span><p><small>CONSULTAS AL AGENTE MCP</small><strong>342</strong><em><Icon name="trend" /> 24%</em></p></div>
        </section>

        <section className="bento-grid">
          <article className="card attendance-card">
            <CardHeader icon="users" title="Predicción de Ausencias (No-Shows)" subtitle="Asistencia proyectada para los próximos 7 días" tag="RANDOM FOREST ML" />
            <div className="attendance-overview">
              <div className="donut-wrap">
                <svg viewBox="0 0 120 120" role="img" aria-label="85,8 por ciento de asistencia prevista">
                  <circle cx="60" cy="60" r="46" className="donut-track" />
                  <circle cx="60" cy="60" r="46" className="donut-value" pathLength="100" strokeDasharray="85.8 14.2" />
                </svg>
                <div><strong>85,8%</strong><span>asistencia<br />prevista</span></div>
              </div>
              <div className="attendance-legend">
                <div><i className="attend" /><span>Asistencia prevista<small>487 pacientes</small></span><strong>85,8%</strong></div>
                <div><i className="risk" /><span>Riesgo de ausencia<small>81 pacientes</small></span><strong>14,2%</strong></div>
                <p><Icon name="trend" /><span><strong>−2,4 pp</strong> de riesgo vs. semana anterior</span></p>
              </div>
            </div>
            <div className="risk-heading"><span>PACIENTES DE ALTO RIESGO</span><b>Probabilidad</b></div>
            <div className="risk-table">
              {riskPatients.map((patient) => (
                <div className="risk-row" key={patient.name}>
                  <span className="patient-avatar">{patient.initials}</span>
                  <span><strong>{patient.name}</strong><small>{patient.specialty}</small></span>
                  <span className="appointment-time">{patient.time}</span>
                  <span className="risk-score">{patient.risk}%</span>
                  <button onClick={() => notify(`Recordatorio enviado a ${patient.name}`)}>Enviar Telegram</button>
                </div>
              ))}
            </div>
          </article>

          <article className="card demand-card">
            <CardHeader icon="chart" title="Segmentación de Demanda Horaria" subtitle="Clústeres de demanda por especialidad" tag="K-MEANS · K=4" />
            <div className="cluster-summary">
              <div><small>CLÚSTER DOMINANTE</small><strong>C1 · Alta demanda</strong><span>08:00–11:00</span></div>
              <div><small>CAPACIDAD SUGERIDA</small><strong>+3 médicos</strong><span>para cubrir el pico</span></div>
            </div>
            <div className="bar-chart">
              <div className="y-axis"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
              <div className="chart-area">
                <div className="grid-lines"><i /><i /><i /><i /></div>
                {clusters.map((cluster) => (
                  <div className="bar-column" key={cluster.name}>
                    <div className="bar-value">{cluster.value}</div>
                    <div className="bar" style={{ height: `${cluster.value}%`, background: cluster.color }}><span>{cluster.time}</span></div>
                    <strong>{cluster.name}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="cluster-legend"><span><i className="c1" />C1 Alta</span><span><i className="c2" />C2 Media</span><span><i className="c3" />C3 Estable</span><span><i className="c4" />C4 Variable</span></div>
          </article>

          <article className="card revenue-card">
            <CardHeader icon="trend" title="Recaudación Consolidada" subtitle="Consultas facturadas" tag="MS6 · LARAVEL" />
            <div className="revenue-total"><span>ESTE MES</span><strong><small>Bs.</small> 84.350</strong><p><Icon name="trend" /> 12,6% <span>vs. mes anterior</span></p></div>
            <div className="target"><div><span>Meta mensual</span><strong>Bs. 100.000</strong></div><div className="target-track"><i /></div><small>84,4% completado</small></div>
            <div className="specialty-title">DISTRIBUCIÓN POR ESPECIALIDAD</div>
            <div className="specialty-breakdown">
              <div><span><i className="pneumo" />Neumología</span><b>42%</b><small>Bs. 35.427</small></div>
              <div><span><i className="general" />Medicina General</span><b>30%</b><small>Bs. 25.305</small></div>
              <div><span><i className="cardio" />Cardiología</span><b>28%</b><small>Bs. 23.618</small></div>
            </div>
            <button className="details-button" onClick={() => notify('Abriendo detalle financiero consolidado')}>Ver detalle financiero <Icon name="arrow" /></button>
          </article>

          <article className="agent-card">
            <header className="agent-header">
              <div className="agent-title"><span><Icon name="spark" /></span><div><h2>Agente Inteligente Directivo</h2><p>Protocolo MCP & Gemini · Inteligencia institucional segura</p></div></div>
              <div className="agent-state"><i /><span><strong>AGENTE EN LÍNEA</strong><small>Gemini 2.5 Pro · Latencia 1,2 s</small></span></div>
            </header>
            <div className="agent-body">
              <div className="chat-console">
                <div className="chat-history">
                  <div className="date-divider"><span>HOY · 09:38</span></div>
                  <div className="user-message">
                    <div>FA</div><p><span>Director Médico</span>¿Qué especialidades necesitan refuerzo de personal la próxima semana y cuál sería el impacto estimado?</p>
                  </div>
                  <div className="assistant-message">
                    <div className="ai-avatar"><Icon name="spark" /></div>
                    <div className="assistant-content">
                      <div className="assistant-label"><strong>Agente SIGEC</strong><span>Analizado en 1,2 s</span></div>
                      <p>El principal déficit proyectado está en <strong>Medicina General, entre 08:00 y 11:00</strong>. Recomiendo habilitar 3 turnos médicos adicionales de lunes a miércoles.</p>
                      <div className="insight-grid">
                        <div><span>DEMANDA PROYECTADA</span><strong>+18,4%</strong><small>156 consultas adicionales</small></div>
                        <div><span>IMPACTO EN ESPERA</span><strong>−7 min</strong><small>de 18 a 11 minutos</small></div>
                        <div><span>INGRESO POTENCIAL</span><strong>Bs. 9.360</strong><small>estimación semanal</small></div>
                      </div>
                      <p>Cardiología presenta un pico secundario el jueves entre 14:00 y 17:00; puede cubrirse redistribuyendo un turno sin aumentar dotación.</p>
                      <div className="sources"><Icon name="database" /><span><strong>Fuentes institucionales verificadas</strong>pgvector: Protocolo de Dotación v3.2 · Agenda MS3 · Facturación MS6</span><b>3 fuentes</b></div>
                      <div className="chat-actions">
                        <button onClick={() => notify('Reproduciendo reporte ejecutivo')}><Icon name="volume" />Escuchar reporte (TTS)</button>
                        <button onClick={() => notify('Reporte exportado a Excel')}><Icon name="excel" />Exportar a Excel</button>
                        <button onClick={() => notify('PDF generado correctamente')}><Icon name="pdf" />Descargar PDF</button>
                      </div>
                    </div>
                  </div>
                  {messages.map((message, index) => <div className="followup" key={`${message}-${index}`}><span>FA</span><p>{message}</p></div>)}
                </div>
                <div className="query-box">
                  <div className="query-input">
                    <button className={listening ? 'listening' : ''} onClick={() => { setListening(!listening); notify(listening ? 'Captura de voz detenida' : 'Escuchando pregunta…') }} aria-label="Hacer pregunta por voz"><Icon name="mic" /></button>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitQuery()} placeholder="Pregunte sobre operación, demanda, finanzas o protocolos institucionales…" />
                    <span>⌘ K</span>
                    <button className="send-button" onClick={submitQuery} aria-label="Enviar consulta"><Icon name="send" /></button>
                  </div>
                  <p><Icon name="check" />Las respuestas omiten SQL crudo y respetan las políticas de acceso RBAC institucional.</p>
                </div>
              </div>
              <aside className="agent-context">
                <div className="context-heading"><span>CONTEXTO MCP ACTIVO</span><i>4 conectores</i></div>
                <div className="connector"><span className="connector-icon"><Icon name="database" /></span><div><strong>PostgreSQL Analítico</strong><small>Solo lectura · 34 vistas</small></div><i /></div>
                <div className="connector"><span className="connector-icon"><Icon name="calendar" /></span><div><strong>Agenda MS3</strong><small>Tiempo real · GraphQL</small></div><i /></div>
                <div className="connector"><span className="connector-icon"><Icon name="trend" /></span><div><strong>Facturación MS6</strong><small>Conciliado · hace 4 min</small></div><i /></div>
                <div className="connector"><span className="connector-icon"><Icon name="spark" /></span><div><strong>Protocolos pgvector</strong><small>218 documentos indexados</small></div><i /></div>
                <div className="security-note"><Icon name="check" /><div><strong>Gobernanza aplicada</strong><p>Sin acceso a datos clínicos identificables. Auditoría habilitada.</p></div></div>
                <div className="suggested-title">PREGUNTAS SUGERIDAS</div>
                <button className="suggestion" onClick={() => setQuery('¿Qué servicios están bajo su meta mensual?')}>¿Qué servicios están bajo su meta mensual?<Icon name="arrow" /></button>
                <button className="suggestion" onClick={() => setQuery('Resume los riesgos operativos de esta semana')}>Resume los riesgos operativos de esta semana<Icon name="arrow" /></button>
              </aside>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}

export default GestionEmpresarial;


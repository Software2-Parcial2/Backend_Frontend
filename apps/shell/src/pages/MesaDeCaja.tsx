import { useState } from 'react'
import './MesaDeCaja.css'

type IconName = 'pulse' | 'search' | 'cash' | 'card' | 'transfer' | 'check' | 'clock' | 'circle' | 'receipt' | 'shield' | 'user' | 'calendar' | 'chevron' | 'bell' | 'lock' | 'undo' | 'info' | 'print' | 'arrow' | 'copy'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9H5M19 15h-2" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    transfer: <><path d="M4 7h14M14 3l4 4-4 4M20 17H6M10 13l-4 4 4 4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    circle: <circle cx="12" cy="12" r="8" />,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 20h4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    undo: <><path d="M9 7 4 12l5 5" /><path d="M5 12h8a6 6 0 0 1 6 6" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    print: <><path d="M7 9V3h10v6M7 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-3" /><path d="M7 14h10v7H7z" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

const paymentOptions: { id: 'cash' | 'pos' | 'transfer'; title: string; detail: string; icon: IconName }[] = [
  { id: 'cash', title: 'Efectivo', detail: 'Pago en bolivianos', icon: 'cash' },
  { id: 'pos', title: 'POS Tarjeta', detail: 'Débito o crédito', icon: 'card' },
  { id: 'transfer', title: 'Transferencia Interna', detail: 'Cuenta institucional', icon: 'transfer' },
]

export function MesaDeCaja() {
  const [payment, setPayment] = useState<'cash' | 'pos' | 'transfer'>('cash')
  const [search, setSearch] = useState('')
  const [transactionState, setTransactionState] = useState<'pending' | 'committed' | 'rolledback'>('pending')
  const [toast, setToast] = useState('')

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const commit = () => {
    setTransactionState('committed')
    notify('Cobro registrado. La cita fue confirmada y el recibo emitido.')
  }

  const rollback = () => {
    setTransactionState('rolledback')
    notify('Rollback compensatorio ejecutado. El cargo provisional fue revertido.')
  }

  return (
    <div className="billing-app">
      {toast && <div className={`toast ${transactionState === 'rolledback' ? 'danger' : ''}`}><Icon name={transactionState === 'rolledback' ? 'undo' : 'check'} />{toast}</div>}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="pulse" size={22} /></span>
          <div><strong>SIGEC</strong><small>ENTERPRISE</small></div>
        </div>
        <div className="module">
          <span className="module-symbol"><Icon name="receipt" /></span>
          <div><strong>Facturación Interna</strong><small>MS6 · Laravel Settlement Service</small></div>
        </div>
        <div className="environment"><i />Producción · SAGA Orchestrator conectado</div>
        <div className="top-actions">
          <button aria-label="Notificaciones"><Icon name="bell" /><i /></button>
          <div className="operator"><span>LM</span><div><strong>Lucía Méndez</strong><small>Caja Central · Ventanilla 03</small></div><Icon name="chevron" /></div>
        </div>
      </header>

      <main>
        <div className="page-heading">
          <div>
            <div className="breadcrumb">SIGEC <b>/</b> Facturación Interna <b>/</b> <strong>Liquidación de consultas</strong></div>
            <h1>Mesa de caja</h1>
            <p>Liquidación transaccional de prestaciones y confirmación de citas.</p>
          </div>
          <div className="desk-meta"><span><Icon name="calendar" />28 mayo 2025</span><b>14:36:22 BOT</b></div>
        </div>

        <section className="search-section" aria-label="Búsqueda de pacientes">
          <div className="search-copy">
            <span><Icon name="search" /></span>
            <div><strong>Buscar atención pendiente</strong><small>Ingrese una Cédula de Identidad o identificador de cita</small></div>
          </div>
          <div className="search-field">
            <Icon name="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && notify('Atención #4892 encontrada')} placeholder="Ej. 8392102 SCZ o CITA-2025-04892" />
            {search && <span>CI</span>}
            <button onClick={() => notify('Atención #4892 encontrada')}>Buscar atención <Icon name="arrow" /></button>
          </div>
          <div className="shortcut"><span>Atajo</span><kbd>F2</kbd></div>
        </section>

        <div className="content-grid">
          <section className="settlement-card">
            <header className="card-heading">
              <div className="heading-icon"><Icon name="receipt" /></div>
              <div><span>LIQUIDACIÓN PENDIENTE</span><h2>Consulta Médica #4892</h2><p>Mario Paz Arteaga</p></div>
              <span className={`status-badge ${transactionState}`}>
                <i />{transactionState === 'pending' ? 'Pendiente de cobro' : transactionState === 'committed' ? 'Cobro confirmado' : 'Cargo compensado'}
              </span>
            </header>

            <div className="patient-strip">
              <div className="patient-avatar">MP</div>
              <div className="patient-info"><span>PACIENTE</span><strong>Mario Paz Arteaga</strong><small>CI 8392102 SCZ · 45 años</small></div>
              <div><span>ESPECIALIDAD</span><strong>Neumología</strong><small>Dr. Roberto Torrez</small></div>
              <div><span>FECHA Y HORA</span><strong>28 may 2025 · 14:20</strong><small>Turno #14 · Consultorio 04</small></div>
              <div className="confirmed"><Icon name="check" /><span><strong>Cita validada</strong><small>MS3 · DynamoDB</small></span></div>
            </div>

            <div className="settlement-body">
              <div className="section-label"><span>01</span><div><strong>Detalle de liquidación</strong><small>Valores expresados en bolivianos</small></div></div>
              <div className="invoice-table">
                <div className="invoice-head"><span>CONCEPTO</span><span>CANT.</span><span>PRECIO UNIT.</span><span>IMPORTE</span></div>
                <div className="invoice-row">
                  <span><b>Consulta Especialidad Neumología</b><small>Prestación ambulatoria · COD. NEU-C01</small></span>
                  <span>1</span><span>Bs. 150,00</span><strong>Bs. 150,00</strong>
                </div>
              </div>
              <div className="totals">
                <div><span>Subtotal</span><b>Bs. 150,00</b></div>
                <div><span>Descuento institucional</span><b>Bs. 0,00</b></div>
                <div className="grand-total"><span>Total a pagar<small>Impuestos incluidos</small></span><strong><em>Bs.</em> 150,00</strong></div>
              </div>

              <div className="section-label payment-label"><span>02</span><div><strong>Método de pago</strong><small>Seleccione cómo se registrará el cobro</small></div></div>
              <div className="payment-options">
                {paymentOptions.map((option) => (
                  <button key={option.id} className={payment === option.id ? 'selected' : ''} onClick={() => setPayment(option.id)}>
                    <span className="payment-icon"><Icon name={option.icon} /></span>
                    <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                    <i>{payment === option.id && <Icon name="check" />}</i>
                  </button>
                ))}
              </div>
              {payment === 'cash' && (
                <div className="cash-assistance">
                  <div><label htmlFor="received">Monto recibido</label><span><b>Bs.</b><input id="received" defaultValue="150,00" /></span></div>
                  <div><span>CAMBIO A ENTREGAR</span><strong>Bs. 0,00</strong></div>
                  <p><Icon name="info" />Verifique el efectivo antes de confirmar el cobro.</p>
                </div>
              )}
              {payment === 'pos' && <div className="method-note"><Icon name="card" /><span><strong>Terminal POS 03 disponible</strong>El número de autorización se solicitará al confirmar.</span></div>}
              {payment === 'transfer' && <div className="method-note"><Icon name="transfer" /><span><strong>Conciliación institucional</strong>Se generará una referencia de transferencia única.</span></div>}
            </div>
          </section>

          <aside className="transaction-panel">
            <header><div><span><Icon name="shield" /></span><div><strong>Transacción distribuida SAGA</strong><small>Estado de servicios participantes</small></div></div><b>LIVE</b></header>
            <div className="saga-reference">
              <span>SAGA TRANSACTION ID</span>
              <div><code>sg_01JY8M42SP9W4892</code><button onClick={() => notify('ID de transacción copiado')} aria-label="Copiar identificador"><Icon name="copy" /></button></div>
            </div>
            <div className="stepper">
              <div className="step done">
                <div className="step-line"><span><Icon name="check" /></span><i /></div>
                <div><b>1</b><strong>MS3 · Cita Reservada</strong><small>DynamoDB</small><em>COMPLETADO · 14:18:03</em></div>
              </div>
              <div className={`step ${transactionState === 'rolledback' ? 'compensated' : 'done'}`}>
                <div className="step-line"><span>{transactionState === 'rolledback' ? <Icon name="undo" /> : <Icon name="check" />}</span><i /></div>
                <div><b>2</b><strong>MS6 · Cargo Provisional Creado</strong><small>PostgreSQL · Bs. 150,00</small><em>{transactionState === 'rolledback' ? 'COMPENSADO' : 'COMPLETADO · 14:18:04'}</em></div>
              </div>
              <div className={`step ${transactionState === 'committed' ? 'done' : transactionState === 'rolledback' ? 'stopped' : 'current'}`}>
                <div className="step-line"><span><Icon name={transactionState === 'committed' ? 'check' : transactionState === 'rolledback' ? 'circle' : 'clock'} /></span><i /></div>
                <div><b>3</b><strong>Pago en Ventanilla</strong><small>Caja Central · Ventanilla 03</small><em>{transactionState === 'committed' ? 'COMPLETADO · AHORA' : transactionState === 'rolledback' ? 'CANCELADO' : 'ACTUAL · ESPERANDO ACCIÓN'}</em></div>
              </div>
              <div className={`step ${transactionState === 'committed' ? 'done' : 'pending'}`}>
                <div className="step-line"><span><Icon name={transactionState === 'committed' ? 'check' : 'circle'} /></span></div>
                <div><b>4</b><strong>Notificación y Recibo</strong><small>MS8 · Telegram / Email</small><em>{transactionState === 'committed' ? 'EMITIDO · AHORA' : 'PENDIENTE'}</em></div>
              </div>
            </div>
            <div className="idempotency">
              <div><Icon name="lock" /><span><strong>Solicitud protegida contra duplicados</strong><small>La operación puede reintentarse de forma segura.</small></span></div>
              <code>Idempotency-Key: c9f1-4b2a-8921-ef...</code>
              <span>TTL: <b>24h</b></span>
            </div>
            <div className="audit-note"><Icon name="info" /><p><strong>Auditoría transaccional activa</strong><span>La confirmación registrará operador, caja, hora y método de pago.</span></p></div>
          </aside>
        </div>

        <section className="action-bar">
          <div className="action-summary"><span>Total seleccionado</span><strong>Bs. 150,00</strong><small><Icon name={paymentOptions.find((item) => item.id === payment)?.icon ?? 'cash'} />{paymentOptions.find((item) => item.id === payment)?.title}</small></div>
          <div className="action-controls">
            {transactionState === 'committed' && <button className="print-button" onClick={() => notify('Recibo enviado a la cola de impresión')}><Icon name="print" />Imprimir recibo</button>}
            <button className="rollback-button" onClick={rollback} disabled={transactionState !== 'pending'}><Icon name="undo" /><span>Cancelar turno<small>Disparar rollback compensatorio</small></span></button>
            <button className="commit-button" onClick={commit} disabled={transactionState !== 'pending'}><Icon name="shield" /><span>Registrar cobro y confirmar cita<small>SAGA COMMIT</small></span><Icon name="arrow" /></button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default MesaDeCaja;


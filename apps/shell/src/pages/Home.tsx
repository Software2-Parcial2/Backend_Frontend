import { dinero, fechaLocal, formatoDiaLargo, formatoHora, sumarDias } from '@sigec/api-client';
import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { useGet } from '../api/ApiProvider';
import { Cargando, ErrorApi } from '../components/Estado';
import { rolesFromToken } from '../auth/sigecUser';
import { ROLE_LABEL, primaryRole } from '../layout/menu';

interface Kpi { v: string; l: string }
interface Fila { id: string; hora: string; paciente: string; detalle: string; estado: string; tono: string }
interface Accion { label: string; to: string; pri?: boolean }
interface Resumen {
  kpis: Kpi[];
  titulo: string;
  link?: { label: string; to: string };
  filas?: Fila[];
  vacioLista?: string;
}

const saludo = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

const ACCIONES: Record<string, Accion[]> = {
  recepcion: [{ label: 'Registrar paciente', to: '/clinica#/pacientes/nuevo', pri: true }, { label: 'Reservar cita', to: '/clinica#/reservar' }],
  medico: [{ label: 'Ver mi agenda', to: '/clinica#/agenda-medico', pri: true }, { label: 'Estudios radiológicos', to: '/clinica#/estudios' }],
  caja: [{ label: 'Registrar cobro', to: '/clinica#/cobro', pri: true }, { label: 'Caja y cargos', to: '/clinica#/caja' }],
  administrador: [{ label: 'Abrir dashboard', to: '/gestion', pri: true }, { label: 'Asistente de reportes', to: '/gestion#/asistente' }],
};

const TONO_CITA: Record<string, [string, string]> = {
  CONFIRMADA: ['Confirmada', 'ok'],
  EN_SALA: ['En sala', 'info'],
  ATENDIDA: ['Atendida', 'ok'],
  RESERVA_TEMPORAL: ['Reserva temporal', 'warn'],
  NO_ASISTIO: ['No asistió', 'err'],
};

interface Celda { hora: string; fechaHora: string; estado: string; citaId?: string; paciente?: { nombre: string | null; numeroHistoria: string | null } }
interface Medico { medicoId: string; nombre: string; especialidadNombre: string; celdas: Celda[]; resumen: { citas: number; atendidas: number; enSala: number; libres: number; reservasTemporales: number } }
interface Agenda { medicos: Medico[] }

/** Citas del dia como filas «Proximas llegadas» (las libres y bloqueadas no cuentan). */
function filasDeAgenda(medicos: Pick<Medico, 'nombre' | 'especialidadNombre' | 'celdas'>[]): Fila[] {
  return medicos
    .flatMap((m) => m.celdas.filter((c) => c.citaId && TONO_CITA[c.estado]).map((c) => ({ m, c })))
    .sort((a, b) => a.c.fechaHora.localeCompare(b.c.fechaHora))
    .map(({ m, c }) => ({
      id: c.citaId!,
      hora: formatoHora(c.fechaHora),
      paciente: c.paciente?.nombre ?? 'Paciente sin nombre',
      detalle: `${m.especialidadNombre} · ${m.nombre}`,
      estado: TONO_CITA[c.estado]![0],
      tono: TONO_CITA[c.estado]![1],
    }));
}

function Recepcion() {
  const q = useGet<Agenda>('/api/citas/agenda', { fecha: fechaLocal() });
  return (
    <Panel q={q} armar={(a): Resumen => {
      const suma = (k: keyof Medico['resumen']) => a.medicos.reduce((s, m) => s + m.resumen[k], 0);
      return {
        titulo: 'Próximas llegadas',
        kpis: [{ v: String(suma('citas')), l: 'Citas de hoy' }, { v: String(suma('enSala')), l: 'Pacientes en sala de espera' }, { v: String(suma('reservasTemporales')), l: 'Reservas temporales por vencer' }],
        link: { label: 'Ver agenda', to: '/clinica#/agenda' },
        filas: filasDeAgenda(a.medicos).slice(0, 8),
        vacioLista: 'No hay citas registradas para hoy.',
      };
    }} />
  );
}

interface AgendaMedico { celdas: Celda[]; nombre: string; especialidadNombre: string; resumen: Medico['resumen'] }
interface Pagina<T> { items: T[]; siguiente: string | null }

function MedicoInicio() {
  const agenda = useGet<AgendaMedico>('/api/citas/agenda/medico/me', { fecha: fechaLocal() });
  const estudios = useGet<Pagina<{ id: string }>>('/api/imagenes', { validacion: 'PENDIENTE', estado: 'ANALIZADA', limite: 100 });
  return (
    <Panel q={agenda} armar={(a): Resumen => {
      const porValidar = estudios.data ? `${estudios.data.items.length}${estudios.data.siguiente ? '+' : ''}` : '…';
      return {
        titulo: 'Pacientes de hoy',
        kpis: [{ v: String(a.resumen.citas), l: 'Pacientes de hoy' }, { v: porValidar, l: 'Estudios por validar' }, { v: String(a.resumen.enSala), l: 'En sala de espera' }],
        link: { label: 'Ver agenda', to: '/clinica#/agenda-medico' },
        filas: filasDeAgenda([a]),
        vacioLista: 'No tiene citas para hoy.',
      };
    }} />
  );
}

interface Balance { totalCobrado: string; moneda: string; pendiente: { monto: string; cargos: number } }
interface Factura { id: string; numeroCargo: string; pacienteNombre: string | null; especialidad: string | null; monto: string; moneda: string; estado: string }

function CajaInicio() {
  const balance = useGet<Balance>('/api/facturacion/balance');
  const cargos = useGet<Pagina<Factura>>('/api/facturacion/facturas', { porCobrar: true, limite: 6 });
  return (
    <Panel q={balance} armar={(b): Resumen => ({
      titulo: 'Cargos pendientes',
      kpis: [
        { v: String(b.pendiente.cargos), l: 'Cargos pendientes' },
        { v: dinero(b.pendiente.monto, b.moneda, { sinCentavos: true }), l: 'Por cobrar' },
        { v: dinero(b.totalCobrado, b.moneda, { sinCentavos: true }), l: 'Cobrado hoy' },
      ],
      link: { label: 'Ver caja', to: '/clinica#/caja' },
      filas: (cargos.data?.items ?? []).map((f) => ({ id: f.id, hora: f.numeroCargo.slice(-4), paciente: f.pacienteNombre ?? 'Paciente sin nombre', detalle: `${f.numeroCargo} · ${f.especialidad ?? 'Atención'}`, estado: dinero(f.monto, f.moneda), tono: f.estado === 'CONFIRMADA' ? 'ok' : 'warn' })),
      vacioLista: cargos.isLoading ? 'Cargando cargos…' : 'No hay cargos por cobrar.',
    })} />
  );
}

interface ResumenCitas { grupos: { clave: string; total: number; atendidas: number }[] }
interface Ingreso { periodo: string; confirmado: string; moneda: string }

function DireccionInicio() {
  const hoy = fechaLocal();
  const desde = `${hoy.slice(0, 7)}-01`;
  const hasta = sumarDias(`${sumarDias(desde, 31).slice(0, 7)}-01`, -1);
  const citas = useGet<ResumenCitas>('/api/citas/resumen', { desde: `${desde}T00:00:00Z`, hasta: `${hasta}T23:59:59Z`, agruparPor: 'estado' });
  const ingresos = useGet<Ingreso[]>('/api/facturacion/facturas/ingresos', { desde, hasta, agrupar: 'mes' });
  const alertas = useGet<Pagina<{ id: string }>>('/api/inteligencia/alertas', { estado: 'ABIERTA', limite: 100 });
  return (
    <Panel q={citas} armar={(c): Resumen => {
      const realizadas = c.grupos.reduce((s, g) => s + g.atendidas, 0);
      const ing = ingresos.data?.[0];
      return {
        titulo: 'Resumen',
        kpis: [
          { v: String(realizadas), l: 'Citas atendidas del mes' },
          { v: ingresos.isLoading ? '…' : ing ? dinero(ing.confirmado, ing.moneda, { sinCentavos: true }) : 'Bs 0', l: 'Ingresos confirmados del mes' },
          { v: alertas.data ? `${alertas.data.items.length}${alertas.data.siguiente ? '+' : ''}` : alertas.isError ? '—' : '…', l: 'Alertas activas' },
        ],
      };
    }} />
  );
}

/** Pinta KPIs y lista de un rol a partir de una lectura; los estados cargando/error son los comunes. */
function Panel<T>({ q, armar }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data: T | undefined }; armar: (d: T) => Resumen }) {
  if (q.isLoading) return <Cargando filas={2} etiqueta="Cargando el resumen del día…" />;
  if (q.isError) return <ErrorApi error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === undefined) return null;
  const r = armar(q.data);
  return (
    <>
      <div className="g3" data-testid="kpis">
        {r.kpis.map((k) => (
          <div className="card kpi" key={k.l}>
            <span className="v">{k.v}</span>
            <span className="l">{k.l}</span>
          </div>
        ))}
      </div>
      {r.filas && (
        <div className="card">
          <div className="ch">
            <div className="ct">{r.titulo}</div>
            <span className="sp" />
            {r.link && <Link className="btn s gh" to={r.link.to}>{r.link.label}</Link>}
          </div>
          {r.filas.length === 0 && <p className="muted" style={{ padding: '8px 0' }} data-testid="vacio">{r.vacioLista}</p>}
          {r.filas.map((f) => (
            <div className="li" key={f.id}>
              <span className="mono" style={{ minWidth: 54 }}>{f.hora}</span>
              <div>
                <div className="b">{f.paciente}</div>
                <div className="sm muted">{f.detalle}</div>
              </div>
              <span className="sp" />
              <span className={`chip ${f.tono}`}>{f.estado}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const POR_ROL: Record<string, ComponentType> = {
  recepcion: Recepcion,
  medico: MedicoInicio,
  caja: CajaInicio,
  administrador: DireccionInicio,
};

export function Home() {
  const auth = useAuth();
  if (!auth.isAuthenticated || !auth.user) {
    return (
      <div className="page">
        <p>Inicia sesión para usar SIGEC.</p>
      </div>
    );
  }
  const roles = rolesFromToken(auth.user.access_token);
  const role = primaryRole(roles);
  const Vista = role ? POR_ROL[role] : undefined;
  const nombre = String(auth.user.profile.preferred_username ?? '');

  return (
    <div className="page">
      <div>
        <h1 className="h1">
          {saludo()}, {nombre}
        </h1>
        <p className="sub" style={{ textTransform: 'capitalize' }}>{formatoDiaLargo(new Date())}</p>
      </div>

      {Vista && role ? (
        <>
          <Vista />
          <div className="fx wrap">
            {ACCIONES[role]!.map((a) => (
              <Link key={a.to} className={a.pri ? 'btn pri' : 'btn'} to={a.to} style={{ height: 46 }}>
                {a.label}
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="banner warn">
          <div>
            <b>Tu usuario no tiene un rol de personal</b>
            <span>Si eres paciente, usa el portal del paciente. Si no, pide acceso al administrador.</span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="ct" style={{ marginBottom: 8 }}>Sesión</div>
        <p>
          Usuario: <strong data-testid="username">{nombre}</strong>
        </p>
        <p>
          Roles: <strong data-testid="roles">{roles.join(', ') || '—'}</strong>
          {role && <span className="muted"> · {ROLE_LABEL[role]}</span>}
        </p>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useAuth } from 'react-oidc-context';
import { rolesFromToken } from '../auth/sigecUser';
import { ROLE_LABEL, primaryRole } from '../layout/menu';

interface Kpi { v: string; l: string }
interface Arrival { hora: string; paciente: string; detalle: string; estado: string; tono: string }
interface HomeData {
  kpis: Kpi[];
  acciones: { label: string; to: string; pri?: boolean }[];
  titulo: string;
  lista?: { titulo: string; link: { label: string; to: string }; filas: Arrival[] };
}

// Datos de ejemplo del diseno (shell-recepcion / shell-medico / shell-caja / shell-direccion).
const POR_ROL: Record<string, HomeData> = {
  recepcion: {
    titulo: 'Próximas llegadas',
    kpis: [
      { v: '38', l: 'Citas de hoy' },
      { v: '4', l: 'Pacientes en sala de espera' },
      { v: '1', l: 'Reserva temporal por vencer' },
    ],
    acciones: [
      { label: 'Registrar paciente', to: '/clinica#/pacientes/nuevo', pri: true },
      { label: 'Reservar cita', to: '/clinica#/reservar' },
    ],
    lista: {
      titulo: 'Próximas llegadas',
      link: { label: 'Ver agenda', to: '/clinica#/agenda' },
      filas: [
        { hora: '10:00', paciente: 'Carla Rojas Vaca', detalle: 'Cardiología · Dra. Valeria Antelo', estado: 'Confirmada', tono: 'ok' },
        { hora: '10:00', paciente: 'Daniela Flores', detalle: 'Medicina general · Dr. Rodrigo Egüez', estado: 'Reserva temporal', tono: 'warn' },
        { hora: '10:30', paciente: 'Valentina Roca', detalle: 'Pediatría · Dra. Natalia Heredia', estado: 'Confirmada', tono: 'ok' },
      ],
    },
  },
  medico: {
    titulo: 'Pacientes de hoy',
    kpis: [
      { v: '12', l: 'Pacientes de hoy' },
      { v: '2', l: 'Estudios por validar' },
      { v: '1', l: 'Consulta en curso' },
    ],
    acciones: [
      { label: 'Ver mi agenda', to: '/clinica#/agenda-medico', pri: true },
      { label: 'Estudios radiológicos', to: '/clinica#/estudios' },
    ],
    lista: {
      titulo: 'Pacientes de hoy',
      link: { label: 'Ver agenda', to: '/clinica#/agenda' },
      filas: [
        { hora: '10:00', paciente: 'Carla Rojas Vaca', detalle: 'Control cardiológico', estado: 'En sala', tono: 'ok' },
        { hora: '10:30', paciente: 'Mateo Arias Rojas', detalle: 'Primera consulta', estado: 'Confirmada', tono: 'info' },
      ],
    },
  },
  caja: {
    titulo: 'Cargos pendientes',
    kpis: [
      { v: '7', l: 'Cargos pendientes' },
      { v: 'Bs 3.640', l: 'Por cobrar hoy' },
      { v: 'Bs 5.120', l: 'Cobrado hoy' },
    ],
    acciones: [
      { label: 'Registrar cobro', to: '/clinica#/cobro', pri: true },
      { label: 'Caja y cargos', to: '/clinica#/caja' },
    ],
  },
  administrador: {
    titulo: 'Resumen',
    kpis: [
      { v: '1.284', l: 'Citas realizadas' },
      { v: 'Bs 212.400', l: 'Ingresos del mes' },
      { v: '3', l: 'Alertas activas' },
    ],
    acciones: [
      { label: 'Abrir dashboard', to: '/gestion', pri: true },
      { label: 'Asistente de reportes', to: '/gestion#/asistente' },
    ],
  },
};

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

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
  const data = role ? POR_ROL[role] : undefined;
  const nombre = String(auth.user.profile.preferred_username ?? '');
  const fecha = new Intl.DateTimeFormat('es-BO', { dateStyle: 'full' }).format(new Date());

  return (
    <div className="page">
      <div>
        <h1 className="h1">
          {saludo()}, {nombre}
        </h1>
        <p className="sub" style={{ textTransform: 'capitalize' }}>{fecha}</p>
      </div>

      {data ? (
        <>
          <div className="g3">
            {data.kpis.map((k) => (
              <div className="card kpi" key={k.l}>
                <span className="v">{k.v}</span>
                <span className="l">{k.l}</span>
              </div>
            ))}
          </div>
          <p className="sm muted">Cifras de ejemplo del diseño; se conectarán a los servicios en una fase posterior.</p>
          <div className="fx wrap">
            {data.acciones.map((a) => (
              <Link key={a.to} className={a.pri ? 'btn pri' : 'btn'} to={a.to} style={{ height: 46 }}>
                {a.label}
              </Link>
            ))}
          </div>
          {data.lista && (
            <div className="card">
              <div className="ch">
                <div className="ct">{data.lista.titulo}</div>
                <span className="sp" />
                <Link className="btn s gh" to={data.lista.link.to}>{data.lista.link.label}</Link>
              </div>
              {data.lista.filas.map((f) => (
                <div className="li" key={f.hora + f.paciente}>
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

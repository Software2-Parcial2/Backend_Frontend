import { useGet } from '../../api/ApiProvider';
import { Cargando, ErrorApi } from '../../components/Estado';

interface ServicioSalud { nombre: string; estado: 'OK' | 'CAIDO'; ms: number; detalle: string | null }
interface Salud { estado: 'OK' | 'DEGRADADO' | 'CAIDO'; verificadoEn: string; servicios: ServicioSalud[] }

const TECNOLOGIA: Record<string, [string, string]> = {
  gateway: ['Gateway', 'Spring Cloud Gateway'],
  keycloak: ['Keycloak', 'Identidad y accesos'],
  'ms2-pacientes': ['MS2 Pacientes', 'Spring Boot · PostgreSQL'],
  'ms3-citas': ['MS3 Citas', 'NestJS · DynamoDB'],
  'ms4-historias': ['MS4 Historias clínicas', 'Spring Boot · PostgreSQL'],
  'ms5-imagenes': ['MS5 Imágenes e IA', 'NestJS · FastAPI · S3 · MongoDB'],
  'ms6-facturacion': ['MS6 Facturación', 'Laravel · PostgreSQL'],
  'ms7-inteligencia': ['MS7 Inteligencia', 'NestJS · FastAPI · pgvector'],
  'ms8-notificaciones': ['MS8 Notificaciones', 'NestJS · n8n · DynamoDB'],
};

/** Estado de la pila: GET /api/salud consulta el /health de cada componente. Se refresca solo cada 30 s. */
export function Servicios() {
  const q = useGet<Salud>('/api/salud', undefined, { refetchMs: 30_000 });
  const caidos = q.data?.servicios.filter((s) => s.estado === 'CAIDO') ?? [];
  return (
    <div className="page">
      <div className="ph"><div><h1 className="h1">Estado de servicios</h1><p className="sub">Comprobación de salud de cada componente (/health){q.data ? ` · verificado ${new Date(q.data.verificadoEn).toLocaleTimeString('es-BO')}` : ''}</p></div><span className="sp" /><button type="button" className="btn" onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Comprobando…' : 'Comprobar ahora'}</button></div>
      {q.isLoading ? <Cargando filas={5} etiqueta="Comprobando servicios…" /> : q.isError ? <ErrorApi error={q.error} onRetry={() => void q.refetch()} /> : q.data && (
        <>
          <div className="card flush"><div className="scroll"><table className="tbl">
            <thead><tr><th>Servicio</th><th>Tecnología</th><th>Estado</th><th>Respuesta</th></tr></thead>
            <tbody>{q.data.servicios.map((s) => {
              const [nombre, tec] = TECNOLOGIA[s.nombre] ?? [s.nombre, '—'];
              const lento = s.estado === 'OK' && s.ms > 1000;
              return (
                <tr key={s.nombre} data-testid="fila-servicio">
                  <td className="b">{nombre}</td><td>{tec}</td>
                  <td><span className={`chip ${s.estado === 'CAIDO' ? 'err' : lento ? 'warn' : 'ok'}`}>{s.estado === 'CAIDO' ? (s.detalle ?? 'Sin respuesta') : lento ? 'Lento' : 'Operativo'}</span></td>
                  <td className="mono">{s.estado === 'CAIDO' ? '—' : `${s.ms.toLocaleString('es-BO')} ms`}</td>
                </tr>
              );
            })}</tbody>
          </table></div></div>
          {caidos.length > 0 && <div className="banner err" role="alert"><div><b>{caidos.map((s) => TECNOLOGIA[s.nombre]?.[0] ?? s.nombre).join(', ')} no responde{caidos.length > 1 ? 'n' : ''}</b><span>Los avisos quedan en cola y se reintentan; las citas siguen confirmándose cuando el servicio vuelve.</span></div></div>}
          {caidos.length === 0 && <div className="banner ok" role="status"><div><b>Todos los servicios responden</b></div></div>}
        </>
      )}
    </div>
  );
}

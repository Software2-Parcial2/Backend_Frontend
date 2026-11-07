import { ApiError } from '@sigec/api-client';
import type { ReactNode } from 'react';

/** Texto para el usuario segun el tipo de fallo (sin jerga tecnica). */
export function mensajeDeError(e: unknown): { titulo: string; texto: string } {
  if (!(e instanceof ApiError)) return { titulo: 'No se pudo completar la operación', texto: e instanceof Error ? e.message : 'Ocurrió un error inesperado.' };
  switch (e.estado) {
    case 0:
      return { titulo: 'Sin conexión con el servidor', texto: 'Revise su red e intente de nuevo. Lo que ya estaba cargado sigue visible.' };
    case 401:
      return { titulo: 'Su sesión venció', texto: 'Vuelva a iniciar sesión para continuar.' };
    case 403:
      return { titulo: 'No tiene permiso para esto', texto: 'Su rol no incluye esta operación. El intento quedó registrado.' };
    case 404:
      return { titulo: 'No se encontró', texto: e.detalle ?? 'El registro no existe o fue eliminado.' };
    case 409:
      return { titulo: 'La operación entra en conflicto', texto: e.detalle ?? 'El estado actual no lo permite.' };
    case 503:
      return { titulo: 'El servicio no está disponible', texto: e.detalle ?? 'Intente de nuevo en unos minutos.' };
    default:
      return { titulo: e.estado >= 500 ? 'Error del servidor' : 'No se pudo completar', texto: e.detalle ?? e.message };
  }
}

/** Cargando: filas «fantasma» con las clases de la tabla del diseno. */
export function Cargando({ filas = 3, etiqueta = 'Cargando…' }: { filas?: number; etiqueta?: string }) {
  return (
    <div className="card col" style={{ gap: 12 }} role="status" aria-live="polite" aria-label={etiqueta}>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} style={{ height: 14, borderRadius: 6, background: 'var(--line, #e5e9eb)', width: `${90 - i * 15}%`, opacity: 0.7 }} />
      ))}
      <span className="sm muted">{etiqueta}</span>
    </div>
  );
}

/** Error con el detalle que dio el servidor, el codigo de soporte y reintento. */
export function ErrorApi({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { titulo, texto } = mensajeDeError(error);
  const cid = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <div className="banner err" role="alert">
      <div>
        <b>{titulo}</b>
        <span>{texto}</span>
        {cid && <span className="sm mono" data-testid="correlation-id">Código de soporte: {cid}</span>}
      </div>
      {onRetry && (
        <button type="button" className="btn s" onClick={onRetry}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function Vacio({ texto, children }: { texto: string; children?: ReactNode }) {
  return (
    <div className="card col muted" style={{ textAlign: 'center', padding: 28, gap: 8 }} data-testid="vacio">
      <span>{texto}</span>
      {children}
    </div>
  );
}

/** Resuelve los tres estados de una lectura: cargando, error o vacio; si hay datos llama a `children`. */
export function Datos<T>({ q, vacio, filas, children }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown; data: T | undefined }; vacio?: (d: T) => string | false; filas?: number; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <Cargando filas={filas} />;
  if (q.isError) return <ErrorApi error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === undefined) return null;
  const v = vacio?.(q.data);
  if (v) return <Vacio texto={v} />;
  return <>{children(q.data)}</>;
}

import { ApiError, esperarCita, nuevoUuid, type ClienteApi } from '@sigec/api-client';
import { useEffect, useSyncExternalStore } from 'react';
import { db } from './db';

/**
 * Cola de solicitudes de cita (SQLite). Misma logica que la PWA: cada solicitud nace con su Idempotency-Key y la conserva en cada
 * reintento, de modo que un envio cortado a medias nunca crea una reserva duplicada. Las claves valen 24 horas.
 */
export type EstadoSolicitud = 'PENDIENTE' | 'ENVIANDO' | 'CONFIRMANDO' | 'CONFIRMADA' | 'CONFLICTO' | 'CADUCADA';
export interface Solicitud {
  id: string; clave: string; creada: number; intentos: number; estado: EstadoSolicitud; citaId?: string; error?: string;
  cuerpo: { pacienteId: string; medicoId: string; especialidad: string; fechaHora: string };
  resumen: { especialidad: string; medico: string };
}
export const VIGENCIA_CLAVE_MS = 24 * 3_600_000;

let instantanea: Solicitud[] = [];
const oyentes = new Set<() => void>();

async function refrescar() {
  const filas = await (await db()).getAllAsync<{ datos: string }>('SELECT datos FROM cola ORDER BY creada');
  instantanea = filas.map((f) => JSON.parse(f.datos) as Solicitud);
  oyentes.forEach((f) => f());
}
async function guardar(s: Solicitud) {
  await (await db()).runAsync('INSERT OR REPLACE INTO cola (id, clave, datos, creada) VALUES (?, ?, ?, ?)', [s.id, s.clave, JSON.stringify(s), s.creada]);
  await refrescar();
}
async function actualizar(s: Solicitud, cambios: Partial<Solicitud>) { await guardar(Object.assign(s, cambios)); }

export async function agregarSolicitud(cuerpo: Solicitud['cuerpo'], resumen: Solicitud['resumen']): Promise<Solicitud> {
  const s: Solicitud = { id: nuevoUuid(), clave: nuevoUuid(), cuerpo, resumen, estado: 'PENDIENTE', creada: Date.now(), intentos: 0 };
  await guardar(s);
  return s;
}
export async function descartarSolicitud(id: string) { await (await db()).runAsync('DELETE FROM cola WHERE id = ?', [id]); await refrescar(); }
export async function reintentarSolicitud(id: string) {
  const s = instantanea.find((x) => x.id === id);
  if (s) await actualizar(s, { estado: 'PENDIENTE', error: undefined, clave: nuevoUuid(), creada: Date.now(), citaId: undefined }); // otra intencion: clave nueva
}

let enCurso = false;
export async function procesarCola(api: ClienteApi): Promise<void> {
  if (enCurso) return;
  enCurso = true;
  try {
    await refrescar();
    for (const s of [...instantanea]) {
      if (s.estado === 'CONFIRMADA' || s.estado === 'CONFLICTO' || s.estado === 'CADUCADA') continue;
      if (s.estado === 'PENDIENTE' && Date.now() - s.creada > VIGENCIA_CLAVE_MS) {
        await actualizar(s, { estado: 'CADUCADA', error: 'Pasaron más de 24 horas: vuelva a solicitar la cita.' });
        continue;
      }
      try {
        if (!s.citaId) {
          await actualizar(s, { estado: 'ENVIANDO', intentos: s.intentos + 1, error: undefined });
          const r = await api.post<{ citaId: string }>('/api/citas', s.cuerpo, { clave: s.clave });
          await actualizar(s, { estado: 'CONFIRMANDO', citaId: r.citaId });
        }
        const c = await esperarCita(api, s.citaId!, { maxMs: 30_000 });
        if (c.estado === 'CANCELADA' || c.estado === 'CANCELADA_USUARIO') await actualizar(s, { estado: 'CONFLICTO', error: c.motivoFallo ?? 'La cita no pudo confirmarse.' });
        else await actualizar(s, { estado: 'CONFIRMADA' });
      } catch (e) {
        if (e instanceof ApiError && e.code === 'TIEMPO_AGOTADO') await actualizar(s, { estado: 'CONFIRMANDO', error: 'El servidor sigue procesando la cita.' });
        else if (e instanceof ApiError && (e.estado === 409 || e.estado === 422 || e.estado === 400)) await actualizar(s, { estado: 'CONFLICTO', error: e.estado === 409 ? 'Ese horario ya no está disponible. Elija otro turno.' : (e.detalle ?? e.message) });
        else await actualizar(s, { estado: s.citaId ? 'CONFIRMANDO' : 'PENDIENTE', error: e instanceof ApiError && e.estado === 0 ? 'Sin conexión: se enviará al volver.' : (e instanceof Error ? e.message : 'Error al enviar') });
        if (e instanceof ApiError && (e.estado === 0 || e.estado === 401)) break;
      }
    }
  } finally {
    enCurso = false;
  }
}

/** Solicitudes de la cola; reintenta al abrir la app y cada 20 s (React Native no emite «online» como el navegador). */
export function useCola(api: ClienteApi): Solicitud[] {
  const lista = useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => instantanea);
  useEffect(() => {
    void procesarCola(api);
    const t = setInterval(() => void procesarCola(api), 20_000);
    return () => clearInterval(t);
  }, [api]);
  return lista;
}

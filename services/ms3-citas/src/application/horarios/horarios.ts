import { SolicitudInvalidaError } from '../../domain/cita.js';

/** Horario semanal de un medico y sus bloqueos (puro, sin framework). Las horas de la plantilla son LOCALES de la clinica. */

export interface DiaPlantilla {
  /** 1 = lunes ... 7 = domingo. */
  dia: number;
  atiende: boolean;
  /** HH:MM locales; solo si atiende. */
  desde?: string;
  hasta?: string;
  consultorio?: string;
}

export interface Plantilla {
  medicoId: string;
  /** Minutos por consulta. */
  duracionMin: number;
  dias: DiaPlantilla[];
  version: number;
  actualizadaEn: number;
}

export interface Bloqueo {
  id: string;
  medicoId: string;
  /** ISO 8601 UTC, inclusive. */
  desde: string;
  hasta: string;
  motivo: string;
  creadoPor: string;
  creadoEn: number;
}

/** Diferencia entre la hora local de la clinica y UTC, en minutos (Bolivia, UTC-4, sin horario de verano). */
export const OFFSET_POR_DEFECTO_MIN = -240;

export const DURACIONES = [10, 15, 20, 30, 45, 60];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

const minutos = (hhmm: string) => {
  const m = HHMM.exec(hhmm)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Plantilla por defecto: nadie atiende. */
export function plantillaVacia(medicoId: string): Plantilla {
  return { medicoId, duracionMin: 30, dias: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({ dia, atiende: false })), version: 0, actualizadaEn: 0 };
}

/** Valida y normaliza una plantilla enviada por el cliente (lanza SolicitudInvalidaError). */
export function validarPlantilla(medicoId: string, duracionMin: number, dias: DiaPlantilla[], now: number, versionPrevia = 0): Plantilla {
  if (!DURACIONES.includes(duracionMin)) throw new SolicitudInvalidaError(`duracionMin debe ser una de ${DURACIONES.join(', ')}`);
  const vistos = new Set<number>();
  const normalizados: DiaPlantilla[] = [];
  for (const d of dias) {
    if (!Number.isInteger(d.dia) || d.dia < 1 || d.dia > 7) throw new SolicitudInvalidaError('dia debe ir de 1 (lunes) a 7 (domingo)');
    if (vistos.has(d.dia)) throw new SolicitudInvalidaError(`el dia ${d.dia} esta repetido`);
    vistos.add(d.dia);
    if (!d.atiende) {
      normalizados.push({ dia: d.dia, atiende: false });
      continue;
    }
    if (!d.desde || !d.hasta || !HHMM.test(d.desde) || !HHMM.test(d.hasta)) throw new SolicitudInvalidaError(`el dia ${d.dia} necesita desde y hasta en formato HH:MM`);
    if (minutos(d.desde) + duracionMin > minutos(d.hasta)) throw new SolicitudInvalidaError(`el dia ${d.dia}: el rango no alcanza para una consulta de ${duracionMin} min`);
    normalizados.push({ dia: d.dia, atiende: true, desde: d.desde, hasta: d.hasta, ...(d.consultorio ? { consultorio: d.consultorio.trim() } : {}) });
  }
  for (let dia = 1; dia <= 7; dia++) if (!vistos.has(dia)) normalizados.push({ dia, atiende: false });
  normalizados.sort((a, b) => a.dia - b.dia);
  return { medicoId, duracionMin, dias: normalizados, version: versionPrevia + 1, actualizadaEn: now };
}

export function parseFecha(f: string): { y: number; m: number; d: number } {
  const m = FECHA.exec(f);
  if (!m) throw new SolicitudInvalidaError('la fecha debe ser AAAA-MM-DD');
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new SolicitudInvalidaError('la fecha no existe');
  return { y, m: mo, d };
}

/** Inicio y fin (UTC, ISO) de un dia LOCAL de la clinica. */
export function limitesDelDia(fecha: string, offsetMin = OFFSET_POR_DEFECTO_MIN): { desde: string; hasta: string; desdeMs: number; hastaMs: number } {
  const { y, m, d } = parseFecha(fecha);
  const desdeMs = Date.UTC(y, m - 1, d) - offsetMin * 60_000;
  const hastaMs = desdeMs + 24 * 3600_000 - 1;
  return { desde: new Date(desdeMs).toISOString(), hasta: new Date(hastaMs).toISOString(), desdeMs, hastaMs };
}

/** HH:MM local de un instante UTC. */
export function horaLocal(iso: string, offsetMin = OFFSET_POR_DEFECTO_MIN): string {
  const local = new Date(Date.parse(iso) + offsetMin * 60_000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Horarios (ISO UTC) que genera la plantilla entre dos fechas locales, ambas inclusive. Un dia sin atencion no genera nada.
 * Lanza si el rango es mayor a `maxDias`.
 */
export function generarSlots(p: Plantilla, desde: string, hasta: string, offsetMin = OFFSET_POR_DEFECTO_MIN, maxDias = 62): string[] {
  const a = parseFecha(desde);
  const b = parseFecha(hasta);
  const inicio = Date.UTC(a.y, a.m - 1, a.d);
  const fin = Date.UTC(b.y, b.m - 1, b.d);
  if (fin < inicio) throw new SolicitudInvalidaError('hasta no puede ser anterior a desde');
  const dias = (fin - inicio) / 86400_000 + 1;
  if (dias > maxDias) throw new SolicitudInvalidaError(`el rango maximo es de ${maxDias} dias`);
  const slots: string[] = [];
  for (let t = inicio; t <= fin; t += 86400_000) {
    const dow = new Date(t).getUTCDay() === 0 ? 7 : new Date(t).getUTCDay();
    const dia = p.dias.find((x) => x.dia === dow);
    if (!dia?.atiende || !dia.desde || !dia.hasta) continue;
    for (let min = minutos(dia.desde); min + p.duracionMin <= minutos(dia.hasta); min += p.duracionMin) {
      slots.push(new Date(t + min * 60_000 - offsetMin * 60_000).toISOString());
    }
  }
  return slots;
}

/** El instante cae dentro de algun bloqueo (limites inclusivos). */
export function bloqueoQueCubre(iso: string, bloqueos: Bloqueo[]): Bloqueo | undefined {
  const t = Date.parse(iso);
  return bloqueos.find((b) => Date.parse(b.desde) <= t && t <= Date.parse(b.hasta));
}

export function validarBloqueo(desde: string, hasta: string, motivo: string, now: number): { desde: string; hasta: string; motivo: string } {
  const d = new Date(desde);
  const h = new Date(hasta);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime())) throw new SolicitudInvalidaError('desde y hasta deben ser fechas ISO 8601');
  if (h.getTime() < d.getTime()) throw new SolicitudInvalidaError('hasta no puede ser anterior a desde');
  if (h.getTime() < now) throw new SolicitudInvalidaError('el bloqueo debe terminar en el futuro');
  if (h.getTime() - d.getTime() > 90 * 86400_000) throw new SolicitudInvalidaError('un bloqueo puede abarcar como maximo 90 dias');
  if (!motivo.trim()) throw new SolicitudInvalidaError('el motivo es obligatorio');
  return { desde: d.toISOString(), hasta: h.toISOString(), motivo: motivo.trim() };
}

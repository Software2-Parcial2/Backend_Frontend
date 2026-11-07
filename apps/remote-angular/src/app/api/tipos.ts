/** Formas de las respuestas de la API que usan las pantallas (los contratos completos estan en contracts/openapi). */

export interface Paciente {
  id: string;
  numeroHistoria: string;
  nombre: string;
  documento: string;
  fechaNacimiento: string;
  edad: number;
  sexo: 'F' | 'M' | 'OTRO' | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  beca: boolean;
  tipoSeguro: 'NINGUNO' | 'PUBLICO' | 'PRIVADO' | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Contacto { id: string; pacienteId: string; nombre: string; parentesco: string; telefono: string }

export interface Solicitud {
  id: string;
  pacienteId: string;
  pacienteNombre: string | null;
  campo: 'TELEFONO' | 'EMAIL' | 'DIRECCION';
  valorActual: string | null;
  valorPropuesto: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivoRechazo: string | null;
  solicitadaEn: string;
  resueltaEn: string | null;
  resueltaPor: string | null;
}

export interface Cita {
  citaId: string;
  estado: string;
  pacienteId: string;
  medicoId: string;
  especialidad: string;
  fechaHora: string;
  facturaId?: string | null;
  notificacion?: string;
  motivoFallo?: string | null;
  asistencia?: string | null;
  cancelacion?: { motivo: string; por: string; en: string } | null;
  reprogramaciones?: { desde: string; hacia: string; por: string; en: string }[];
  saga?: { estado: string; paso: string; intentos: number; venceEn: string | null; compensaciones: string[]; anulacionCobro: unknown };
  pasos?: { en: string; paso: string; evento: string; detalle: string | null }[];
}

export interface Especialidad { id: string; codigo: string; nombre: string; activa: boolean }
export interface Medico { id: string; nombre: string; matricula: string; especialidad: { codigo: string; nombre: string }; consultorio: string | null; activo: boolean }

/** Estado de una cita -> texto y tono del chip (ok, warn, err, info, pri o vacio). */
export function estadoCita(estado: string): { texto: string; tono: string } {
  switch (estado) {
    case 'CONFIRMADA': return { texto: 'Confirmada', tono: 'ok' };
    case 'EN_SALA': return { texto: 'En sala', tono: 'info' };
    case 'ATENDIDA': return { texto: 'Atendida', tono: '' };
    case 'NO_ASISTIO': return { texto: 'No asistió', tono: 'err' };
    case 'PENDIENTE':
    case 'RESERVADA':
    case 'COBRO_PROVISIONAL': return { texto: 'En proceso', tono: 'warn' };
    case 'CANCELADA': return { texto: 'Cancelada por el sistema', tono: 'err' };
    case 'CANCELADA_USUARIO': return { texto: 'Cancelada', tono: 'err' };
    case 'ANULADA': return { texto: 'Anulada', tono: 'err' };
    default: return { texto: estado, tono: '' };
  }
}

export const nombreEspecialidad = (codigo: string | null | undefined): string => (codigo ? codigo.charAt(0).toUpperCase() + codigo.slice(1).replace(/_/g, ' ') : '—');

// --- MS3: agenda, horarios y SAGA ---
export type EstadoCelda = 'LIBRE' | 'RESERVA_TEMPORAL' | 'CONFIRMADA' | 'EN_SALA' | 'ATENDIDA' | 'NO_ASISTIO' | 'BLOQUEADO';
export interface Celda { hora: string; fechaHora: string; estado: EstadoCelda; citaId?: string; paciente?: { id: string; nombre: string | null; numeroHistoria: string | null }; motivo?: string; reservaExpiraEn?: string }
export interface ResumenDia { citas: number; atendidas: number; enSala: number; libres: number; reservasTemporales: number }
export interface AgendaMedico { medicoId: string; nombre: string; especialidad: string; especialidadNombre: string; consultorio: string | null; celdas: Celda[]; resumen: ResumenDia }
export interface AgendaDia { fecha: string; zonaHoraria: string; medicos: AgendaMedico[] }
export interface Disponibilidad { fechaHora: string; estado: 'LIBRE' | 'OCUPADO' | string }

export interface PasoSaga { orden: number; servicio: string; nombre: string; estado: 'COMPLETADO' | 'EN_CURSO' | 'FALLIDO' | 'COMPENSADO' | 'NO_EJECUTADO' | 'PENDIENTE_REINTENTO'; detalle: string | null; siFalla: string; en: string | null }
export interface HistorialCita {
  citaId: string;
  estado: string;
  saga: { estado: string; paso: string; anulacionCobro: unknown };
  pasos: PasoSaga[];
  compensacion: { pasos?: string[]; motivo?: string } | null;
  cancelacion: { motivo: string; por: string; en: string } | null;
  reprogramaciones: { desde: string; hacia: string; por: string; en: string }[];
  asistencia: string | null;
  transiciones: { en: string; paso: string; evento: string; detalle: string | null }[];
}

export interface DiaPlantilla { dia: number; atiende: boolean; desde?: string; hasta?: string; consultorio?: string }
export interface PlantillaHorario { medicoId: string; duracionMin: number; dias: DiaPlantilla[]; version: number; actualizadaEn: number }
export interface Bloqueo { id: string; medicoId: string; desde: string; hasta: string; motivo: string; creadoPor: string; creadoEn: number }

export interface Tarifa { id: string; especialidad: string; nombre: string | null; tipo: string; monto: string; moneda: string; vigenteDesde: string; vigenteHasta: string | null; estado: 'VIGENTE' | 'PROGRAMADA' | 'CERRADA' | string }
export interface Factura { id: string; numeroCargo: string; citaId: string | null; pacienteId: string; pacienteNombre: string | null; especialidad: string | null; fechaCita: string | null; monto: string; moneda: string; estado: string; motivoAnulacion: string | null; anuladaEn: string | null; creadaEn: string; actualizadaEn: string }

import { fechaLocal, inicioDelDia, sumarDias } from '@sigec/api-client';
/** Intervalo UTC [inicio, fin) de un dia de la clinica (AAAA-MM-DD), para consultar disponibilidad. */
export function rangoDelDia(fecha: string): { desde: string; hasta: string } {
  return { desde: inicioDelDia(fecha), hasta: inicioDelDia(sumarDias(fecha, 1)) };
}
/** Los proximos `n` dias (desde hoy) como fechas AAAA-MM-DD. */
export function proximosDias(n: number, desde = fechaLocal()): string[] {
  return Array.from({ length: n }, (_, i) => sumarDias(desde, i));
}
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function etiquetaDia(fecha: string): { s: string; n: string } {
  const d = new Date(`${fecha}T12:00:00Z`);
  return { s: DIAS_CORTO[d.getUTCDay()]!, n: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` };
}

export const ESTADOS_FINALES = ['CONFIRMADA', 'CANCELADA', 'CANCELADA_USUARIO', 'ANULADA', 'EN_SALA', 'ATENDIDA', 'NO_ASISTIO'];
export function chipPaso(estado: string): { texto: string; tono: string; punto: string } {
  switch (estado) {
    case 'COMPLETADO': return { texto: 'Completado', tono: 'ok', punto: '' };
    case 'EN_CURSO': return { texto: 'En curso', tono: 'warn', punto: 'warn' };
    case 'FALLIDO': return { texto: 'Falló', tono: 'err', punto: 'err' };
    case 'COMPENSADO': return { texto: 'Compensado', tono: 'warn', punto: 'warn' };
    case 'PENDIENTE_REINTENTO': return { texto: 'Reintentando', tono: 'warn', punto: 'warn' };
    default: return { texto: 'No ejecutado', tono: '', punto: 'mute' };
  }
}

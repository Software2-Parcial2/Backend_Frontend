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

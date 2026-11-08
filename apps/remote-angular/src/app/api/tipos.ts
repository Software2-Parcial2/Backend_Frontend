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

// --- MS4: historias clinicas ---
export interface HistoriaClinica { id: string; pacienteId: string; numeroHistoria: string | null; pacienteNombre: string | null; creada: string; version: number }
export interface RecetaFila { medicamento: string; dosis?: string | null; frecuencia?: string | null; duracion?: string | null }
export interface Consulta {
  id: string; historiaId: string; medicoId: string; citaId: string | null; fecha: string; motivo: string; diagnostico: string | null; tratamiento: string | null;
  indicaciones: string | null; signosVitales: Record<string, string> | null; receta: RecetaFila[]; estado: 'BORRADOR' | 'FIRMADA'; firmadaEn: string | null; version: number;
}
export interface Antecedente { id: string; historiaId: string; tipo: 'ALERGIA' | 'PERSONAL' | 'FAMILIAR' | 'QUIRURGICO' | 'MEDICACION'; descripcion: string; activo: boolean; creado: string; version: number }
export interface EstudioHistoria { imagenId: string; pacienteId: string; medicoId: string | null; estudio: string; validacion: string; decision: string | null; validadoEn: string | null; versionModelo: string | null; huella: string | null }
export interface Evolucion { id: string; consultaId: string; medicoId: string; fecha: string; nota: string }
export interface RecetaImprimible { consultaId: string; fecha: string; firmadaEn: string; indicaciones: string | null; items: RecetaFila[]; medicoId: string; numeroHistoria: string | null; pacienteNombre: string | null }
export interface AccesoAuditoria { id: number; accion: string; recurso: string; rol: string; usuarioId: string; historiaId: string; pacienteId: string; ocurridoEn: string }

export const TIPOS_ANTECEDENTE: { valor: Antecedente['tipo']; texto: string }[] = [
  { valor: 'ALERGIA', texto: 'Alergia' }, { valor: 'PERSONAL', texto: 'Personal' }, { valor: 'FAMILIAR', texto: 'Familiar' },
  { valor: 'QUIRURGICO', texto: 'Quirúrgico' }, { valor: 'MEDICACION', texto: 'Medicación' },
];
export const textoAntecedente = (t: string): string => TIPOS_ANTECEDENTE.find((x) => x.valor === t)?.texto ?? t;

// --- MS5: imagenes y estudios ---
export interface Imagen {
  id: string; pacienteId: string; estudio: string; estado: string; hashSha256: string; mime: string; bytes: number; origen?: string;
  validacion: 'PENDIENTE' | 'VALIDADO' | 'DESCARTADO'; observaciones: string | null; pacienteNombre: string | null; numeroHistoria: string | null; tieneGradcam: boolean;
  informe: { decision: string; texto: string; validadoPor: string; validadoEn: string; huella: string; versionModelo: string } | null;
  resultado: { probabilidad_neumonia?: number; clase?: string; version_modelo?: string; modelo?: string; aviso?: string } | null;
  error: string | null; aviso: string; creadaEn: string; actualizadaEn: string;
}
/** Estado de un estudio para la bandeja: texto, tono del chip y si tiene sentido abrirlo para validar. */
export function estadoEstudio(i: Pick<Imagen, 'estado' | 'validacion'>): { texto: string; tono: string; revisar: boolean } {
  if (i.validacion === 'VALIDADO') return { texto: 'Informe validado', tono: 'ok', revisar: false };
  if (i.validacion === 'DESCARTADO') return { texto: 'Descartado', tono: '', revisar: false };
  if (i.estado === 'ANALIZADA') return { texto: 'Resultado por validar', tono: 'warn', revisar: true };
  if (/ERROR|FALL|RECHAZ|INVALID/.test(i.estado)) return { texto: 'Análisis fallido', tono: 'err', revisar: false };
  return { texto: 'Procesando', tono: 'info', revisar: false };
}

// --- MS6: caja y tarifario ---
export interface Balance { fecha: string; turno: string | null; moneda: string; totalCobrado: string; porMetodo: Record<'EFECTIVO' | 'TRANSFERENCIA' | 'POS', string>; cobros: number; anulaciones: number; pendiente: { monto: string; cargos: number } }
export interface Movimiento { en: string; hora: string; comprobante: string | null; cargo: string; facturaId: string; paciente: { id: string; nombre: string | null }; metodo: string | null; monto: string; estado: string; motivo: string | null }
export interface ComprobanteCaja { anulado: boolean; aviso: string; cajero: string; cambio: string; cargo: string; concepto: string; emitidoEn: string; facturaId: string; fechaCita: string | null; metodo: string; moneda: string; numero: string; paciente: { id?: string; nombre?: string | null }; recibido: string | null; referencia: string | null; total: string }
export interface PagoRegistrado { comprobante: ComprobanteCaja; factura: Factura; pago: { id: string; metodo: string; monto: string; cambio: string; comprobante: string } }
export const METODOS_PAGO: { v: 'EFECTIVO' | 'TRANSFERENCIA' | 'POS'; t: string }[] = [{ v: 'EFECTIVO', t: 'Efectivo' }, { v: 'TRANSFERENCIA', t: 'Transferencia interna' }, { v: 'POS', t: 'Terminal POS' }];
export const textoMetodo = (m: string | null): string => METODOS_PAGO.find((x) => x.v === m)?.t ?? '—';
export function estadoFactura(e: string): { texto: string; tono: string } {
  switch (e) {
    case 'PROVISIONAL': return { texto: 'Provisional', tono: 'warn' };
    case 'CONFIRMADA': return { texto: 'Confirmado', tono: 'info' };
    case 'PAGADA': return { texto: 'Pagado', tono: 'ok' };
    case 'ANULADA': return { texto: 'Anulado', tono: 'err' };
    default: return { texto: e, tono: '' };
  }
}

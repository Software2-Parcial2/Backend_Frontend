/** Modelos de dominio del modulo de gestion de MS7 (sin dependencias de frameworks). */

export type EstadoCita = 'PENDIENTE' | 'RESERVADA' | 'COBRO_PROVISIONAL' | 'CONFIRMADA' | 'CANCELADA' | 'ANULADA';

export interface CitaResumen {
  citaId: string;
  estado: EstadoCita;
  pacienteId: string;
  medicoId: string;
  especialidad: string;
  fechaHora: string;
  notificacion: string;
  creadaEn: string;
}

export interface Pagina<T> {
  items: T[];
  siguiente: string | null;
}

export type AgruparCitasPor = 'ESPECIALIDAD' | 'MEDICO' | 'ESTADO' | 'MES';

export interface GrupoCitas {
  clave: string;
  total: number;
  confirmadas: number;
  canceladas: number;
}

export interface ResumenCitas {
  desde: string;
  hasta: string;
  agrupadoPor: AgruparCitasPor;
  total: number;
  grupos: GrupoCitas[];
  /** true si se alcanzo el limite de citas leidas y el resumen es parcial. */
  truncado: boolean;
}

export interface IngresoPeriodo {
  periodo: string;
  confirmado: number;
  provisional: number;
  facturas: number;
}

export interface DemandaEspecialidades {
  k: number;
  silueta: number | null;
  fuente: string;
  sintetico: boolean;
  segmentos: { id: number; etiqueta: string; observaciones: number; especialidades: string[] }[];
  especialidades: { especialidad: string; segmento: number; etiqueta: string; citasPorSemana: number; citasTotal: number }[];
}

/** Modelo de inasistencia en uso (lo que expone el servicio de ML en /model/info). */
export interface ModeloInfo {
  version: string | null;
  /** Probabilidad desde la que se considera riesgo ALTO. */
  umbral: number | null;
  metricas: Record<string, unknown>;
  features: string[];
  entrenadoEn: string | null;
  dataset: string | null;
  sintetico: boolean;
  /** Importancia de cada variable (suman ~1), de mayor a menor. */
  importancias: { variable: string; importancia: number }[];
  parametros: Record<string, unknown>;
  aviso: string;
}

export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export interface RiesgoInasistencia {
  probabilidad: number;
  riesgo: NivelRiesgo;
  versionModelo: string;
  sintetico: boolean;
  /** Atributos que SIGEC aun no registra y se sustituyen por valores neutros (ver docs/inteligencia.md). */
  atributosEstimados: string[];
}

export interface CitaConRiesgo extends CitaResumen {
  riesgo: RiesgoInasistencia | null;
}

/** Identidad del llamante, propagada a los servicios aguas abajo (que vuelven a validar el JWT y aplican sus reglas). */
export interface Identidad {
  token: string;
  roles: string[];
  usuario: string;
}

export class ServicioNoDisponibleError extends Error {
  constructor(
    readonly servicio: string,
    detalle: string,
  ) {
    super(`${servicio} no disponible: ${detalle}`);
  }
}

export class AccesoDenegadoError extends Error {}
export class ConsultaInvalidaError extends Error {}

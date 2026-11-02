/** Modelo de dominio de imagenes medicas (sin dependencias de frameworks). */

export type ImagenEstado = 'SUBIDA' | 'ANALIZANDO' | 'ANALIZADA' | 'FALLIDA';
export type TipoMime = 'image/jpeg' | 'image/png' | 'application/dicom';

/** Resultado del modelo: APOYO A LA DECISION CLINICA, no un diagnostico. */
export interface ResultadoAnalisis {
  probabilidad_neumonia: number;
  clase: 'NEUMONIA' | 'NORMAL';
  version_modelo: string;
  /** "stub-no-clinico" mientras no exista un modelo entrenado y validado. */
  modelo: string;
  aviso: string;
}

export interface Imagen {
  id: string;
  pacienteId: string;
  estudio: string;
  estado: ImagenEstado;
  hashSha256: string;
  mime: TipoMime;
  bytes: number;
  bucket: string;
  /** Clave no adivinable del objeto en S3. Nunca se expone en la API. */
  objectKey: string;
  usuarioId: string;
  resultado?: ResultadoAnalisis;
  error?: string;
  /** Veces que se envio la solicitud de analisis (reenvios por perdida o falta de respuesta). */
  intentosAnalisis: number;
  creadaEn: number; // epoch ms
  actualizadaEn: number;
}

export const AVISO_CLINICO =
  'Resultado generado por un modelo de IA como apoyo a la decision clinica. No es un diagnostico. Proyecto academico: no usar en pacientes reales.';

export class ArchivoInvalidoError extends Error {}
export class PacienteInexistenteError extends Error {
  constructor(id: string) {
    super(`No existe el paciente ${id}`);
  }
}
export class ServicioNoDisponibleError extends Error {}

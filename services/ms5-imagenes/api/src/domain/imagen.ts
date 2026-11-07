/** Modelo de dominio de imagenes medicas (sin dependencias de frameworks). */

export type ImagenEstado = 'SUBIDA' | 'ANALIZANDO' | 'ANALIZADA' | 'FALLIDA';
/** Quien subio el estudio. Lo del paciente queda pendiente de revision medica. */
export type Origen = 'MEDICO' | 'PACIENTE';
/** Validacion medica del informe (independiente del estado del analisis). */
export type Validacion = 'PENDIENTE' | 'VALIDADO' | 'DESCARTADO';
export type Decision = 'CONFIRMA' | 'MODIFICA' | 'DESCARTA';

export interface InformeValidado {
  decision: Decision;
  texto: string | null;
  /** sub de Keycloak del medico que firmo. */
  validadoPor: string;
  medicoId: string | null;
  validadoEn: number;
  /** SHA-256 del contenido firmado (imagen + decision + texto + medico + fecha + version del modelo). */
  huella: string;
  versionModelo: string | null;
}

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
  origen: Origen;
  validacion: Validacion;
  informe?: InformeValidado;
  /** true mientras el evento imagen.informe-validado no se haya publicado (el barrido lo reintenta). */
  eventoPendiente?: boolean;
  observaciones?: string;
  /** Copia del nombre y n.° de historia del paciente (MS2) para buscar sin llamarlo. */
  pacienteNombre?: string;
  numeroHistoria?: string;
  /** Clave en S3 del mapa de calor (Grad-CAM), si la inferencia lo genero. Nunca se expone. */
  gradcamKey?: string;
  /** Veces que se envio la solicitud de analisis (reenvios por perdida o falta de respuesta). */
  intentosAnalisis: number;
  creadaEn: number; // epoch ms
  actualizadaEn: number;
}

export const AVISO_CLINICO =
  'Resultado generado por un modelo de IA como apoyo a la decision clinica. No es un diagnostico. Proyecto academico: no usar en pacientes reales.';

/** Regla de negocio con codigo estable; `status` 409 (conflicto de estado) o 422 (regla). */
export class ReglaImagenError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export class ArchivoInvalidoError extends Error {}
export class PacienteInexistenteError extends Error {
  constructor(id: string) {
    super(`No existe el paciente ${id}`);
  }
}
export class ServicioNoDisponibleError extends Error {}

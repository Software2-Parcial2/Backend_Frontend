import type { Imagen, ImagenEstado, InformeValidado, ResultadoAnalisis, Validacion } from '../domain/imagen.js';

export interface PaginaImagenes {
  items: Imagen[];
  siguiente: string | null;
}

export interface FiltroImagenes {
  pacienteId?: string;
  validacion?: Validacion;
  estado?: ImagenEstado;
  /** Texto libre: nombre del paciente, n.° de historia o estudio. */
  q?: string;
}

export interface ImagenRepository {
  guardar(i: Imagen): Promise<void>;
  obtener(id: string): Promise<Imagen | null>;
  /** Mas recientes primero, con cursor opaco. */
  buscar(filtro: FiltroImagenes, limite: number, cursor?: string): Promise<PaginaImagenes>;
  /** La misma radiografia (huella) ya subida para ese paciente. */
  porHash(pacienteId: string, hashSha256: string): Promise<Imagen | null>;
  /** Registra la validacion medica solo si estaba PENDIENTE y ANALIZADA; false si no (otra validacion ganó o aun no hay analisis). */
  validar(id: string, informe: InformeValidado, validacion: Validacion, ahora: number): Promise<boolean>;
  marcarEventoPublicado(id: string): Promise<void>;
  conEventoPendiente(limite: number): Promise<Imagen[]>;
  /**
   * Transicion condicionada al estado actual (idempotente): devuelve false si la imagen no estaba en alguno de `desde`
   * (p. ej. un resultado duplicado o tardio se ignora).
   */
  transicion(id: string, desde: ImagenEstado[], cambios: { estado: ImagenEstado; resultado?: ResultadoAnalisis; error?: string; gradcamKey?: string }, ahora: number): Promise<boolean>;
  /** Marca un reenvio de la solicitud de analisis (cuenta el intento) si sigue en `desde`. */
  marcarEnvio(id: string, desde: ImagenEstado[], ahora: number): Promise<Imagen | null>;
  /** Imagenes SUBIDA/ANALIZANDO sin actividad desde `antesDe` (para reenviar la solicitud). */
  atascadas(antesDe: number, limite: number): Promise<Imagen[]>;
}

export interface ObjectStore {
  subir(bucket: string, key: string, cuerpo: Uint8Array, mime: string): Promise<void>;
  /** URL temporal de lectura. El bucket nunca es publico. */
  urlTemporal(bucket: string, key: string, segundos: number): Promise<string>;
}

export interface PacienteResumen {
  nombre: string;
  numeroHistoria: string | null;
}

export interface PacienteGateway {
  /** Resumen si existe, null si no; lanza ServicioNoDisponibleError si MS2 no responde. `token` es el del usuario. */
  resumen(pacienteId: string, token: string): Promise<PacienteResumen | null>;
}

/** Publica imagen.informe-validado en sigec.eventos (con confirms y validacion del contrato). */
export interface ValidacionPublisher {
  publicar(i: Imagen): Promise<void>;
}

export interface AnalisisPublisher {
  solicitar(i: Imagen): Promise<void>;
}

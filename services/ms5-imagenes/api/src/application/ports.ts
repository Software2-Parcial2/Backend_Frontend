import type { Imagen, ImagenEstado, ResultadoAnalisis } from '../domain/imagen.js';

export interface PaginaImagenes {
  items: Imagen[];
  siguiente: string | null;
}

export interface ImagenRepository {
  guardar(i: Imagen): Promise<void>;
  obtener(id: string): Promise<Imagen | null>;
  /** Por paciente, mas recientes primero, con cursor opaco. */
  porPaciente(pacienteId: string, limite: number, cursor?: string): Promise<PaginaImagenes>;
  /**
   * Transicion condicionada al estado actual (idempotente): devuelve false si la imagen no estaba en alguno de `desde`
   * (p. ej. un resultado duplicado o tardio se ignora).
   */
  transicion(id: string, desde: ImagenEstado[], cambios: { estado: ImagenEstado; resultado?: ResultadoAnalisis; error?: string }, ahora: number): Promise<boolean>;
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

export interface PacienteGateway {
  /** true/false si existe; lanza ServicioNoDisponibleError si MS2 no responde. `token` es el del usuario que sube. */
  existe(pacienteId: string, token: string): Promise<boolean>;
}

export interface AnalisisPublisher {
  solicitar(i: Imagen): Promise<void>;
}

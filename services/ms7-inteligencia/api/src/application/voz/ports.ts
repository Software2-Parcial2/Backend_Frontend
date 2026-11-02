export const TRANSCRIPCION_PORT = Symbol('TRANSCRIPCION_PORT');

export interface Transcripcion {
  texto: string;
  idioma: string;
  duracionS: number;
  modelo: string;
}

/** Puerto de salida hacia el servicio de transcripcion (Whisper). El navegador nunca lo llama directamente. */
export interface TranscripcionPort {
  transcribir(audio: Buffer, mimetype: string, nombre: string): Promise<Transcripcion>;
}

export class AudioRechazadoError extends Error {
  constructor(
    readonly estado: 413 | 415 | 422,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

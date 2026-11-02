import { Inject, Injectable } from '@nestjs/common';
import type { Identidad } from '../../domain/gestion.js';
import { AgenteService, type RespuestaAgente } from '../agente/agente.service.js';
import { AudioRechazadoError, TRANSCRIPCION_PORT, type Transcripcion, type TranscripcionPort } from './ports.js';

const MIME_PERMITIDOS = /^(audio\/(webm|ogg|wav|x-wav|wave|mpeg|mp3|mp4|x-m4a|aac|flac)|video\/webm|application\/ogg)(;.*)?$/i;

export interface RespuestaVoz extends RespuestaAgente {
  transcripcion: Transcripcion;
}

/** Audio -> texto (Whisper) -> agente. Devuelve la transcripcion junto a la respuesta para que el usuario pueda confirmarla. */
@Injectable()
export class VozService {
  constructor(
    @Inject(TRANSCRIPCION_PORT) private readonly transcriptor: TranscripcionPort,
    @Inject(AgenteService) private readonly agente: AgenteService,
  ) {}

  async consultar(audio: Buffer, mimetype: string, nombre: string, identidad: Identidad): Promise<RespuestaVoz> {
    if (!MIME_PERMITIDOS.test(mimetype)) throw new AudioRechazadoError(415, `Tipo de audio no soportado: ${mimetype}`);
    if (audio.length === 0) throw new AudioRechazadoError(422, 'El audio esta vacio');
    const transcripcion = await this.transcriptor.transcribir(audio, mimetype, nombre);
    if (transcripcion.texto.length < 3) throw new AudioRechazadoError(422, 'No se entendio el audio: intenta de nuevo hablando mas cerca del microfono');
    const respuesta = await this.agente.consultar(transcripcion.texto.slice(0, 1000), identidad);
    return { ...respuesta, transcripcion };
  }
}

import { Injectable } from '@nestjs/common';
import { AudioRechazadoError, type Transcripcion, type TranscripcionPort } from '../../application/voz/ports.js';
import { ServicioNoDisponibleError } from '../../domain/gestion.js';

@Injectable()
export class WhisperHttpClient implements TranscripcionPort {
  private readonly base = (process.env.WHISPER_URL ?? 'http://localhost:8017').replace(/\/$/, '');
  private readonly timeoutMs = Number(process.env.WHISPER_TIMEOUT_MS ?? 120_000); // CPU: la primera llamada carga el modelo

  async transcribir(audio: Buffer, mimetype: string, nombre: string): Promise<Transcripcion> {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(audio)], { type: mimetype }), nombre);
    form.append('idioma', process.env.WHISPER_IDIOMA ?? 'es');
    let res: Response;
    try {
      res = await fetch(`${this.base}/transcribir`, {
        method: 'POST',
        body: form,
        headers: process.env.WHISPER_API_KEY ? { 'X-Api-Key': process.env.WHISPER_API_KEY } : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ServicioNoDisponibleError('MS7 Whisper', e instanceof Error ? e.message : String(e));
    }
    if (res.status === 413 || res.status === 415 || res.status === 422) {
      const detalle = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? 'audio rechazado';
      throw new AudioRechazadoError(res.status, detalle);
    }
    if (!res.ok) throw new ServicioNoDisponibleError('MS7 Whisper', `HTTP ${res.status}`);
    const j = (await res.json()) as { texto: string; idioma: string; duracion_s: number; modelo: string };
    return { texto: j.texto.trim(), idioma: j.idioma, duracionS: j.duracion_s, modelo: j.modelo };
  }
}

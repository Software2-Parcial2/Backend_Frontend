import { ProblemException } from '@sigec/http-nest';
import { CursorInvalidoError } from '../../application/saga/cita-repository.js';
import {
  CitaNoEncontradaError,
  ConcurrentUpdateError,
  HorarioNoDisponibleError,
  NoEncontradoError,
  SolicitudInvalidaError,
  TransicionInvalidaError,
} from '../../domain/cita.js';

/** Transiciones que son conflicto de estado (409); el resto son reglas de negocio sobre los datos enviados (422). */
const CONFLICTOS = new Set(['CITA_EN_PROCESO', 'CITA_YA_CANCELADA', 'CITA_NO_MODIFICABLE', 'ASISTENCIA_INVALIDA', 'PLANTILLA_VACIA']);

/**
 * Traduce los errores de dominio de MS3 a problem+json con `code` estable (docs/api.md). Los que no reconoce se relanzan
 * (el filtro global los convierte en 500 sin filtrar detalles). Se traduce DENTRO del controlador para que la idempotencia
 * guarde y reproduzca las respuestas 4xx deterministas.
 */
export function traducir(e: unknown): never {
  if (e instanceof HorarioNoDisponibleError) throw new ProblemException(409, 'HORARIO_OCUPADO', 'Horario no disponible', e.message);
  if (e instanceof TransicionInvalidaError) {
    const status = CONFLICTOS.has(e.code) ? 409 : 422;
    throw new ProblemException(status, e.code, status === 409 ? 'Conflicto' : 'Regla de negocio incumplida', e.message);
  }
  if (e instanceof CitaNoEncontradaError) throw new ProblemException(404, 'CITA_NO_ENCONTRADA', 'No encontrado', e.message);
  if (e instanceof NoEncontradoError) throw new ProblemException(404, e.code, 'No encontrado', e.message);
  if (e instanceof SolicitudInvalidaError) throw new ProblemException(400, 'SOLICITUD_INVALIDA', 'Solicitud invalida', e.message);
  if (e instanceof CursorInvalidoError) throw new ProblemException(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
  if (e instanceof ConcurrentUpdateError) throw new ProblemException(409, 'CONCURRENCIA', 'Conflicto', 'La cita fue modificada por otro proceso; reintente');
  throw e;
}

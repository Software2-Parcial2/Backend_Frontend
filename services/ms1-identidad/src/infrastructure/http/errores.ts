import { ProblemException } from '@sigec/http-nest';
import { CursorInvalidoError } from '../../application/usuarios.service.js';
import { KeycloakNoDisponibleError, ReglaIdentidadError } from '../../domain/identidad.js';

/** Errores de dominio -> problem+json con code estable. Lo que no reconoce se relanza (el filtro global lo vuelve 500). */
export async function traducir<T>(p: Promise<T> | T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ReglaIdentidadError) {
      const titulo = e.status === 404 ? 'No encontrado' : e.status === 409 ? 'Conflicto' : 'Regla de negocio incumplida';
      throw new ProblemException(e.status, e.code, titulo, e.message);
    }
    if (e instanceof CursorInvalidoError) throw new ProblemException(400, 'CURSOR_INVALIDO', 'Cursor invalido', 'El cursor no es valido');
    if (e instanceof KeycloakNoDisponibleError) throw new ProblemException(503, 'KEYCLOAK_NO_DISPONIBLE', 'Servicio no disponible', e.message);
    throw e;
  }
}

import { BadRequestException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ProveedorIaNoDisponibleError } from '../application/agente/agente.service.js';
import { AccesoDenegadoError, ConsultaInvalidaError, ServicioNoDisponibleError } from '../domain/gestion.js';

/** Traduce los errores de dominio a excepciones HTTP/GraphQL con codigo estable. */
export async function traducir<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AccesoDenegadoError) throw new ForbiddenException(e.message);
    if (e instanceof ConsultaInvalidaError) throw new BadRequestException(e.message);
    if (e instanceof ServicioNoDisponibleError || e instanceof ProveedorIaNoDisponibleError) throw new ServiceUnavailableException(e.message);
    throw e;
  }
}

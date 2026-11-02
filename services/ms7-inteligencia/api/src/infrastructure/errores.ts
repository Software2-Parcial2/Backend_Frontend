import { BadRequestException, ForbiddenException, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
import { AudioRechazadoError } from '../application/voz/ports.js';
import { ProveedorIaNoDisponibleError } from '../application/agente/agente.service.js';
import { AccesoDenegadoError, ConsultaInvalidaError, ServicioNoDisponibleError } from '../domain/gestion.js';

/** Traduce los errores de dominio a excepciones HTTP/GraphQL con codigo estable. */
export async function traducir<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AccesoDenegadoError) throw new ForbiddenException(e.message);
    if (e instanceof AudioRechazadoError) {
      if (e.estado === 413) throw new PayloadTooLargeException(e.message);
      if (e.estado === 415) throw new UnsupportedMediaTypeException(e.message);
      throw new UnprocessableEntityException(e.message);
    }
    if (e instanceof ConsultaInvalidaError) throw new BadRequestException(e.message);
    if (e instanceof ServicioNoDisponibleError || e instanceof ProveedorIaNoDisponibleError) throw new ServiceUnavailableException(e.message);
    throw e;
  }
}

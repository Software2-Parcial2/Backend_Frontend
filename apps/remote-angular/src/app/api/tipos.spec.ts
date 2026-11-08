import { describe, expect, it } from 'vitest';
import { ApiError } from '@sigec/api-client';
import { mensajeDeError } from './estado';
import { estadoCita, estadoEstudio, estadoFactura, textoAntecedente, textoMetodo } from './tipos';

describe('textos de estado', () => {
  it('estudio: analizado sin validar se revisa; validado no', () => {
    expect(estadoEstudio({ estado: 'ANALIZADA', validacion: 'PENDIENTE' })).toMatchObject({ texto: 'Resultado por validar', revisar: true });
    expect(estadoEstudio({ estado: 'ANALIZADA', validacion: 'VALIDADO' })).toMatchObject({ tono: 'ok', revisar: false });
    expect(estadoEstudio({ estado: 'FALLIDA', validacion: 'PENDIENTE' }).tono).toBe('err');
    expect(estadoEstudio({ estado: 'ANALIZANDO', validacion: 'PENDIENTE' }).texto).toBe('Procesando');
  });
  it('cargo, cita, antecedente y metodo', () => {
    expect(estadoFactura('PAGADA').tono).toBe('ok');
    expect(estadoFactura('ANULADA').texto).toBe('Anulado');
    expect(estadoCita('CANCELADA_USUARIO').texto).toBe('Cancelada');
    expect(textoAntecedente('QUIRURGICO')).toBe('Quirúrgico');
    expect(textoMetodo('POS')).toBe('Terminal POS');
    expect(textoMetodo(null)).toBe('—');
  });
});

describe('mensajeDeError', () => {
  it('traduce el estado HTTP a un texto para la persona', () => {
    expect(mensajeDeError(new ApiError(403, { code: 'X', detail: 'no' })).titulo).toContain('permiso');
    expect(mensajeDeError(new ApiError(0, undefined, 'x')).titulo).toContain('Sin conexión');
    expect(mensajeDeError(new ApiError(409, { code: 'VERSION_CONFLICTO', detail: 'otro cambio' })).texto).toBe('otro cambio');
  });
});

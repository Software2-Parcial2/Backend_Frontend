import { randomUUID } from 'node:crypto';
import { createEnvelope, InvalidEnvelopeError, validateEnvelope } from '../src/index.js';

const valid = () =>
  createEnvelope({ type: 'facturacion.cobro.anular', correlationId: randomUUID(), payload: { citaId: randomUUID(), motivo: 'x' } });

describe('validateEnvelope', () => {
  it('acepta un sobre creado con createEnvelope', () => {
    const e = valid();
    expect(validateEnvelope(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(e.causationId).toBeNull();
    expect(e.version).toBe(1);
    expect(e.occurredAt).toMatch(/Z$/);
  });

  it.each([
    ['id no UUID', { id: 'abc' }],
    ['type invalido', { type: 'Mal Tipo' }],
    ['fecha sin zona UTC', { occurredAt: '2026-11-01T10:00:00+02:00' }],
    ['version 0', { version: 0 }],
    ['payload no objeto', { payload: [] }],
    ['propiedad extra', { extra: 1 }],
    ['correlationId no UUID', { correlationId: 'x' }],
  ])('rechaza: %s', (_n, patch) => {
    expect(() => validateEnvelope({ ...valid(), ...patch })).toThrow(InvalidEnvelopeError);
  });

  it('rechaza lo que no es un objeto y los campos que faltan', () => {
    expect(() => validateEnvelope('x')).toThrow(InvalidEnvelopeError);
    const { payload: _p, ...sinPayload } = valid();
    expect(() => validateEnvelope(sinPayload)).toThrow(/falta payload/);
  });
});

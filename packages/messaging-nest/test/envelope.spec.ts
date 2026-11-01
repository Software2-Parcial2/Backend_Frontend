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

import { buildOutboxItem } from '../src/index.js';

describe('buildOutboxItem', () => {
  it('construye un Put condicional con pk = id del sobre', () => {
    const e = valid();
    const { Put } = buildOutboxItem('outbox', e);
    expect(Put.TableName).toBe('outbox');
    expect(Put.Item).toMatchObject({ pk: e.id, exchange: 'sigec.eventos', routingKey: e.type });
    expect(JSON.parse(Put.Item.envelope)).toEqual(e);
    expect(Put.ConditionExpression).toBe('attribute_not_exists(pk)');
  });

  it('rechaza un sobre invalido', () => {
    expect(() => buildOutboxItem('outbox', { id: 'x' } as never)).toThrow(InvalidEnvelopeError);
  });
});

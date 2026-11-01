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

import { hasSchema, validateMessage } from '../src/index.js';

describe('validateMessage (Ajv + contracts/events)', () => {
  const uuid = () => randomUUID();
  const cmd = (payload: Record<string, unknown>, type = 'facturacion.cobro-provisional.solicitar') => createEnvelope({ type, correlationId: uuid(), payload });
  const ok = { citaId: uuid(), pacienteId: uuid(), medicoId: uuid(), especialidad: 'general', fechaHora: '2026-12-01T10:00:00.000Z' };

  it('conoce los 12 tipos del contrato', () => {
    for (const t of ['facturacion.cobro-provisional.solicitar', 'facturacion.cobro.anular', 'facturacion.cobro.confirmar', 'notificaciones.cita-confirmada.enviar', 'notificaciones.cita-cancelada.enviar', 'facturacion.cobro-provisional.registrado', 'facturacion.cobro-provisional.rechazado', 'facturacion.cobro.anulado', 'notificaciones.cita-confirmada.enviada', 'notificaciones.cita-confirmada.fallida', 'paciente.creado', 'factura.creada'])
      expect(hasSchema(t), t).toBe(true);
    expect(hasSchema('no.existe.este')).toBe(false);
  });

  it('acepta un payload valido y los tipos sin schema (solo estructura)', () => {
    expect(validateMessage(cmd(ok)).type).toBe('facturacion.cobro-provisional.solicitar');
    expect(validateMessage(cmd({ x: 1 }, 'cita.reservada')).type).toBe('cita.reservada');
  });

  it.each([
    ['falta un campo requerido', { ...ok, especialidad: undefined }, /especialidad/],
    ['uuid invalido', { ...ok, citaId: 'no-uuid' }, /citaId.*uuid/],
    ['fecha invalida', { ...ok, fechaHora: 'ayer' }, /fechaHora.*date-time/],
    ['propiedad no permitida', { ...ok, extra: 1 }, /additional properties/],
  ])('rechaza con el motivo: %s', (_n, payload, motivo) => {
    expect(() => validateMessage(cmd(payload as Record<string, unknown>))).toThrow(InvalidEnvelopeError);
    expect(() => validateMessage(cmd(payload as Record<string, unknown>))).toThrow(motivo);
  });

  it('cobro.anulado acepta facturaId opcional', () => {
    expect(() => validateMessage(cmd({ citaId: uuid() }, 'facturacion.cobro.anulado'))).not.toThrow();
  });
});

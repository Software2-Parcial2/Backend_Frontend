import { randomUUID } from 'node:crypto';
import { IdempotencyService, InMemoryIdempotencyStore, requestHash } from '../src/index.js';

const H1 = requestHash('POST', '/api/x', { a: 1 });
const H2 = requestHash('POST', '/api/x', { a: 2 });

describe('requestHash', () => {
  it('no depende del orden de las claves, pero si del metodo, la ruta y el cuerpo', () => {
    expect(requestHash('POST', '/p', { a: 1, b: { c: 2, d: 3 } })).toBe(requestHash('POST', '/p', { b: { d: 3, c: 2 }, a: 1 }));
    expect(requestHash('POST', '/p', { a: 1 })).not.toBe(requestHash('PUT', '/p', { a: 1 }));
    expect(requestHash('POST', '/p', { a: 1 })).not.toBe(requestHash('POST', '/q', { a: 1 }));
    expect(requestHash('POST', '/p', { a: 1 })).not.toBe(requestHash('POST', '/p', { a: 2 }));
    expect(requestHash('POST', '/p', undefined)).toBe(requestHash('POST', '/p', {}));
    expect(requestHash('POST', '/p', {})).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('IdempotencyService', () => {
  let now = 1_000_000;
  const service = () => new IdempotencyService(new InMemoryIdempotencyStore(), { now: () => now, ttlMs: 1000 });

  it('rechaza una clave ausente o que no es UUID', async () => {
    const s = service();
    expect((await s.begin('u', undefined, H1)).kind).toBe('invalid-key');
    expect((await s.begin('u', 'no-es-uuid', H1)).kind).toBe('invalid-key');
  });

  it('reserva, completa y reproduce la respuesta con el mismo hash', async () => {
    const s = service();
    const key = randomUUID();
    const first = await s.begin('u', key, H1);
    expect(first.kind).toBe('proceed');
    if (first.kind !== 'proceed') return;
    await s.finish(first.storageKey, { statusCode: 201, body: { id: 1 } });
    const again = await s.begin('u', key, H1);
    expect(again).toEqual({ kind: 'replay', response: { statusCode: 201, body: { id: 1 } } });
  });

  it('hash distinto -> mismatch, en cualquier estado', async () => {
    const s = service();
    const key = randomUUID();
    const first = await s.begin('u', key, H1);
    expect((await s.begin('u', key, H2)).kind).toBe('mismatch'); // PROCESANDO
    if (first.kind === 'proceed') await s.finish(first.storageKey, { statusCode: 201, body: {} });
    expect((await s.begin('u', key, H2)).kind).toBe('mismatch'); // COMPLETADO
  });

  it('misma clave en PROCESANDO -> in-progress', async () => {
    const s = service();
    const key = randomUUID();
    await s.begin('u', key, H1);
    expect((await s.begin('u', key, H1)).kind).toBe('in-progress');
  });

  it('la clave esta acotada por usuario', async () => {
    const s = service();
    const key = randomUUID();
    expect((await s.begin('ana', key, H1)).kind).toBe('proceed');
    expect((await s.begin('luis', key, H1)).kind).toBe('proceed');
  });

  it('un 5xx libera la clave y un 4xx se conserva', async () => {
    const s = service();
    const k5 = randomUUID();
    const a = await s.begin('u', k5, H1);
    if (a.kind === 'proceed') await s.finish(a.storageKey, { statusCode: 503, body: {} });
    expect((await s.begin('u', k5, H1)).kind).toBe('proceed'); // reintentable

    const k4 = randomUUID();
    const b = await s.begin('u', k4, H1);
    if (b.kind === 'proceed') await s.finish(b.storageKey, { statusCode: 409, body: { detail: 'dup' } });
    expect((await s.begin('u', k4, H1)).kind).toBe('replay');
  });

  it('abort libera la clave', async () => {
    const s = service();
    const key = randomUUID();
    const a = await s.begin('u', key, H1);
    if (a.kind === 'proceed') await s.abort(a.storageKey);
    expect((await s.begin('u', key, H1)).kind).toBe('proceed');
  });

  it('una clave vencida se trata como nueva', async () => {
    const s = service();
    const key = randomUUID();
    const a = await s.begin('u', key, H1);
    if (a.kind === 'proceed') await s.finish(a.storageKey, { statusCode: 201, body: {} });
    now += 1001;
    expect((await s.begin('u', key, H2)).kind).toBe('proceed');
  });
});

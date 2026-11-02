import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { requestOf } from '../src/request.js';

const ctx = (tipo: string, args: unknown[], http?: unknown) =>
  ({ getType: () => tipo, getArgs: () => args, switchToHttp: () => ({ getRequest: () => http }) }) as unknown as ExecutionContext;

describe('requestOf', () => {
  it('en HTTP devuelve la peticion de Express', () => {
    const req = { headers: {} };
    expect(requestOf(ctx('http', [], req))).toBe(req);
  });

  it('en GraphQL devuelve `req` del contexto de Apollo (3.er argumento)', () => {
    const req = { headers: { authorization: 'Bearer x' } };
    expect(requestOf(ctx('graphql', [{}, {}, { req }, {}]))).toBe(req);
  });

  it('en GraphQL sin `req` en el contexto falla de forma explicita', () => {
    expect(() => requestOf(ctx('graphql', [{}, {}, {}, {}]))).toThrow(/req/);
  });
});

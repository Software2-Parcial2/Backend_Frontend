import { describe, expect, it, vi } from 'vitest';
import type { RegistroAuditoria } from '../application/agente/ports.js';
import { AuditoriaPg } from './auditoria-pg.js';

const registro = (over: Partial<RegistroAuditoria> = {}): RegistroAuditoria => ({
  en: '2026-11-06T10:00:00.000Z', usuario: 'u1', roles: ['administrador'], herramienta: 'resumen_citas', argumentos: { dias: 7 }, estado: 'ok', ms: 12.4, bytes: 300, ...over,
});

describe('AuditoriaPg', () => {
  it('mantiene la lectura en memoria y persiste en segundo plano', async () => {
    const query = vi.fn().mockResolvedValue({});
    const a = new AuditoriaPg(() => ({ query }));
    a.registrar(registro());
    await a.escribir(registro({ herramienta: 'otra' }));
    expect(a.recientes(10)[0]?.herramienta).toBe('resumen_citas');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]![1]).toEqual(['2026-11-06T10:00:00.000Z', 'u1', ['administrador'], 'resumen_citas', '{"dias":7}', 'ok', null, 12, 300]);
  });

  it('un fallo de la base no rompe el registro', async () => {
    const a = new AuditoriaPg(() => ({ query: vi.fn().mockRejectedValue(new Error('sin base')) }));
    expect(() => a.registrar(registro())).not.toThrow();
    await a.escribir(registro());
    expect(a.recientes(5)).toHaveLength(1);
  });
});

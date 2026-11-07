import { describe, expect, it } from 'vitest';
import type { Sonda, SondaPort } from './ports.js';
import { SaludService } from './salud.service.js';

const sondas: Sonda[] = ['gateway', 'keycloak', 'ms3-citas', 'ms8-notificaciones'].map((nombre) => ({ nombre, url: `http://x/${nombre}` }));

function montar(caidos: string[]) {
  const sonda: SondaPort = { comprobar: async (s) => ({ ok: !caidos.includes(s.nombre), ms: 12, detalle: caidos.includes(s.nombre) ? 'no responde' : null }) };
  const svc = new SaludService(sondas, sonda, 100);
  svc.ahora = () => new Date('2026-06-01T10:00:00Z');
  return svc;
}

describe('SaludService', () => {
  it('todo arriba: OK', async () => {
    const r = await montar([]).estado();
    expect(r).toMatchObject({ estado: 'OK', verificadoEn: '2026-06-01T10:00:00.000Z' });
    expect(r.servicios).toHaveLength(4);
    expect(r.servicios[0]).toEqual({ nombre: 'gateway', estado: 'OK', ms: 12, detalle: null });
  });
  it('un servicio de negocio caido: DEGRADADO', async () => {
    const r = await montar(['ms8-notificaciones']).estado();
    expect(r.estado).toBe('DEGRADADO');
    expect(r.servicios.find((s) => s.nombre === 'ms8-notificaciones')).toMatchObject({ estado: 'CAIDO', detalle: 'no responde' });
  });
  it('gateway o keycloak caidos: CAIDO', async () => {
    expect((await montar(['gateway']).estado()).estado).toBe('CAIDO');
    expect((await montar(['keycloak', 'ms3-citas']).estado()).estado).toBe('CAIDO');
  });
});

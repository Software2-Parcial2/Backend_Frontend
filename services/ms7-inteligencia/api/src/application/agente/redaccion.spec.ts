import { describe, expect, it } from 'vitest';
import { redactar, redactarTexto } from './redaccion.js';

describe('redaccion', () => {
  it('elimina claves de pacientes y clinicas, en profundidad', () => {
    expect(redactar({ total: 3, pacienteId: 'x', items: [{ nombre: 'Ana', especialidad: 'Pediatria', diagnostico: 'd', email: 'a@b.c' }] })).toEqual({ total: 3, items: [{ especialidad: 'Pediatria' }] });
  });
  it('enmascara correos, telefonos y tokens en texto libre', () => {
    const t = redactarTexto('Escribe a ana.perez@correo.com o llama al +591 7123 4567; token eyJhbGciOi.eyJzdWIiOiIx.firmaFirmaFirma');
    expect(t).not.toMatch(/ana\.perez|7123|eyJ/);
    expect(t).toContain('[correo omitido]');
  });
  it('conserva fechas ISO y rangos', () => {
    expect(redactarTexto('Del 2026-01-01 al 2026-06-30, pico el 2026-03-15T09:00:00Z')).toBe('Del 2026-01-01 al 2026-06-30, pico el 2026-03-15T09:00:00Z');
  });
  it('no destruye cifras normales ni ids de cita', () => {
    expect(redactarTexto('Hubo 1250 citas en 2026-06 (cita 3f2a9c1e-1111-4222-8333-444455556666)')).toContain('1250 citas');
  });
});

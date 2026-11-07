import { describe, expect, it } from 'vitest';
import { dinero, fechaLocal, formatoDiaLargo, formatoFecha, formatoFechaHora, formatoHora, hace, iniciales, inicioDelDia, sumarDias, sumarDinero } from '../src/index.js';

describe('dinero', () => {
  it('formatea el string decimal sin pasar por flotantes', () => {
    expect(dinero('180.00')).toBe('Bs 180.00');
    expect(dinero('1250.5')).toBe('Bs 1,250.50');
    expect(dinero('0.1')).toBe('Bs 0.10');
    expect(dinero('1234567.89', 'BOB')).toBe('Bs 1,234,567.89');
    expect(dinero('180.00', 'BOB', { sinCentavos: true })).toBe('Bs 180');
    expect(dinero('180.50', 'BOB', { sinCentavos: true })).toBe('Bs 180.50');
    expect(dinero('-20.00')).toBe('-Bs 20.00');
    expect(dinero('5', 'USD')).toBe('US$ 5.00');
    expect(dinero(null)).toBe('—');
    expect(dinero('abc')).toBe('abc');
  });
  it('suma en centavos exactos', () => {
    expect(sumarDinero(['0.1', '0.2'])).toBe('0.30');
    expect(sumarDinero(['100.00', '50.5', null, '-20.25'])).toBe('130.25');
    expect(sumarDinero([])).toBe('0.00');
  });
});

describe('fechas en la hora de la clinica (UTC-4)', () => {
  it('convierte un instante UTC', () => {
    expect(formatoHora('2026-11-03T14:30:00Z')).toBe('10:30');
    expect(formatoFecha('2026-11-03T14:30:00Z')).toBe('3 nov 2026');
    expect(formatoFechaHora('2026-11-03T14:30:00Z')).toBe('3 nov 2026, 10:30');
    expect(formatoDiaLargo('2026-11-03T14:30:00Z')).toMatch(/martes,? 3 de noviembre/);
    expect(formatoHora(null)).toBe('—');
    expect(formatoFecha('no es fecha')).toBe('—');
  });
  it('el dia de la clinica cambia cuando en UTC ya es otro dia', () => {
    expect(fechaLocal('2026-11-04T02:00:00Z')).toBe('2026-11-03'); // 22:00 del 3 en La Paz
    expect(inicioDelDia('2026-11-03')).toBe('2026-11-03T04:00:00.000Z');
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('hace() e iniciales()', () => {
    const ahora = new Date('2026-11-03T12:00:00Z');
    expect(hace('2026-11-03T11:58:00Z', ahora)).toBe('hace 2 min');
    expect(hace('2026-11-03T09:00:00Z', ahora)).toBe('hace 3 h');
    expect(hace('2026-11-02T09:00:00Z', ahora)).toBe('ayer');
    expect(hace('2026-11-03T11:59:50Z', ahora)).toBe('ahora');
    expect(iniciales('Carla Rojas Vaca')).toBe('CR');
    expect(iniciales('')).toBe('?');
  });
});

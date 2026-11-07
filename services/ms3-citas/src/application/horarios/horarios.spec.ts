import { describe, expect, it } from 'vitest';
import { SolicitudInvalidaError } from '../../domain/cita.js';
import { bloqueoQueCubre, generarSlots, horaLocal, limitesDelDia, plantillaVacia, validarBloqueo, validarPlantilla, type DiaPlantilla } from './horarios.js';

const semana: DiaPlantilla[] = [
  { dia: 1, atiende: true, desde: '08:00', hasta: '12:00', consultorio: 'Cons. 3' },
  { dia: 2, atiende: true, desde: '08:00', hasta: '10:00' },
  { dia: 3, atiende: false },
  { dia: 4, atiende: true, desde: '14:00', hasta: '16:00' },
];

describe('plantilla', () => {
  it('normaliza: completa los dias que faltan como sin atencion y sube la version', () => {
    const p = validarPlantilla('m1', 30, semana, 1000, 2);
    expect(p.dias.map((d) => d.dia)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(p.dias.filter((d) => d.atiende).map((d) => d.dia)).toEqual([1, 2, 4]);
    expect(p.version).toBe(3);
    expect(plantillaVacia('m').dias.every((d) => !d.atiende)).toBe(true);
  });

  it('rechaza duraciones, dias, horas y rangos invalidos', () => {
    const malo = (dias: DiaPlantilla[], dur = 30) => expect(() => validarPlantilla('m', dur, dias, 0)).toThrowError(SolicitudInvalidaError);
    malo(semana, 25);
    malo([{ dia: 0, atiende: false }]);
    malo([{ dia: 1, atiende: false }, { dia: 1, atiende: false }]);
    malo([{ dia: 1, atiende: true, desde: '8:00', hasta: '12:00' }]);
    malo([{ dia: 1, atiende: true, desde: '08:00' }]);
    malo([{ dia: 1, atiende: true, desde: '08:00', hasta: '08:20' }]); // no alcanza para 30 min
  });
});

describe('generarSlots (hora local -> UTC con offset -240)', () => {
  const p = validarPlantilla('m1', 30, semana, 0);

  it('un lunes de 08:00 a 12:00 da 8 horarios de 30 min a las 12:00Z..15:30Z', () => {
    const s = generarSlots(p, '2026-11-09', '2026-11-09'); // lunes
    expect(s).toHaveLength(8);
    expect(s[0]).toBe('2026-11-09T12:00:00.000Z');
    expect(s[7]).toBe('2026-11-09T15:30:00.000Z');
    expect(horaLocal(s[0])).toBe('08:00');
  });

  it('recorre varios dias saltando los que no se atiende', () => {
    const s = generarSlots(p, '2026-11-09', '2026-11-15'); // lun..dom: lunes 8, martes 4, jueves 4
    expect(s).toHaveLength(16);
    expect(new Set(s.map((x) => x.slice(0, 10)))).toEqual(new Set(['2026-11-09', '2026-11-10', '2026-11-12']));
  });

  it('valida fechas y limita el rango', () => {
    expect(() => generarSlots(p, '2026-13-01', '2026-13-02')).toThrowError(SolicitudInvalidaError);
    expect(() => generarSlots(p, '2026-11-10', '2026-11-09')).toThrowError(/anterior/);
    expect(() => generarSlots(p, '2026-01-01', '2026-12-31')).toThrowError(/maximo/);
  });

  it('limitesDelDia cubre las 24 h locales', () => {
    const l = limitesDelDia('2026-11-09');
    expect(l.desde).toBe('2026-11-09T04:00:00.000Z');
    expect(l.hasta).toBe('2026-11-10T03:59:59.999Z');
  });
});

describe('bloqueos', () => {
  const b = { id: 'b1', medicoId: 'm', desde: '2026-11-23T04:00:00.000Z', hasta: '2026-11-28T03:59:59.000Z', motivo: 'Congreso', creadoPor: 'admin', creadoEn: 0 };
  it('cubre los instantes dentro del rango (inclusivo)', () => {
    expect(bloqueoQueCubre('2026-11-23T12:00:00Z', [b])?.id).toBe('b1');
    expect(bloqueoQueCubre('2026-11-23T04:00:00Z', [b])?.id).toBe('b1');
    expect(bloqueoQueCubre('2026-11-29T12:00:00Z', [b])).toBeUndefined();
  });
  it('valida orden, futuro, duracion maxima y motivo', () => {
    const now = Date.parse('2026-11-03T00:00:00Z');
    expect(validarBloqueo('2026-11-23T00:00:00Z', '2026-11-24T00:00:00Z', ' Congreso ', now).motivo).toBe('Congreso');
    for (const [d, h, m] of [['2026-11-24T00:00:00Z', '2026-11-23T00:00:00Z', 'x'], ['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z', 'x'], ['2026-11-04T00:00:00Z', '2027-06-01T00:00:00Z', 'x'], ['2026-11-04T00:00:00Z', '2026-11-05T00:00:00Z', ' '], ['no', 'no', 'x']]) {
      expect(() => validarBloqueo(d, h, m, now)).toThrowError(SolicitudInvalidaError);
    }
  });
});

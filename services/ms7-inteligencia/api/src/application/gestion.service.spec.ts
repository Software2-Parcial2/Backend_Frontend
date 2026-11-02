import { describe, expect, it, vi } from 'vitest';
import { ConsultaInvalidaError, type CitaResumen, type Identidad } from '../domain/gestion.js';
import { GestionService } from './gestion.service.js';
import type { CitasGateway, FacturacionGateway, MlGateway } from './ports.js';

const ID: Identidad = { token: 't', roles: ['administrador'], usuario: 'admin' };
const AHORA = Date.parse('2026-06-01T12:00:00Z');

const cita = (n: number, o: Partial<CitaResumen> = {}): CitaResumen => ({
  citaId: `c${n}`, estado: 'CONFIRMADA', pacienteId: 'p1', medicoId: 'm1', especialidad: 'Pediatria',
  fechaHora: '2026-06-10T09:00:00.000Z', notificacion: 'ENVIADA', creadaEn: '2026-06-01T09:00:00.000Z', ...o,
});

function montar(paginas: CitaResumen[][]) {
  const listar = vi.fn(async (_id: Identidad, q: { limite: number; cursor?: string }) => {
    const i = q.cursor ? Number(q.cursor) : 0;
    return { items: paginas[i] ?? [], siguiente: i + 1 < paginas.length ? String(i + 1) : null };
  });
  const citas: CitasGateway = { listar };
  const facturacion: FacturacionGateway = { ingresos: vi.fn(async () => [{ periodo: '2026-06', confirmado: 10, provisional: 0, facturas: 1 }]) };
  const predecirNoShow = vi.fn(async (items: { id: string }[]) => ({
    predicciones: items.map((x, i) => ({ id: x.id, probabilidad_inasistencia: i / 10, riesgo: 'BAJO' as const })),
    version_modelo: 'v1', sintetico: true,
  }));
  const ml = { predecirNoShow, demanda: vi.fn() } as unknown as MlGateway;
  const svc = new GestionService(citas, facturacion, ml);
  svc.ahora = () => AHORA;
  return { svc, listar, predecirNoShow, facturacion };
}

describe('GestionService', () => {
  it('resume citas por especialidad recorriendo todas las paginas y filtrando por rango', async () => {
    const { svc, listar } = montar([
      [cita(1), cita(2, { especialidad: 'Cardiologia', estado: 'CANCELADA' })],
      [cita(3), cita(4, { fechaHora: '2026-08-01T09:00:00.000Z' })], // fuera del rango
    ]);
    const r = await svc.resumenCitas(ID, '2026-06-01', '2026-06-30', 'ESPECIALIDAD');
    expect(listar).toHaveBeenCalledTimes(2);
    expect(r.total).toBe(3);
    expect(r.grupos).toEqual([
      { clave: 'Pediatria', total: 2, confirmadas: 2, canceladas: 0 },
      { clave: 'Cardiologia', total: 1, confirmadas: 0, canceladas: 1 },
    ]);
    expect(r.truncado).toBe(false);
  });

  it('el limite superior sin hora incluye todo ese dia', async () => {
    const { svc } = montar([[cita(1, { fechaHora: '2026-06-30T23:30:00.000Z' })]]);
    expect((await svc.resumenCitas(ID, '2026-06-01', '2026-06-30', 'MES')).total).toBe(1);
  });

  it('rechaza rangos invalidos', async () => {
    const { svc } = montar([[]]);
    await expect(svc.resumenCitas(ID, 'x', '2026-06-30', 'MES')).rejects.toBeInstanceOf(ConsultaInvalidaError);
    await expect(svc.resumenCitas(ID, '2026-06-30', '2026-06-01', 'MES')).rejects.toThrow(/anterior/);
    await expect(svc.resumenCitas(ID, '2024-01-01', '2026-06-01', 'MES')).rejects.toThrow(/366/);
  });

  it('el riesgo de las proximas citas hace UNA llamada a ML, excluye canceladas y ordena por probabilidad', async () => {
    const { svc, predecirNoShow } = montar([[cita(1), cita(2), cita(3, { estado: 'CANCELADA' }), cita(4, { fechaHora: '2026-05-01T09:00:00.000Z' })]]);
    const r = await svc.riesgoProximasCitas(ID, 30, 10);
    expect(predecirNoShow).toHaveBeenCalledTimes(1);
    expect(r.map((c) => c.citaId)).toEqual(['c2', 'c1']);
    expect(r[0]?.riesgo?.atributosEstimados).toContain('edad');
  });

  it('construye atributos no clinicos coherentes', async () => {
    const { svc, predecirNoShow } = montar([[]]);
    await svc.riesgoDeCitas([cita(1, { fechaHora: '2026-06-10T09:00:00.000Z', creadaEn: '2026-06-01T09:00:00.000Z', notificacion: 'PENDIENTE' })]);
    expect(predecirNoShow).toHaveBeenCalledWith([expect.objectContaining({ antelacion_dias: 9, dia_semana: 2, sms_recibido: false, beca: false })]);
  });

  it('valida el horizonte de dias', async () => {
    await expect(montar([[]]).svc.riesgoProximasCitas(ID, 0, 5)).rejects.toBeInstanceOf(ConsultaInvalidaError);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ConsultaInvalidaError, type CitaResumen, type Identidad, type ResumenCitas } from '../domain/gestion.js';
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
  const resumen = vi.fn(async (_id: Identidad, q: { desde: string; hasta: string; agruparPor: ResumenCitas['agrupadoPor'] }): Promise<ResumenCitas> => ({
    desde: q.desde, hasta: q.hasta, agrupadoPor: q.agruparPor, total: 3, truncado: false,
    grupos: [{ clave: 'Pediatria', total: 2, confirmadas: 2, canceladas: 0 }, { clave: 'Cardiologia', total: 1, confirmadas: 0, canceladas: 1 }],
  }));
  const citas: CitasGateway = { listar, resumen };
  const facturacion: FacturacionGateway = { ingresos: vi.fn(async () => [{ periodo: '2026-06', confirmado: 10, provisional: 0, facturas: 1 }]) };
  const predecirNoShow = vi.fn(async (items: { id: string }[]) => ({
    predicciones: items.map((x, i) => ({ id: x.id, probabilidad_inasistencia: i / 10, riesgo: 'BAJO' as const })),
    version_modelo: 'v1', sintetico: true,
  }));
  const ml = { predecirNoShow, demanda: vi.fn() } as unknown as MlGateway;
  const previas = new Map<string, number>([['p1', 2]]);
  const asistencia = { registrar: vi.fn(), inasistenciasPrevias: vi.fn(async () => previas) };
  const svc = new GestionService(citas, facturacion, ml, asistencia);
  svc.ahora = () => AHORA;
  return { svc, listar, resumen, predecirNoShow, facturacion, asistencia };
}

describe('GestionService', () => {
  it('el resumen lo calcula MS3 (una llamada) en lugar de paginar todo el listado', async () => {
    const { svc, listar, resumen } = montar([[cita(1)]]);
    const r = await svc.resumenCitas(ID, '2026-06-01', '2026-06-30', 'ESPECIALIDAD');
    expect(resumen).toHaveBeenCalledWith(ID, { desde: '2026-06-01', hasta: '2026-06-30', agruparPor: 'ESPECIALIDAD' });
    expect(listar).not.toHaveBeenCalled();
    expect(r.total).toBe(3);
    expect(r.grupos[0]).toEqual({ clave: 'Pediatria', total: 2, confirmadas: 2, canceladas: 0 });
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

  it('las proximas citas se piden a MS3 ya acotadas por fecha', async () => {
    const { svc, listar } = montar([[cita(1)]]);
    await svc.riesgoProximasCitas(ID, 7, 5);
    expect(listar).toHaveBeenCalledWith(ID, expect.objectContaining({ desde: '2026-06-01T12:00:00.000Z', hasta: '2026-06-08T12:00:00.000Z' }));
  });

  it('las inasistencias previas salen de la asistencia real, no de un valor neutro', async () => {
    const { svc, predecirNoShow, asistencia } = montar([[]]);
    const r = await svc.riesgoDeCitas([cita(1), cita(2, { pacienteId: 'p2' })]);
    expect(asistencia.inasistenciasPrevias).toHaveBeenCalledWith(['p1', 'p2']);
    expect(predecirNoShow).toHaveBeenCalledWith([expect.objectContaining({ inasistencias_previas: 2 }), expect.objectContaining({ inasistencias_previas: 0 })]);
    expect(r[0]!.atributosEstimados).not.toContain('inasistencias_previas');
  });

  it('si no se puede leer la asistencia el riesgo se calcula igual (valor neutro)', async () => {
    const { svc, predecirNoShow, asistencia } = montar([[]]);
    asistencia.inasistenciasPrevias.mockRejectedValueOnce(new Error('bd caida'));
    await svc.riesgoDeCitas([cita(1)]);
    expect(predecirNoShow).toHaveBeenCalledWith([expect.objectContaining({ inasistencias_previas: 0 })]);
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

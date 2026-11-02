import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { ConsultaInvalidaError, type Identidad } from '../../domain/gestion.js';
import { GestionService } from '../gestion.service.js';
import { aCsv, aPdf, aXlsx } from './exportadores.js';
import { ReportesService } from './reportes.service.js';

const ADMIN: Identidad = { token: 't', roles: ['administrador'], usuario: 'a' };
const RECEPCION: Identidad = { token: 't', roles: ['recepcion'], usuario: 'r' };

function servicio() {
  const gestion = {
    resumenCitas: vi.fn(async () => ({ grupos: [
      { clave: 'Pediatria', total: 40, confirmadas: 35, canceladas: 5 },
      { clave: '=HYPERLINK("http://x")', total: 10, confirmadas: 9, canceladas: 1 },
      { clave: 'Cardiologia', total: 25, confirmadas: 20, canceladas: 5 },
    ], truncado: false })),
    ingresos: vi.fn(async () => [{ periodo: '2026-05', confirmado: 1200.5, provisional: 80, facturas: 14 }]),
  } as unknown as GestionService;
  return { svc: new ReportesService(gestion), gestion };
}

const spec = (o: object = {}) => ({
  titulo: 'Citas por especialidad', fuente: 'resumen_citas', parametros: { desde: '2026-01-01', hasta: '2026-06-30' },
  columnas: ['clave', 'total', 'canceladas'], orden: { columna: 'total', direccion: 'desc' }, grafico: { tipo: 'barras', x: 'clave', y: 'total' }, ...o,
});

describe('especificacion de reporte (zod)', () => {
  const { svc } = servicio();
  it('acepta una especificacion valida y aplica valores por defecto', () => {
    const s = svc.validar(spec());
    expect(s.filtros).toEqual([]);
  });
  it.each([
    ['columna inexistente', spec({ columnas: ['clave', 'password'] })],
    ['propiedad extra (intento de inyectar SQL/codigo)', spec({ sql: 'DROP TABLE citas' })],
    ['fuente fuera de la lista', spec({ fuente: 'pg_catalog.pg_user' })],
    ['parametro extra', spec({ parametros: { desde: '2026-01-01', where: '1=1' } })],
    ['fecha mal formada', spec({ parametros: { desde: 'ayer' } })],
    ['grafico sin ejes', spec({ grafico: { tipo: 'barras' } })],
    ['demasiadas columnas', spec({ columnas: Array(9).fill('clave') })],
  ])('rechaza: %s', (_n, entrada) => {
    expect(() => svc.validar(entrada)).toThrow(ConsultaInvalidaError);
  });
});

describe('ejecucion', () => {
  it('ordena, selecciona columnas y filtra con operadores cerrados', async () => {
    const { svc } = servicio();
    const r = await svc.ejecutar(spec({ filtros: [{ columna: 'total', operador: 'gte', valor: 20 }] }), ADMIN);
    expect(r.filas.map((f) => f.total)).toEqual([40, 25]);
    expect(Object.keys(r.filas[0]!)).toEqual(['clave', 'total', 'canceladas']);
    expect(r.columnas.map((c) => c.titulo)).toEqual(['Grupo', 'Citas', 'Canceladas']);
  });
  it('los reportes de ingresos exigen rol caja/administrador', async () => {
    const { svc } = servicio();
    const e = { titulo: 'Ingresos', fuente: 'ingresos', columnas: ['periodo', 'confirmado'] };
    await expect(svc.ejecutar(e, RECEPCION)).rejects.toThrow(/rol/);
    expect((await svc.ejecutar(e, ADMIN)).filas).toEqual([{ periodo: '2026-05', confirmado: 1200.5 }]);
  });
});

describe('exportaciones', () => {
  const resultado = async () => servicio().svc.ejecutar(spec(), ADMIN);

  it('xlsx valido: hojas Datos y Resumen, cabeceras, formatos y totales', async () => {
    const buf = await aXlsx(await resultado());
    expect(buf.subarray(0, 2).toString()).toBe('PK'); // zip
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Datos', 'Resumen']);
    const datos = wb.getWorksheet('Datos')!;
    expect((datos.getRow(1).values as string[]).slice(1)).toEqual(['Grupo', 'Citas', 'Canceladas']);
    expect(datos.rowCount).toBe(4);
    expect(datos.getRow(2).getCell(2).value).toBe(40);
    expect(datos.getRow(1).font?.bold).toBe(true);
    const textoResumen = JSON.stringify(wb.getWorksheet('Resumen')!.getSheetValues());
    expect(textoResumen).toContain('Citas por especialidad');
    expect(textoResumen).toContain('75'); // total de la columna Citas (40+10+25)
  });

  it('csv neutraliza formulas y declara UTF-8', async () => {
    const csv = aCsv(await resultado());
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split('\n')[0]).toContain('Grupo,Citas,Canceladas');
  });

  it('pdf valido', async () => {
    const pdf = await aPdf(await resultado());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

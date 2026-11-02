import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';
import type { ColumnaDef, ReporteResultado } from './spec.js';

const FORMATOS_NUM: Partial<Record<ColumnaDef['tipo'], string>> = { numero: '#,##0.##', moneda: '#,##0.00', porcentaje: '0.0%' };

/** Neutraliza formulas (=, +, -, @) en celdas de texto para evitar inyeccion de formulas al abrir el CSV/Excel. */
const seguro = (v: string | number | null): string | number | null =>
  typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

export async function aXlsx(r: ReporteResultado): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SIGEC - MS7 Inteligencia';
  wb.created = new Date(r.generadoEn);

  const datos = wb.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
  datos.columns = r.columnas.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(14, c.titulo.length + 4), style: { numFmt: FORMATOS_NUM[c.tipo] } }));
  const cab = datos.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  cab.alignment = { vertical: 'middle', horizontal: 'center' };
  for (const fila of r.filas) {
    datos.addRow(Object.fromEntries(r.columnas.map((c) => [c.clave, c.tipo === 'texto' || c.tipo === 'fecha' ? seguro(fila[c.clave] ?? null) : (fila[c.clave] ?? null)])));
  }
  if (r.filas.length > 0) datos.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: r.columnas.length } };

  const res = wb.addWorksheet('Resumen');
  res.columns = [{ width: 26 }, { width: 60 }];
  res.addRow(['Reporte', r.titulo]).font = { bold: true, size: 13 };
  res.addRow(['Fuente', r.fuente]);
  res.addRow(['Generado', r.generadoEn]);
  res.addRow(['Parametros', JSON.stringify(r.parametros)]);
  res.addRow(['Filas', r.filas.length]);
  if (r.sintetico) res.addRow(['AVISO', 'Contiene predicciones de un modelo entrenado con datos SINTETICOS: solo demostracion.']);
  if (r.nota) res.addRow(['Nota', r.nota]);
  res.addRow([]);
  const t = res.addRow(['Totales de columnas numericas', '']);
  t.font = { bold: true };
  r.columnas
    .filter((c) => c.tipo === 'numero' || c.tipo === 'moneda')
    .forEach((c, i) => {
      const fila = res.addRow([c.titulo, r.filas.reduce((s, f) => s + (typeof f[c.clave] === 'number' ? (f[c.clave] as number) : 0), 0)]);
      fila.getCell(2).numFmt = FORMATOS_NUM[c.tipo] ?? 'General';
      fila.getCell(2).alignment = { horizontal: 'left' };
      void i;
    });
  res.addRow([]);
  res.addRow(['Los datos son de apoyo a la gestion; no contienen informacion clinica.', '']).font = { italic: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function aCsv(r: ReporteResultado): string {
  // BOM para que Excel detecte UTF-8
  return '﻿' + stringify([r.columnas.map((c) => c.titulo), ...r.filas.map((f) => r.columnas.map((c) => seguro(f[c.clave] ?? null)))]);
}

export function aPdf(r: ReporteResultado): Promise<Buffer> {
  return new Promise((ok, fail) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: r.titulo, Author: 'SIGEC - MS7 Inteligencia' } });
    const trozos: Buffer[] = [];
    doc.on('data', (t: Buffer) => trozos.push(t));
    doc.on('end', () => ok(Buffer.concat(trozos)));
    doc.on('error', fail);
    doc.fontSize(16).text(r.titulo);
    doc.fontSize(8).fillColor('#555').text(`Fuente: ${r.fuente} · Generado: ${r.generadoEn} · Filas: ${r.filas.length}`);
    if (r.sintetico) doc.fillColor('#b00').text('AVISO: datos de un modelo entrenado con informacion sintetica (demostracion).');
    if (r.nota) doc.fillColor('#555').text(r.nota);
    doc.moveDown().fillColor('#000');
    const ancho = (doc.page.width - 80) / r.columnas.length;
    const fila = (celdas: string[], negrita: boolean) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      celdas.forEach((c, i) => doc.text(c, 40 + i * ancho, y, { width: ancho - 4, height: 22, ellipsis: true }));
      doc.y = y + 14;
    };
    fila(r.columnas.map((c) => c.titulo), true);
    for (const f of r.filas.slice(0, 500)) fila(r.columnas.map((c) => formatear(f[c.clave] ?? null, c)), false);
    if (r.filas.length > 500) doc.text(`... ${r.filas.length - 500} filas mas (usa Excel o CSV).`);
    doc.end();
  });
}

function formatear(v: string | number | null, c: ColumnaDef): string {
  if (v === null) return '';
  if (c.tipo === 'porcentaje' && typeof v === 'number') return `${(v * 100).toFixed(1)}%`;
  if (c.tipo === 'moneda' && typeof v === 'number') return v.toFixed(2);
  return String(v);
}

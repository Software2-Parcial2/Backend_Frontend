import { describe, expect, it, vi } from 'vitest';
import type { Identidad } from '../../domain/gestion.js';
import { GestionService } from '../gestion.service.js';
import { ReportesService } from '../reportes/reportes.service.js';
import { AuditoriaEnMemoria } from './auditoria.js';
import { HERRAMIENTAS, NOMBRES_HERRAMIENTAS } from './herramientas.js';
import { conectarMcp } from './mcp.js';

const ctx = (roles: string[]) => {
  const gestion = { demanda: vi.fn(async () => ({ k: 1, correo: 'a@b.c', email: 'secreto@x.y' })) } as unknown as GestionService;
  const identidad: Identidad = { token: 't', roles, usuario: 'u' };
  return { identidad, gestion, reportes: new ReportesService(gestion), politicas: { buscar: async () => [] }, guardarReporte: () => undefined };
};

describe('servidor MCP (transporte en memoria)', () => {
  it('publica solo las herramientas permitidas por rol y todas de solo lectura', async () => {
    const adm = await conectarMcp(ctx(['administrador']), new AuditoriaEnMemoria());
    const rec = await conectarMcp(ctx(['recepcion']), new AuditoriaEnMemoria());
    const pac = await conectarMcp(ctx(['paciente']), new AuditoriaEnMemoria());
    expect(adm.nombres.sort()).toEqual([...NOMBRES_HERRAMIENTAS].sort());
    expect(rec.nombres).not.toContain('consultar_ingresos');
    expect(pac.nombres).toEqual([]);
    const { tools } = await adm.cliente.listTools();
    expect(tools).toHaveLength(6);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === false)).toBe(true);
    expect(HERRAMIENTAS.map((h) => h.nombre)).toEqual(expect.arrayContaining(['obtener_resumen_citas', 'consultar_ingresos', 'consultar_demanda_especialidades', 'consultar_prediccion_inasistencia', 'consultar_politicas', 'generar_reporte']));
    await Promise.all([adm.cerrar(), rec.cerrar(), pac.cerrar()]);
  });

  it('valida argumentos con zod y redacta campos personales de las salidas', async () => {
    const c = await conectarMcp(ctx(['administrador']), new AuditoriaEnMemoria());
    const mala = await c.cliente.callTool({ name: 'consultar_prediccion_inasistencia', arguments: { dias: 999 } });
    expect(mala.isError).toBe(true);
    const ok = await c.cliente.callTool({ name: 'consultar_demanda_especialidades', arguments: {} });
    const texto = (ok.content as { text: string }[])[0]!.text;
    expect(JSON.parse(texto)).toEqual({ k: 1 }); // 'email' (clave sensible) eliminado; 'correo' tambien
    expect(texto).not.toContain('secreto@x.y');
    const inexistente = await c.cliente.callTool({ name: 'borrar_citas', arguments: {} });
    expect(inexistente.isError).toBe(true);
    await c.cerrar();
  });
});

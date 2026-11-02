import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HERRAMIENTAS, type ContextoHerramienta } from './herramientas.js';
import type { AuditoriaPort } from './ports.js';
import { redactar } from './redaccion.js';

const MAX_BYTES_RESULTADO = 12_000;

export interface ConexionMcp {
  cliente: Client;
  nombres: string[];
  cerrar(): Promise<void>;
}

/**
 * Crea un servidor MCP EFIMERO por peticion, ligado a la identidad del usuario, y un cliente conectado por transporte en memoria.
 *
 * Por que en memoria: el agente vive en el mismo proceso que MS7; stdio exigiria lanzar un proceso hijo por consulta y HTTP abriria
 * un puerto extra que habria que proteger. El mismo servidor (`HERRAMIENTAS`) podria publicarse por stdio/HTTP para otros clientes
 * MCP cambiando solo el transporte. Solo se registran las herramientas que el rol del usuario permite (lista blanca por rol),
 * todas de solo lectura; lo que no se registra el modelo ni siquiera lo ve.
 */
export async function conectarMcp(ctx: ContextoHerramienta, auditoria: AuditoriaPort): Promise<ConexionMcp> {
  const servidor = new McpServer({ name: 'sigec-ms7', version: '0.1.0' });
  const permitidas = HERRAMIENTAS.filter((h) => h.roles.some((r) => ctx.identidad.roles.includes(r)));

  for (const h of permitidas) {
    servidor.registerTool(
      h.nombre,
      { description: h.descripcion, inputSchema: h.forma, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
      async (args: Record<string, unknown>) => {
        const t0 = Date.now();
        const base = { en: new Date().toISOString(), usuario: ctx.identidad.usuario, roles: ctx.identidad.roles, herramienta: h.nombre, argumentos: args };
        try {
          const salida = redactar(await h.ejecutar(args, ctx));
          let texto = JSON.stringify(salida);
          if (texto.length > MAX_BYTES_RESULTADO) texto = `${texto.slice(0, MAX_BYTES_RESULTADO)}... [resultado recortado]`;
          auditoria.registrar({ ...base, estado: 'ok', ms: Date.now() - t0, bytes: texto.length });
          return { content: [{ type: 'text' as const, text: texto }] };
        } catch (e) {
          const detalle = e instanceof Error ? e.message : String(e);
          auditoria.registrar({ ...base, estado: 'error', detalle, ms: Date.now() - t0, bytes: 0 });
          return { isError: true, content: [{ type: 'text' as const, text: `Error: ${detalle}` }] };
        }
      },
    );
  }

  const [transporteCliente, transporteServidor] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: 'agente-ms7', version: '0.1.0' });
  await Promise.all([servidor.connect(transporteServidor), cliente.connect(transporteCliente)]);
  return {
    cliente,
    nombres: permitidas.map((h) => h.nombre),
    cerrar: async () => {
      await cliente.close();
      await servidor.close();
    },
  };
}

import Anthropic from '@anthropic-ai/sdk';
import type { HerramientaLlm, LlmPort, MensajeAgente, RespuestaLlm } from '../../application/agente/ports.js';

type Bloque = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
/** Subconjunto del cliente de @anthropic-ai/sdk que usamos (simulable en pruebas). */
export interface ClienteClaude {
  messages: { create(p: Record<string, unknown>, o?: { signal?: AbortSignal }): Promise<{ content: Bloque[] }> };
}

export class ClaudeLlm implements LlmPort {
  readonly proveedor = 'claude';
  constructor(
    readonly modelo: string,
    private readonly cliente: ClienteClaude,
  ) {}

  static desdeEntorno(env: NodeJS.ProcessEnv = process.env): ClaudeLlm {
    if (!env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY en el entorno (LLM_PROVIDER=claude)');
    return new ClaudeLlm(env.CLAUDE_MODEL ?? 'claude-sonnet-5-5', new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as ClienteClaude);
  }

  async generar(e: { sistema: string; mensajes: MensajeAgente[]; herramientas: HerramientaLlm[]; senal: AbortSignal }): Promise<RespuestaLlm> {
    const resp = await this.cliente.messages.create(
      {
        model: this.modelo,
        max_tokens: 1500,
        temperature: 0.2,
        system: e.sistema,
        tools: e.herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, input_schema: h.esquema })),
        messages: e.mensajes.map(aMensaje),
      },
      { signal: e.senal },
    );
    const texto = resp.content.filter((b): b is Extract<Bloque, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');
    return {
      texto: texto || undefined,
      llamadas: resp.content.filter((b): b is Extract<Bloque, { type: 'tool_use' }> => b.type === 'tool_use').map((b) => ({ id: b.id, nombre: b.name, argumentos: (b.input ?? {}) as Record<string, unknown> })),
    };
  }
}

function aMensaje(m: MensajeAgente): Record<string, unknown> {
  switch (m.rol) {
    case 'usuario':
      return { role: 'user', content: m.texto };
    case 'asistente':
      return {
        role: 'assistant',
        content: [
          ...(m.texto ? [{ type: 'text', text: m.texto }] : []),
          ...(m.llamadas ?? []).map((l) => ({ type: 'tool_use', id: l.id, name: l.nombre, input: l.argumentos })),
        ],
      };
    case 'herramientas':
      return { role: 'user', content: m.resultados.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.contenido, is_error: r.error ?? false })) };
  }
}

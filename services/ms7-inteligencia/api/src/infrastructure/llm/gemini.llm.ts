import { GoogleGenAI, type Content, type Part } from '@google/genai';
import type { HerramientaLlm, LlmPort, MensajeAgente, RespuestaLlm } from '../../application/agente/ports.js';

/** Subconjunto del cliente de @google/genai que usamos (permite simularlo en pruebas sin gastar API). */
export interface ClienteGemini {
  models: { generateContent(p: { model: string; contents: Content[]; config: Record<string, unknown> }): Promise<{ text?: string; functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] }> };
}

export class GeminiLlm implements LlmPort {
  readonly proveedor = 'gemini';
  constructor(
    readonly modelo: string,
    private readonly cliente: ClienteGemini,
  ) {}

  static desdeEntorno(env: NodeJS.ProcessEnv = process.env): GeminiLlm {
    if (!env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en el entorno (LLM_PROVIDER=gemini)');
    return new GeminiLlm(env.GEMINI_MODEL ?? 'gemini-3.5-flash', new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) as unknown as ClienteGemini);
  }

  async generar(e: { sistema: string; mensajes: MensajeAgente[]; herramientas: HerramientaLlm[]; senal: AbortSignal }): Promise<RespuestaLlm> {
    const resp = await this.cliente.models.generateContent({
      model: this.modelo,
      contents: e.mensajes.map(aContenido),
      config: {
        systemInstruction: e.sistema,
        temperature: 0.2,
        abortSignal: e.senal,
        tools: e.herramientas.length ? [{ functionDeclarations: e.herramientas.map((h) => ({ name: h.nombre, description: h.descripcion, parametersJsonSchema: h.esquema })) }] : undefined,
      },
    });
    return {
      texto: resp.text || undefined,
      llamadas: (resp.functionCalls ?? []).map((c, i) => ({ id: c.id ?? `gemini_${Date.now()}_${i}`, nombre: c.name ?? '', argumentos: c.args ?? {} })),
    };
  }
}

function aContenido(m: MensajeAgente): Content {
  switch (m.rol) {
    case 'usuario':
      return { role: 'user', parts: [{ text: m.texto }] };
    case 'asistente': {
      const parts: Part[] = [];
      if (m.texto) parts.push({ text: m.texto });
      for (const l of m.llamadas ?? []) parts.push({ functionCall: { id: l.id, name: l.nombre, args: l.argumentos } });
      return { role: 'model', parts };
    }
    case 'herramientas':
      return { role: 'user', parts: m.resultados.map((r) => ({ functionResponse: { id: r.id, name: r.nombre, response: r.error ? { error: r.contenido } : { output: r.contenido } } })) };
  }
}

import { describe, expect, it, vi } from 'vitest';
import type { HerramientaLlm, MensajeAgente } from '../../application/agente/ports.js';
import { ClaudeLlm } from './claude.llm.js';
import { GeminiLlm } from './gemini.llm.js';
import { crearLlm } from './llm.factory.js';

const herramientas: HerramientaLlm[] = [{ nombre: 'consultar_demanda_especialidades', descripcion: 'd', esquema: { type: 'object', properties: {} } }];
const mensajes: MensajeAgente[] = [
  { rol: 'usuario', texto: 'hola' },
  { rol: 'asistente', texto: 'voy', llamadas: [{ id: 'k1', nombre: 'consultar_demanda_especialidades', argumentos: {} }] },
  { rol: 'herramientas', resultados: [{ id: 'k1', nombre: 'consultar_demanda_especialidades', contenido: '<datos_herramienta>x</datos_herramienta>' }] },
];
const senal = new AbortController().signal;

describe('GeminiLlm (cliente simulado)', () => {
  it('traduce mensajes, herramientas y llamadas', async () => {
    const generateContent = vi.fn(async (_p: any) => ({ text: undefined, functionCalls: [{ name: 'consultar_demanda_especialidades', args: {} }] }));
    const llm = new GeminiLlm('gemini-test', { models: { generateContent } });
    const r = await llm.generar({ sistema: 'SIS', mensajes, herramientas, senal });
    const p = generateContent.mock.calls[0]![0];
    expect(p.model).toBe('gemini-test');
    expect(p.config.systemInstruction).toBe('SIS');
    expect(p.config.abortSignal).toBe(senal);
    expect(JSON.stringify(p.config.tools)).toContain('parametersJsonSchema');
    expect(p.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(JSON.stringify(p.contents[2])).toContain('functionResponse');
    expect(r.llamadas).toHaveLength(1);
    expect(r.llamadas[0]).toMatchObject({ nombre: 'consultar_demanda_especialidades', argumentos: {} });
    expect(r.llamadas[0]!.id).toBeTruthy();
  });
  it('sin GEMINI_API_KEY falla con un mensaje claro', () => {
    expect(() => GeminiLlm.desdeEntorno({})).toThrow(/GEMINI_API_KEY/);
  });
});

describe('ClaudeLlm (cliente simulado)', () => {
  it('traduce a tool_use / tool_result y lee la respuesta', async () => {
    const create = vi.fn(async (_p: any, _o?: any) => ({ content: [{ type: 'text' as const, text: 'listo' }, { type: 'tool_use' as const, id: 'tu1', name: 'consultar_demanda_especialidades', input: {} }] }));
    const llm = new ClaudeLlm('claude-test', { messages: { create } });
    const r = await llm.generar({ sistema: 'SIS', mensajes, herramientas, senal });
    const [cuerpo, opts] = create.mock.calls[0]! as unknown as [Record<string, any>, { signal: AbortSignal }];
    expect(cuerpo.system).toBe('SIS');
    expect(cuerpo.tools[0].input_schema.type).toBe('object');
    expect(cuerpo.messages[1].content[1]).toMatchObject({ type: 'tool_use', id: 'k1' });
    expect(cuerpo.messages[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'k1' });
    expect(opts.signal).toBe(senal);
    expect(r.texto).toBe('listo');
    expect(r.llamadas[0]).toMatchObject({ id: 'tu1', nombre: 'consultar_demanda_especialidades' });
  });
  it('sin ANTHROPIC_API_KEY falla con un mensaje claro', () => {
    expect(() => ClaudeLlm.desdeEntorno({})).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe('crearLlm (LLM_PROVIDER)', () => {
  it('gemini es el valor por defecto y es perezoso (no falla al crearse)', async () => {
    const llm = crearLlm({});
    expect(llm.proveedor).toBe('gemini');
    await expect(llm.generar({ sistema: '', mensajes, herramientas, senal })).rejects.toThrow(/GEMINI_API_KEY/);
  });
  it('selecciona claude y simulated; rechaza otros', () => {
    expect(crearLlm({ LLM_PROVIDER: 'claude' }).proveedor).toBe('claude');
    expect(crearLlm({ LLM_PROVIDER: 'simulated' }).proveedor).toBe('simulado');
    expect(() => crearLlm({ LLM_PROVIDER: 'otro' })).toThrow(/desconocido/);
  });
});

// Prueba REAL opcional: solo con GEMINI_API_KEY en el entorno (consume API).
describe.skipIf(!process.env.GEMINI_API_KEY)('Gemini real (opcional)', () => {
  it('responde y elige la herramienta correcta', async () => {
    const llm = GeminiLlm.desdeEntorno();
    const r = await llm.generar({
      sistema: 'Usa las herramientas para responder.', herramientas, senal: AbortSignal.timeout(30_000),
      mensajes: [{ rol: 'usuario', texto: 'Que especialidades tienen mas demanda?' }],
    });
    expect(r.llamadas.map((l) => l.nombre)).toContain('consultar_demanda_especialidades');
  }, 40_000);
});

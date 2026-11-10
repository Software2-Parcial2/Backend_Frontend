import { ProveedorIaNoDisponibleError } from '../../application/agente/agente.service.js';
import type { LlmPort } from '../../application/agente/ports.js';
import { ClaudeLlm } from './claude.llm.js';
import { GeminiLlm } from './gemini.llm.js';
import { SimuladoLlm } from './simulado.llm.js';

/**
 * Selecciona el proveedor con LLM_PROVIDER (gemini por defecto | claude | simulated). Es perezoso: sin la clave de API la app arranca
 * igualmente y la consulta del agente responde 503 con el motivo.
 */
export function crearLlm(env: NodeJS.ProcessEnv = process.env): LlmPort {
  const proveedor = (env.LLM_PROVIDER ?? 'gemini').toLowerCase();
  if (proveedor === 'simulated' || proveedor === 'simulado') return new SimuladoLlm();
  if (proveedor !== 'gemini' && proveedor !== 'claude') throw new Error(`LLM_PROVIDER desconocido: ${proveedor} (usa gemini, claude o simulated)`);
  let real: LlmPort | undefined;
  const obtener = (): LlmPort => {
    try {
      return (real ??= proveedor === 'gemini' ? GeminiLlm.desdeEntorno(env) : ClaudeLlm.desdeEntorno(env));
    } catch (e) {
      throw new ProveedorIaNoDisponibleError(e instanceof Error ? e.message : String(e));
    }
  };
  return {
    proveedor,
    modelo: proveedor === 'gemini' ? (env.GEMINI_MODEL ?? 'gemini-3.5-flash') : (env.CLAUDE_MODEL ?? 'claude-sonnet-5-5'),
    generar: async (e) => obtener().generar(e),
  };
}

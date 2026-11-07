import type { Identidad } from '../../domain/gestion.js';
import type { Agente, Alerta, AgenteId, CandidataAlerta, FiltroAlertas, PaginaAlertas } from './tipos.js';

export const ALERTAS_REPO = Symbol('ALERTAS_REPO');
export const ASISTENCIA_REPO = Symbol('ASISTENCIA_REPO');
export const AVISO_ALERTAS = Symbol('AVISO_ALERTAS');
export const TOKEN_SERVICIO = Symbol('TOKEN_SERVICIO');

export interface AlertasRepository {
  listarAgentes(): Promise<Agente[]>;
  obtenerAgente(id: AgenteId): Promise<Agente | null>;
  actualizarAgente(id: AgenteId, cambios: Partial<Pick<Agente, 'activo' | 'intervaloMin' | 'umbral'>>): Promise<Agente | null>;
  registrarEjecucion(id: AgenteId, ahora: Date, estado: 'OK' | 'ERROR', error: string | null, alertas: number): Promise<void>;
  /** Crea la alerta o, si ya hay una ABIERTA con la misma clave, la refresca. `nueva` dice cual de las dos paso. */
  guardarCandidata(agenteId: AgenteId, c: CandidataAlerta): Promise<{ alerta: Alerta; nueva: boolean }>;
  listarAlertas(filtro: FiltroAlertas, limite: number, cursor?: string): Promise<PaginaAlertas>;
  obtenerAlerta(id: string): Promise<Alerta | null>;
  /** null si no existe; `ya` si estaba atendida. */
  atender(id: string, usuario: string, nota: string | null, ahora: Date): Promise<{ alerta: Alerta; ya: boolean } | null>;
}

export interface AsistenciaRepository {
  /** Idempotente por cita. */
  registrar(a: { citaId: string; pacienteId: string; medicoId: string | null; fechaHora: string; asistencia: 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO' }): Promise<void>;
  /** Cantidad de NO_ASISTIO por paciente (los que no aparecen no tienen). */
  inasistenciasPrevias(pacienteIds: string[]): Promise<Map<string, number>>;
}

/** Avisa al personal (n8n -> alerta interna). Nunca debe lanzar. */
export interface AvisoAlertasPort {
  avisar(texto: string): Promise<void>;
}

/** Identidad de servicio para los agentes programados (client credentials de Keycloak). null si no esta configurada. */
export interface TokenServicioPort {
  identidad(): Promise<Identidad | null>;
}

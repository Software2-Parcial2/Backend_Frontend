export type AgenteId = 'cancelaciones' | 'inasistencias' | 'demanda' | 'ingresos';
export const AGENTES: AgenteId[] = ['cancelaciones', 'inasistencias', 'demanda', 'ingresos'];
export type NivelAlerta = 'BAJO' | 'MEDIO' | 'ALTO';
export type EstadoAlerta = 'ABIERTA' | 'ATENDIDA';

export interface Agente {
  id: AgenteId;
  nombre: string;
  descripcion: string;
  activo: boolean;
  intervaloMin: number;
  umbral: number;
  ultimaEjecucion: string | null;
  ultimoEstado: 'OK' | 'ERROR' | null;
  ultimoError: string | null;
  ultimasAlertas: number;
}

export interface Alerta {
  id: string;
  agenteId: AgenteId;
  clave: string;
  nivel: NivelAlerta;
  estado: EstadoAlerta;
  titulo: string;
  detalle: string;
  datos: Record<string, unknown> | null;
  creadaEn: string;
  actualizadaEn: string;
  atendidaEn: string | null;
  atendidaPor: string | null;
  nota: string | null;
}

/** Lo que un agente detecta; el servicio decide si es una alerta nueva o refresca una abierta. */
export interface CandidataAlerta {
  clave: string;
  nivel: NivelAlerta;
  titulo: string;
  detalle: string;
  datos: Record<string, unknown>;
}

export interface FiltroAlertas {
  estado?: EstadoAlerta;
  nivel?: NivelAlerta;
  agenteId?: AgenteId;
}

export interface PaginaAlertas {
  items: Alerta[];
  siguiente: string | null;
}

export class AlertaNoEncontradaError extends Error {}
export class AlertaYaAtendidaError extends Error {}
export class AgenteInvalidoError extends Error {}

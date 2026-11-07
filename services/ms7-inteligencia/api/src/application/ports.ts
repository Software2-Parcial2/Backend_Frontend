import type { AgruparCitasPor, CitaResumen, DemandaEspecialidades, IngresoPeriodo, Identidad, ModeloInfo, Pagina, ResumenCitas } from '../domain/gestion.js';

export const CITAS_GATEWAY = Symbol('CITAS_GATEWAY');
export const FACTURACION_GATEWAY = Symbol('FACTURACION_GATEWAY');
export const ML_GATEWAY = Symbol('ML_GATEWAY');

export interface CitasGateway {
  listar(id: Identidad, q: { limite: number; cursor?: string; desde?: string; hasta?: string }): Promise<Pagina<CitaResumen>>;
  /** Conteo agregado calculado por MS3 (evita paginar todas las citas). */
  resumen(id: Identidad, q: { desde: string; hasta: string; agruparPor: AgruparCitasPor }): Promise<ResumenCitas>;
}

export interface FacturacionGateway {
  ingresos(id: Identidad, q: { desde: string; hasta: string; agrupar: 'dia' | 'mes' | 'especialidad' }): Promise<IngresoPeriodo[]>;
}

export interface AtributosNoShow {
  id: string;
  antelacion_dias: number;
  dia_semana: number;
  edad: number;
  beca: boolean;
  sms_recibido: boolean;
  inasistencias_previas: number;
  citas_previas: number;
}

export interface PrediccionNoShow {
  id: string | null;
  probabilidad_inasistencia: number;
  riesgo: 'BAJO' | 'MEDIO' | 'ALTO';
}

export interface MlGateway {
  predecirNoShow(items: AtributosNoShow[]): Promise<{ predicciones: PrediccionNoShow[]; version_modelo: string; sintetico: boolean }>;
  demanda(): Promise<DemandaEspecialidades>;
  modelo(): Promise<ModeloInfo>;
}

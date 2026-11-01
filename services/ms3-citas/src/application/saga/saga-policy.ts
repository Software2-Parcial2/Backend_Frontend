/** Parametros de tiempo y reintentos de la SAGA (configurables por entorno; ver docs/saga-citas.md). */
export interface SagaPolicy {
  /** Vigencia de la reserva del horario. */
  reservaTtlMs: number;
  /** Tiempo maximo de espera de la respuesta de un paso. */
  stepTimeoutMs: number;
  /** Intentos por paso (incluye el primero). Despues se compensa. */
  maxAttempts: number;
  /** Base del backoff exponencial entre intentos. */
  backoffBaseMs: number;
  /** Fraccion aleatoria (0..1) que se suma al backoff. */
  jitterRatio: number;
  /** Si se envia facturacion.cobro.confirmar al terminar (paso final configurable). */
  confirmarCobro: boolean;
  /** Reintentos de notificacion fuera de la SAGA y su espaciado. */
  notificacionMaxReintentos: number;
  notificacionReintentoMs: number;
}

export const DEFAULT_POLICY: SagaPolicy = {
  reservaTtlMs: 10 * 60 * 1000,
  stepTimeoutMs: 30 * 1000,
  maxAttempts: 3,
  backoffBaseMs: 2000,
  jitterRatio: 0.25,
  confirmarCobro: false,
  notificacionMaxReintentos: 5,
  notificacionReintentoMs: 30 * 1000,
};

export function policyFromEnv(env: NodeJS.ProcessEnv = process.env): SagaPolicy {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);
  return {
    reservaTtlMs: num(env.SAGA_RESERVA_TTL_SEGUNDOS, DEFAULT_POLICY.reservaTtlMs / 1000) * 1000,
    stepTimeoutMs: num(env.SAGA_STEP_TIMEOUT_MS, DEFAULT_POLICY.stepTimeoutMs),
    maxAttempts: num(env.SAGA_MAX_ATTEMPTS, DEFAULT_POLICY.maxAttempts),
    backoffBaseMs: num(env.SAGA_BACKOFF_BASE_MS, DEFAULT_POLICY.backoffBaseMs),
    jitterRatio: num(env.SAGA_JITTER_RATIO, DEFAULT_POLICY.jitterRatio),
    confirmarCobro: (env.SAGA_CONFIRMAR_COBRO ?? 'false') === 'true',
    notificacionMaxReintentos: num(env.SAGA_NOTIF_MAX_REINTENTOS, DEFAULT_POLICY.notificacionMaxReintentos),
    notificacionReintentoMs: num(env.SAGA_NOTIF_REINTENTO_MS, DEFAULT_POLICY.notificacionReintentoMs),
  };
}

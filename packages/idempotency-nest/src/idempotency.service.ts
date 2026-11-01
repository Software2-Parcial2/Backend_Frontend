import {
  IDEMPOTENCY_TTL_MS,
  type IdempotencyRecord,
  type IdempotencyStore,
  type StoredResponse,
} from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdempotencyDecision =
  | { kind: 'invalid-key'; detail: string }
  | { kind: 'proceed'; storageKey: string }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'mismatch' }
  | { kind: 'in-progress' };

export interface IdempotencyOptions {
  ttlMs?: number;
  now?: () => number;
}

/** Reglas de contracts/idempotency.md, independientes de Nest y del almacen. */
export class IdempotencyService {
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: IdempotencyStore,
    options: IdempotencyOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** `scope` acota la clave por usuario (sub del JWT). */
  async begin(scope: string, key: string | undefined, hash: string): Promise<IdempotencyDecision> {
    if (!key) return { kind: 'invalid-key', detail: 'Falta la cabecera Idempotency-Key' };
    if (!UUID.test(key)) return { kind: 'invalid-key', detail: 'Idempotency-Key debe ser un UUID' };

    const storageKey = `${scope}:${key.toLowerCase()}`;
    const now = this.now();
    const result = await this.store.reserve(storageKey, hash, now, now + this.ttlMs);
    if (result.reserved) return { kind: 'proceed', storageKey };

    const existing: IdempotencyRecord = result.existing;
    if (existing.requestHash !== hash) return { kind: 'mismatch' };
    if (existing.status === 'COMPLETADO' && existing.response) return { kind: 'replay', response: existing.response };
    return { kind: 'in-progress' };
  }

  /** 2xx/3xx/4xx se guardan (deterministas); 5xx libera la clave para poder reintentar. */
  async finish(storageKey: string, response: StoredResponse): Promise<void> {
    if (response.statusCode >= 500) return this.store.release(storageKey);
    return this.store.complete(storageKey, response);
  }

  /** Excepcion no controlada: la clave se libera. */
  async abort(storageKey: string): Promise<void> {
    await this.store.release(storageKey).catch(() => undefined);
  }
}

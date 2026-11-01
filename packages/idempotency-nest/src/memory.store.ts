import type { IdempotencyRecord, IdempotencyStore, ReserveResult, StoredResponse } from './types.js';

/** Almacen en memoria (pruebas y desarrollo sin DynamoDB). */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly records = new Map<string, IdempotencyRecord>();

  async reserve(key: string, requestHash: string, now: number, expiresAt: number): Promise<ReserveResult> {
    const existing = this.records.get(key);
    if (existing && existing.expiresAt >= now) return { reserved: false, existing: { ...existing } };
    this.records.set(key, { key, requestHash, status: 'PROCESANDO', createdAt: now, expiresAt });
    return { reserved: true };
  }

  async complete(key: string, response: StoredResponse): Promise<void> {
    const r = this.records.get(key);
    if (r) this.records.set(key, { ...r, status: 'COMPLETADO', response });
  }

  async release(key: string): Promise<void> {
    this.records.delete(key);
  }
}

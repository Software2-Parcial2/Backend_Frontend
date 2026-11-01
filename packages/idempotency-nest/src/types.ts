export type IdempotencyStatus = 'PROCESANDO' | 'COMPLETADO';

export interface StoredResponse {
  statusCode: number;
  body: unknown;
  contentType?: string;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  status: IdempotencyStatus;
  response?: StoredResponse;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
}

export type ReserveResult = { reserved: true } | { reserved: false; existing: IdempotencyRecord };

/** Puerto del almacen de claves. La reserva DEBE ser atomica. */
export interface IdempotencyStore {
  /** Reserva la clave como PROCESANDO si no existe (o si esta vencida). */
  reserve(key: string, requestHash: string, now: number, expiresAt: number): Promise<ReserveResult>;
  complete(key: string, response: StoredResponse): Promise<void>;
  release(key: string): Promise<void>;
}

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

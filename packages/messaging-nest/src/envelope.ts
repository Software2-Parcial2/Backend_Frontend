import { randomUUID } from 'node:crypto';

/** Sobre comun de todos los mensajes (ver contracts/events/envelope.schema.json). */
export interface Envelope<T = Record<string, unknown>> {
  id: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  causationId: string | null;
  version: number;
  payload: T;
}

export class InvalidEnvelopeError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Sobre invalido: ${errors.join('; ')}`);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const KEYS = ['id', 'type', 'occurredAt', 'correlationId', 'causationId', 'version', 'payload'];

/** Valida el sobre segun envelope.schema.json. Lanza InvalidEnvelopeError con todos los problemas. */
export function validateEnvelope(value: unknown): Envelope {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidEnvelopeError(['el mensaje no es un objeto']);
  }
  const v = value as Record<string, unknown>;
  for (const k of KEYS) if (!(k in v)) errors.push(`falta ${k}`);
  for (const k of Object.keys(v)) if (!KEYS.includes(k)) errors.push(`propiedad no permitida: ${k}`);
  if ('id' in v && !(typeof v.id === 'string' && UUID.test(v.id))) errors.push('id debe ser UUID');
  if ('type' in v && !(typeof v.type === 'string' && TYPE.test(v.type))) errors.push('type invalido');
  if ('occurredAt' in v && !(typeof v.occurredAt === 'string' && ISO_UTC.test(v.occurredAt) && !Number.isNaN(Date.parse(v.occurredAt))))
    errors.push('occurredAt debe ser ISO 8601 UTC');
  if ('correlationId' in v && !(typeof v.correlationId === 'string' && UUID.test(v.correlationId)))
    errors.push('correlationId debe ser UUID');
  if ('causationId' in v && !(v.causationId === null || (typeof v.causationId === 'string' && UUID.test(v.causationId))))
    errors.push('causationId debe ser UUID o null');
  if ('version' in v && !(Number.isInteger(v.version) && (v.version as number) >= 1)) errors.push('version debe ser entero >= 1');
  if ('payload' in v && !(typeof v.payload === 'object' && v.payload !== null && !Array.isArray(v.payload)))
    errors.push('payload debe ser un objeto');
  if (errors.length > 0) throw new InvalidEnvelopeError(errors);
  return v as unknown as Envelope;
}

export interface NewEnvelope<T> {
  type: string;
  correlationId: string;
  causationId?: string | null;
  payload: T;
  version?: number;
  id?: string;
  occurredAt?: Date;
}

export function createEnvelope<T extends Record<string, unknown>>(o: NewEnvelope<T>): Envelope<T> {
  return {
    id: o.id ?? randomUUID(),
    type: o.type,
    occurredAt: (o.occurredAt ?? new Date()).toISOString(),
    correlationId: o.correlationId,
    causationId: o.causationId ?? null,
    version: o.version ?? 1,
    payload: o.payload,
  };
}

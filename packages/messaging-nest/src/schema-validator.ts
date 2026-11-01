import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import { type Envelope, InvalidEnvelopeError, validateEnvelope } from './envelope.js';
import { SCHEMAS } from './schemas.generated.js';

// ajv y ajv-formats son CommonJS: segun el cargador el constructor llega como default o como el propio modulo.
const unwrap = <T>(m: unknown): T => ((m as { default?: T }).default ?? m) as T;

interface ValidateFn {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}
interface AjvLike {
  addSchema(schema: object): unknown;
  getSchema(id: string): ValidateFn | undefined;
}
const Ajv2020 = unwrap<new (opts: object) => AjvLike>(_Ajv2020);
const addFormats = unwrap<(ajv: AjvLike) => unknown>(_addFormats);

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const schema of SCHEMAS) ajv.addSchema(schema as object);

const ID = (type: string) => `https://sigec.local/contracts/events/${type}.schema.json`;

/** true si el contrato define un schema para este tipo de mensaje. */
export function hasSchema(type: string): boolean {
  return ajv.getSchema(ID(type)) !== undefined;
}

/**
 * Valida un mensaje contra el sobre comun (estructura) y, si el tipo esta en contracts/events, contra su JSON Schema
 * completo (incluido el payload). Lanza InvalidEnvelopeError con el motivo legible; los consumidores envian ese mensaje
 * a la DLQ. Los tipos sin schema (p. ej. eventos propios de una prueba) solo se validan estructuralmente.
 */
export function validateMessage(value: unknown): Envelope {
  const envelope = validateEnvelope(value);
  const validate = ajv.getSchema(ID(envelope.type));
  if (validate && !validate(envelope)) {
    const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`.trim());
    throw new InvalidEnvelopeError([`${envelope.type}: ${errors.join('; ')}`]);
  }
  return envelope;
}

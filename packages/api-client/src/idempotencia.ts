/** UUID v4 para `Idempotency-Key` y `X-Correlation-Id`. Usa crypto.randomUUID y, si no existe, getRandomValues. */
export function nuevoUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Una intencion de negocio (p. ej. «crear esta cita») = una clave. Se crea al abrir el formulario y se reutiliza en cada
 * reintento del MISMO envio; si el usuario cambia los datos, hay que pedir `renovar()`.
 */
export interface Intencion {
  readonly clave: string;
  /** Genera una clave nueva (cuando el cuerpo cambio y ya no es el mismo envio). */
  renovar(): string;
}

export function nuevaIntencion(): Intencion {
  let clave = nuevoUuid();
  return {
    get clave() {
      return clave;
    },
    renovar() {
      clave = nuevoUuid();
      return clave;
    },
  };
}

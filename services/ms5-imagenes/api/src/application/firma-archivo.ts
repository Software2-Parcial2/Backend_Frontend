import type { TipoMime } from '../domain/imagen.js';

export interface TipoDetectado {
  mime: TipoMime;
  ext: 'jpg' | 'png' | 'dcm';
}

/**
 * Detecta el tipo REAL del archivo por su firma (magic bytes), ignorando la extension y el Content-Type que declara el cliente:
 *  - JPEG: FF D8 FF
 *  - PNG: 89 50 4E 47 0D 0A 1A 0A
 *  - DICOM (Parte 10): "DICM" en el desplazamiento 128 tras el preambulo de 128 bytes.
 * Devuelve null si no coincide (se rechaza la subida).
 */
export function detectarTipo(buf: Uint8Array): TipoDetectado | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && png.every((b, i) => buf[i] === b)) return { mime: 'image/png', ext: 'png' };
  if (buf.length >= 132 && buf[128] === 0x44 && buf[129] === 0x49 && buf[130] === 0x43 && buf[131] === 0x4d) return { mime: 'application/dicom', ext: 'dcm' };
  return null;
}

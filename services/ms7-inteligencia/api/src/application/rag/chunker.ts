export interface Seccion { titulo: string; texto: string }
export interface DocumentoParseado { titulo: string; version: string; secciones: Seccion[] }
export interface Fragmento { seccion: string; orden: number; texto: string }

/** Lee la cabecera `---` (titulo, version) y divide el cuerpo por encabezados `##`. */
export function parsearDocumento(nombre: string, contenido: string): DocumentoParseado {
  let cuerpo = contenido.replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  const cab = /^---\n([\s\S]*?)\n---\n?/.exec(cuerpo);
  if (cab) {
    for (const linea of cab[1]!.split('\n')) {
      const m = /^(\w+):\s*(.+)$/.exec(linea.trim());
      if (m) meta[m[1]!] = m[2]!.trim();
    }
    cuerpo = cuerpo.slice(cab[0].length);
  }
  const secciones: Seccion[] = [];
  let actual: Seccion = { titulo: 'Introduccion', texto: '' };
  for (const linea of cuerpo.split('\n')) {
    const h = /^##\s+(.+)$/.exec(linea);
    if (h) {
      if (actual.texto.trim()) secciones.push({ ...actual, texto: actual.texto.trim() });
      actual = { titulo: h[1]!.trim(), texto: '' };
    } else if (!/^>\s*DOCUMENTO DE EJEMPLO/i.test(linea) && !/^#\s/.test(linea)) {
      actual.texto += `${linea}\n`;
    }
  }
  if (actual.texto.trim()) secciones.push({ ...actual, texto: actual.texto.trim() });
  return { titulo: meta.titulo ?? nombre, version: meta.version ?? 'sin-version', secciones };
}

/**
 * Divide cada seccion en ventanas de ~`max` caracteres con solapamiento, cortando en limites de oracion cuando es posible.
 * El modelo de embeddings admite ~128 tokens (~480 caracteres en espanol), por eso el valor por defecto es 480.
 */
export function dividir(secciones: Seccion[], max = 480, solape = 80): Fragmento[] {
  if (max <= solape * 2) throw new Error('max debe ser mayor que el doble del solapamiento');
  const out: Fragmento[] = [];
  for (const s of secciones) {
    const texto = s.texto.replace(/\s+/g, ' ').trim();
    if (texto.length <= max) {
      out.push({ seccion: s.titulo, orden: out.length, texto });
      continue;
    }
    let ini = 0;
    while (ini < texto.length) {
      let fin = Math.min(ini + max, texto.length);
      if (fin < texto.length) {
        const corte = texto.lastIndexOf('. ', fin);
        if (corte > ini + max * 0.5) fin = corte + 1; // termina en una oracion completa
      }
      out.push({ seccion: s.titulo, orden: out.length, texto: texto.slice(ini, fin).trim() });
      if (fin >= texto.length) break;
      ini = Math.max(fin - solape, ini + 1);
      const espacio = texto.indexOf(' ', ini);
      if (espacio > 0 && espacio < ini + solape) ini = espacio + 1; // no empieza a mitad de palabra
    }
  }
  return out;
}

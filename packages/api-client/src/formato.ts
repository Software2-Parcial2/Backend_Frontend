/** Zona horaria de la clinica (La Paz, UTC-4 sin horario de verano). */
export const ZONA_CLINICA = 'America/La_Paz';

const SIMBOLO: Record<string, string> = { BOB: 'Bs', USD: 'US$', EUR: '€' };

/**
 * Dinero que llega como string decimal («180.00») y moneda. NO pasa por numeros de coma flotante: solo agrupa miles.
 * `dinero('180.00')` -> `Bs 180.00`; `dinero('1250.5')` -> `Bs 1,250.50`; `dinero('180.00', 'BOB', { sinCentavos: true })` -> `Bs 180`.
 */
export function dinero(valor: string | number | null | undefined, moneda = 'BOB', opciones: { sinCentavos?: boolean } = {}): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const texto = String(valor).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto);
  if (!m) return texto;
  const [, signo, entero, dec = ''] = m;
  const miles = entero!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const centavos = (dec + '00').slice(0, 2);
  const simbolo = SIMBOLO[moneda] ?? moneda;
  const cuerpo = opciones.sinCentavos && /^0*$/.test(dec) ? miles : `${miles}.${centavos}`;
  return `${signo}${simbolo} ${cuerpo}`;
}

/** Suma de importes decimales sin errores de coma flotante (trabaja en centavos enteros). */
export function sumarDinero(valores: (string | number | null | undefined)[]): string {
  let centavos = 0n;
  for (const v of valores) {
    if (v === null || v === undefined || v === '') continue;
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v).trim());
    if (!m) continue;
    const c = BigInt(m[2]!) * 100n + BigInt(((m[3] ?? '') + '00').slice(0, 2));
    centavos += m[1] ? -c : c;
  }
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-BO', { timeZone: ZONA_CLINICA, ...opts });
const aFecha = (v: string | Date | number | null | undefined): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** «3 nov 2026» en la hora de la clinica. */
export function formatoFecha(v: string | Date | number | null | undefined): string {
  const d = aFecha(v);
  return d ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/\./g, '') : '—';
}

/** «10:30» (24 h) en la hora de la clinica. */
export function formatoHora(v: string | Date | number | null | undefined): string {
  const d = aFecha(v);
  return d ? fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : '—';
}

/** «3 nov 2026, 10:30». */
export function formatoFechaHora(v: string | Date | number | null | undefined): string {
  const d = aFecha(v);
  return d ? `${formatoFecha(d)}, ${formatoHora(d)}` : '—';
}

/** «martes 3 de noviembre». */
export function formatoDiaLargo(v: string | Date | number | null | undefined): string {
  const d = aFecha(v);
  return d ? fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d) : '—';
}

/** `AAAA-MM-DD` del dia de la clinica en que cae ese instante (para `?fecha=` de la agenda). */
export function fechaLocal(v: string | Date | number = new Date()): string {
  const d = aFecha(v) ?? new Date();
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p; // en-CA ya da AAAA-MM-DD
}

/** Instante ISO UTC de las 00:00 de un dia de la clinica (`AAAA-MM-DD`). La Paz es UTC-4 todo el año. */
export function inicioDelDia(fecha: string): string {
  return new Date(`${fecha}T00:00:00-04:00`).toISOString();
}

/** Suma `dias` a una fecha `AAAA-MM-DD` (calendario, sin zonas). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** «hace 5 min», «hace 2 h», «ayer»... respecto a `ahora`. */
export function hace(v: string | Date | number | null | undefined, ahora: Date = new Date()): string {
  const d = aFecha(v);
  if (!d) return '—';
  const s = Math.round((ahora.getTime() - d.getTime()) / 1000);
  if (s < 45) return 'ahora';
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 172800) return 'ayer';
  return formatoFecha(d);
}

/** Iniciales para un avatar: «Carla Rojas Vaca» -> «CR». */
export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

import type { Canal, NotificacionTipo } from '../domain/notificacion.js';

/** Contenido ya renderizado. n8n solo lo transporta; la fuente de verdad de los textos es esta. */
export interface Mensaje {
  plantilla: string;
  asunto: string;
  texto: string;
  html?: string;
}

const ZONA = 'America/La_Paz';

function cuando(iso?: string): { fecha: string; hora: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    fecha: new Intl.DateTimeFormat('es-BO', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(d),
    hora: new Intl.DateTimeFormat('es-BO', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).format(d),
  };
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface DatosPlantilla {
  nombre?: string;
  fechaHora?: string;
}

/**
 * Plantillas en espanol con el contenido minimo: fecha y hora de la cita. NUNCA se incluye especialidad, medico, diagnostico
 * ni motivo clinico, y por Telegram (canal menos controlado) el texto es aun mas corto.
 */
export function renderizar(tipo: NotificacionTipo, canal: Canal, datos: DatosPlantilla): Mensaje {
  const c = cuando(datos.fechaHora);
  const saludo = datos.nombre && canal === 'EMAIL' ? `Hola ${datos.nombre}. ` : '';
  const cuandoTxt = c ? `el ${c.fecha} a las ${c.hora} (hora de La Paz)` : 'en la fecha acordada';

  const base: Record<NotificacionTipo, { plantilla: string; asunto: string; cuerpo: string; telegram: string }> = {
    CITA_CONFIRMADA: {
      plantilla: 'cita-confirmada',
      asunto: 'Tu cita esta confirmada',
      cuerpo: `Tu cita fue confirmada para ${cuandoTxt}.`,
      telegram: `Cita confirmada: ${c ? `${c.fecha}, ${c.hora}` : 'revisa SIGEC'}.`,
    },
    RECORDATORIO: {
      plantilla: 'recordatorio-cita',
      asunto: 'Recordatorio de tu cita',
      cuerpo: `Te recordamos que tienes una cita ${cuandoTxt}.`,
      telegram: `Recordatorio: tienes una cita ${c ? `${c.fecha}, ${c.hora}` : 'proximamente'}.`,
    },
    CITA_REPROGRAMADA: {
      plantilla: 'cita-reprogramada',
      asunto: 'Tu cita fue reprogramada',
      cuerpo: `Tu cita fue reprogramada para ${cuandoTxt}.`,
      telegram: `Cita reprogramada: ${c ? `${c.fecha}, ${c.hora}` : 'revisa SIGEC'}.`,
    },
    RECORDATORIO_REFUERZO: {
      plantilla: 'recordatorio-cita-refuerzo',
      asunto: 'Recordatorio importante de tu cita',
      cuerpo: `Es importante que asistas: tienes una cita ${cuandoTxt}. Si no puedes venir, avisa a recepcion.`,
      telegram: `Importante: tienes una cita ${c ? `${c.fecha}, ${c.hora}` : 'proximamente'}. Si no puedes, avisa a recepcion.`,
    },
    ESTUDIO_VALIDADO: {
      plantilla: 'estudio-validado',
      asunto: 'Tu estudio ya tiene informe',
      cuerpo: 'El informe de tu estudio ya esta disponible en SIGEC.',
      telegram: 'Tu estudio ya tiene informe en SIGEC.',
    },
    CITA_CANCELADA: {
      plantilla: 'cita-cancelada',
      asunto: 'Tu cita no pudo confirmarse',
      cuerpo: 'Tu solicitud de cita no pudo completarse y fue cancelada. Contacta con recepcion para reagendar.',
      telegram: 'Tu solicitud de cita no pudo completarse. Contacta con recepcion.',
    },
  };
  const b = base[tipo];
  if (canal === 'TELEGRAM') return { plantilla: b.plantilla, asunto: b.asunto, texto: b.telegram };
  const texto = `${saludo}${b.cuerpo}\n\nSIGEC - Sistema Integral de Gestion de Clinicas`;
  return {
    plantilla: b.plantilla,
    asunto: b.asunto,
    texto,
    html: `<p>${escapar(saludo + b.cuerpo)}</p><p style="color:#666">SIGEC - Sistema Integral de Gestion de Clinicas</p>`,
  };
}

// --- plantillas editables -------------------------------------------------------------------------------

/** Variables que una plantilla puede usar. Ninguna lleva datos clinicos. */
export const VARIABLES_PERMITIDAS = ['nombre', 'fecha', 'hora', 'cuando'] as const;
const CLINICO = /diagn[oó]stic|tratamient|receta|medicament|enfermedad|patolog|especialidad|neumon|c[aá]ncer|\bdosis\b|\d+\s?mg\b/i;
const REQUIEREN_FECHA = new Set<NotificacionTipo>(['CITA_CONFIRMADA', 'CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO']);
export const MAX_CUERPO: Record<Canal, number> = { EMAIL: 1500, TELEGRAM: 300 };

export class PlantillaInvalida extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Valida una plantilla propuesta. Lanza PlantillaInvalida con un codigo estable. */
export function validarPlantilla(tipo: NotificacionTipo, canal: Canal, asunto: string, cuerpo: string): void {
  if (!asunto.trim() || asunto.length > 150) throw new PlantillaInvalida('PLANTILLA_INVALIDA', 'El asunto debe tener entre 1 y 150 caracteres');
  if (!cuerpo.trim()) throw new PlantillaInvalida('PLANTILLA_INVALIDA', 'El cuerpo no puede estar vacio');
  if (cuerpo.length > MAX_CUERPO[canal]) throw new PlantillaInvalida('PLANTILLA_INVALIDA', `El cuerpo de ${canal} admite hasta ${MAX_CUERPO[canal]} caracteres`);
  const texto = `${asunto}\n${cuerpo}`;
  const abiertas = (texto.match(/\{\{/g) ?? []).length;
  const usadas = [...texto.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)].map((m) => m[1]);
  if (abiertas !== usadas.length) throw new PlantillaInvalida('PLANTILLA_VARIABLE_INVALIDA', 'Hay una variable mal escrita; usa {{nombre}}, {{fecha}}, {{hora}} o {{cuando}}');
  const desconocidas = [...new Set(usadas.filter((v) => !(VARIABLES_PERMITIDAS as readonly string[]).includes(v)))];
  if (desconocidas.length) throw new PlantillaInvalida('PLANTILLA_VARIABLE_INVALIDA', `Variables no permitidas: ${desconocidas.join(', ')}. Permitidas: ${VARIABLES_PERMITIDAS.join(', ')}`);
  if (CLINICO.test(texto)) throw new PlantillaInvalida('PLANTILLA_CONTENIDO_CLINICO', 'Las plantillas no pueden mencionar datos clinicos (diagnostico, tratamiento, medicamentos, especialidad...)');
  if (REQUIEREN_FECHA.has(tipo) && !usadas.some((v) => v === 'cuando' || v === 'fecha')) {
    throw new PlantillaInvalida('PLANTILLA_SIN_FECHA', 'Este aviso debe incluir {{cuando}} o {{fecha}} para que el paciente sepa la fecha de su cita');
  }
}

/** Sustituye las variables de una plantilla propia. Lo que falta se deja en blanco. */
export function renderizarPlantilla(p: { tipo: NotificacionTipo; asunto: string; cuerpo: string }, canal: Canal, datos: DatosPlantilla): Mensaje {
  const c = cuando(datos.fechaHora);
  const valores: Record<string, string> = {
    nombre: datos.nombre ?? '',
    fecha: c?.fecha ?? '',
    hora: c?.hora ?? '',
    cuando: c ? `el ${c.fecha} a las ${c.hora} (hora de La Paz)` : 'en la fecha acordada',
  };
  const sub = (t: string) => t.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, v: string) => valores[v] ?? '');
  const asunto = sub(p.asunto).trim();
  const cuerpo = sub(p.cuerpo).trim();
  const plantilla = `personalizada-${p.tipo.toLowerCase().replace(/_/g, '-')}`;
  if (canal === 'TELEGRAM') return { plantilla, asunto, texto: cuerpo };
  return {
    plantilla,
    asunto,
    texto: `${cuerpo}\n\nSIGEC - Sistema Integral de Gestion de Clinicas`,
    html: `<p>${escapar(cuerpo).replace(/\n/g, '<br>')}</p><p style="color:#666">SIGEC - Sistema Integral de Gestion de Clinicas</p>`,
  };
}

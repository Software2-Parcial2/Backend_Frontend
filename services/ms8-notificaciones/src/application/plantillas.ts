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

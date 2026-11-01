import {
  type Canal,
  type CitaRecordable,
  type Contacto,
  type Notificacion,
  type NotificacionTipo,
  PreferenciasInvalidasError,
  type RespuestaSaga,
  VinculoInvalidoError,
} from '../domain/notificacion.js';
import type { AlertaPort, ContactoRepository, NotificacionRepository, NotificationSender, RecordatorioRepository } from './ports.js';
import { renderizar } from './plantillas.js';

export interface NotificacionesConfig {
  /** Intentos totales antes de pasar a FALLIDA (y alertar). */
  maxIntentos: number;
  /** Backoff exponencial: base * 2^(intento-1). */
  backoffBaseMs: number;
  vinculoTtlMs: number;
}

export const DEFAULT_CONFIG: NotificacionesConfig = { maxIntentos: 5, backoffBaseMs: 30_000, vinculoTtlMs: 10 * 60_000 };

export interface ComandoNotificacion {
  mensajeId: string;
  correlationId: string;
  citaId: string;
  pacienteId: string;
  tipo: 'CITA_CONFIRMADA' | 'CITA_CANCELADA';
  fechaHora?: string;
  motivo?: string;
}

export interface NotificacionesDeps {
  sender: NotificationSender;
  alertas: AlertaPort;
  notificaciones: NotificacionRepository;
  contactos: ContactoRepository;
  recordatorios: RecordatorioRepository;
  newId: () => string;
  now?: () => number;
  config?: Partial<NotificacionesConfig>;
  log?: (m: string) => void;
}

const CANALES: Canal[] = ['EMAIL', 'TELEGRAM'];

/**
 * Casos de uso de MS8. Un fallo del canal NO rompe la SAGA: la notificacion queda PENDIENTE y se reintenta con backoff;
 * tras `maxIntentos` pasa a FALLIDA, se responde `...fallida` a MS3 y se dispara una alerta interna. MS3 deja entonces la cita
 * CONFIRMADA con la notificacion pendiente (un fallo de notificacion nunca anula una cita).
 */
export class NotificacionesService {
  private readonly now: () => number;
  private readonly cfg: NotificacionesConfig;

  constructor(private readonly d: NotificacionesDeps) {
    this.now = d.now ?? Date.now;
    this.cfg = { ...DEFAULT_CONFIG, ...d.config };
  }

  // --- comandos de la SAGA -------------------------------------------------------------------------

  async recibirComando(cmd: ComandoNotificacion): Promise<Notificacion> {
    const previa = await this.d.notificaciones.obtener(cmd.citaId, cmd.tipo);
    if (previa) {
      // Idempotente por (cita, tipo): MS3 reenvia el comando si no obtuvo respuesta. Se repite la respuesta final; si sigue
      // PENDIENTE no se hace nada (el barrido de reintentos se encarga).
      if (previa.estado !== 'PENDIENTE' && previa.tipo === 'CITA_CONFIRMADA') {
        await this.d.notificaciones.guardar(previa, this.respuesta(previa, previa.estado === 'ENVIADA'));
      }
      return previa;
    }
    const ahora = new Date(this.now()).toISOString();
    const n: Notificacion = {
      id: this.d.newId(),
      citaId: cmd.citaId,
      pacienteId: cmd.pacienteId,
      tipo: cmd.tipo,
      estado: 'PENDIENTE',
      canalesEnviados: [],
      intentos: 0,
      fechaHora: cmd.fechaHora,
      motivo: cmd.motivo,
      correlationId: cmd.correlationId,
      comandoId: cmd.mensajeId,
      creadaEn: ahora,
      actualizadaEn: ahora,
      version: -1, // aun no existe
    };
    if (cmd.tipo === 'CITA_CANCELADA') {
      // Una cancelacion es una SAGA compensada: ademas de avisar al paciente, se avisa al personal.
      void this.d.alertas.alertar(`SAGA compensada: la cita ${cmd.citaId} se cancelo (${cmd.motivo ?? 'sin motivo'})`);
    }
    return this.intentar(n);
  }

  /** Barrido: reintenta las notificaciones PENDIENTES cuyo plazo vencio. Devuelve cuantas proceso. */
  async reintentarPendientes(): Promise<number> {
    let n = 0;
    for (const { citaId, tipo } of await this.d.notificaciones.vencidas(this.now())) {
      const actual = await this.d.notificaciones.obtener(citaId, tipo);
      if (actual?.estado === 'PENDIENTE') {
        await this.intentar(actual);
        n++;
      }
    }
    return n;
  }

  /** Un intento de envio: entrega a los canales que faltan y decide el estado. */
  private async intentar(n: Notificacion): Promise<Notificacion> {
    const errores: string[] = [];
    const enviados = new Set<Canal>(n.canalesEnviados);
    let canales: { canal: Canal; destinatario: string }[] = [];
    try {
      canales = await this.resolverCanales(n.pacienteId);
    } catch (e) {
      errores.push((e as Error).message);
    }
    const contacto = await this.d.contactos.obtener(n.pacienteId).catch(() => null);
    for (const { canal, destinatario } of canales) {
      if (enviados.has(canal)) continue;
      try {
        await this.d.sender.enviar({
          canal,
          destinatario,
          notificacionId: n.id,
          pacienteId: n.pacienteId,
          mensaje: renderizar(n.tipo, canal, { nombre: contacto?.nombre, fechaHora: n.fechaHora }),
        });
        enviados.add(canal);
      } catch (e) {
        errores.push(`${canal}: ${(e as Error).message}`);
      }
    }

    const intentos = n.intentos + 1;
    const todos = canales.length > 0 && canales.every((c) => enviados.has(c.canal));
    const ahora = new Date(this.now()).toISOString();
    let siguiente: Notificacion = { ...n, canalesEnviados: [...enviados], intentos, actualizadaEn: ahora };
    if (todos) {
      siguiente = { ...siguiente, estado: 'ENVIADA', proximoIntento: undefined, ultimoError: undefined };
    } else if (intentos >= this.cfg.maxIntentos) {
      siguiente = { ...siguiente, estado: 'FALLIDA', proximoIntento: undefined, ultimoError: errores.join('; ') };
    } else {
      const espera = this.cfg.backoffBaseMs * 2 ** (intentos - 1);
      siguiente = { ...siguiente, estado: 'PENDIENTE', proximoIntento: this.now() + espera, ultimoError: errores.join('; ') };
      this.d.log?.(`notificacion ${n.tipo} cita=${n.citaId.slice(0, 8)} fallo (${siguiente.ultimoError}); reintento ${intentos}/${this.cfg.maxIntentos} en ${espera} ms`);
    }

    const resp = siguiente.estado !== 'PENDIENTE' && siguiente.tipo === 'CITA_CONFIRMADA' ? this.respuesta(siguiente, siguiente.estado === 'ENVIADA') : null;
    await this.d.notificaciones.guardar(siguiente, resp);
    if (siguiente.estado === 'FALLIDA') {
      await this.d.alertas.alertar(`Notificacion ${siguiente.tipo} FALLIDA tras ${intentos} intentos (cita ${siguiente.citaId}): ${siguiente.ultimoError}`);
    }
    return siguiente;
  }

  private respuesta(n: Notificacion, enviada: boolean): RespuestaSaga | null {
    if (!n.correlationId || !n.comandoId) return null; // recordatorios y otros: sin respuesta de SAGA
    return {
      id: this.d.newId(),
      type: enviada ? 'notificaciones.cita-confirmada.enviada' : 'notificaciones.cita-confirmada.fallida',
      correlationId: n.correlationId,
      causationId: n.comandoId,
      payload: enviada
        ? { citaId: n.citaId, notificacionId: n.id, canal: n.canalesEnviados.join('+') || 'n/d' }
        : { citaId: n.citaId, motivo: n.ultimoError ?? 'error desconocido' },
    };
  }

  /** Canales segun la preferencia del paciente (por defecto EMAIL) que tienen destinatario. */
  private async resolverCanales(pacienteId: string): Promise<{ canal: Canal; destinatario: string }[]> {
    const c = await this.d.contactos.obtener(pacienteId);
    const preferidos = c?.canales?.length ? c.canales : (['EMAIL'] as Canal[]);
    const out: { canal: Canal; destinatario: string }[] = [];
    for (const canal of preferidos) {
      const destino = canal === 'EMAIL' ? c?.email : c?.telegramChatId;
      if (destino) out.push({ canal, destinatario: destino });
      else if (!this.d.sender.requiereDestinatario) out.push({ canal, destinatario: 'simulado' });
    }
    if (out.length === 0) throw new Error(`sin canal de contacto disponible para el paciente ${pacienteId}`);
    return out;
  }

  // --- contacto, preferencias y vinculacion de Telegram ---------------------------------------------

  /** Evento paciente.creado: guarda el contacto sin pisar las preferencias ya elegidas. */
  async registrarContacto(p: { pacienteId: string; nombre?: string; email?: string | null }): Promise<void> {
    const previo = await this.d.contactos.obtener(p.pacienteId);
    await this.d.contactos.guardar({ canales: ['EMAIL'], ...previo, pacienteId: p.pacienteId, nombre: p.nombre ?? previo?.nombre, email: p.email ?? previo?.email });
  }

  async obtenerPreferencias(pacienteId: string): Promise<Contacto> {
    return (await this.d.contactos.obtener(pacienteId)) ?? { pacienteId, canales: ['EMAIL'] };
  }

  async guardarPreferencias(pacienteId: string, canales: string[]): Promise<Contacto> {
    const validos = [...new Set(canales)].filter((c): c is Canal => CANALES.includes(c as Canal));
    if (validos.length === 0 || validos.length !== new Set(canales).size) {
      throw new PreferenciasInvalidasError('canales debe contener EMAIL, TELEGRAM o ambos');
    }
    const actual = await this.obtenerPreferencias(pacienteId);
    if (validos.includes('TELEGRAM') && !actual.telegramChatId) {
      // Se permite elegirlo antes de vincular: hasta entonces solo se usara EMAIL.
      this.d.log?.(`paciente ${pacienteId} prefiere TELEGRAM pero aun no lo vinculo`);
    }
    const nuevo = { ...actual, canales: validos };
    await this.d.contactos.guardar(nuevo);
    return nuevo;
  }

  /** Genera un codigo de un solo uso (10 min) que el paciente envia al bot como `/start <codigo>`. */
  async generarCodigoVinculo(pacienteId: string, codigo: string): Promise<{ codigo: string; expiraEn: string }> {
    const expiraEn = this.now() + this.cfg.vinculoTtlMs;
    await this.d.contactos.crearVinculo(codigo, pacienteId, expiraEn);
    return { codigo, expiraEn: new Date(expiraEn).toISOString() };
  }

  /** Lo llama el workflow del bot al recibir `/start <codigo>`: asocia el chat con el paciente. */
  async vincularTelegram(codigo: string, chatId: string): Promise<{ pacienteId: string }> {
    const pacienteId = await this.d.contactos.consumirVinculo(codigo.trim().toUpperCase(), this.now());
    if (!pacienteId) throw new VinculoInvalidoError('codigo inexistente, expirado o ya usado');
    const actual = await this.obtenerPreferencias(pacienteId);
    const canales = [...new Set<Canal>([...actual.canales, 'TELEGRAM'])];
    await this.d.contactos.guardar({ ...actual, telegramChatId: chatId, canales });
    return { pacienteId };
  }

  // --- recordatorios --------------------------------------------------------------------------------

  registrarCitaConfirmada(c: CitaRecordable): Promise<void> {
    return this.d.recordatorios.registrar(c);
  }

  /** Citas de las proximas `horas` horas sin recordatorio (las pide el workflow horario de n8n). */
  recordatoriosPendientes(horas = 24): Promise<CitaRecordable[]> {
    const ahora = this.now();
    return this.d.recordatorios.pendientes(ahora, ahora + horas * 3_600_000);
  }

  /** Envia el recordatorio de una cita (con los mismos reintentos) y la saca de la lista de pendientes. */
  async enviarRecordatorio(citaId: string): Promise<Notificacion | null> {
    const cita = await this.d.recordatorios.obtener(citaId);
    if (!cita) return null;
    const existente = await this.d.notificaciones.obtener(citaId, 'RECORDATORIO');
    if (existente) {
      await this.d.recordatorios.marcar(citaId);
      return existente;
    }
    const ahora = new Date(this.now()).toISOString();
    const n = await this.intentar({
      id: this.d.newId(), citaId, pacienteId: cita.pacienteId, tipo: 'RECORDATORIO' as NotificacionTipo, estado: 'PENDIENTE',
      canalesEnviados: [], intentos: 0, fechaHora: cita.fechaHora, creadaEn: ahora, actualizadaEn: ahora, version: -1,
    });
    await this.d.recordatorios.marcar(citaId); // el reintento, si hace falta, lo lleva el barrido de PENDIENTES
    return n;
  }

  porCita(citaId: string): Promise<Notificacion[]> {
    return this.d.notificaciones.porCita(citaId);
  }
}

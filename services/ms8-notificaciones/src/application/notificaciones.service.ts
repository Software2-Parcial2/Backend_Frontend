import {
  ANTELACIONES_HORAS,
  claveDe,
  type Canal,
  type CitaRecordable,
  type Contacto,
  type Notificacion,
  type NotificacionTipo,
  type Plantilla,
  PreferenciasInvalidasError,
  type PreferenciasPersonal,
  ReglaNotificacionError,
  type RespuestaSaga,
  TIPOS,
  TIPOS_OPCIONALES,
  VinculoInvalidoError,
} from '../domain/notificacion.js';
import type {
  AlertaPort,
  ContactoRepository,
  FiltroHistorial,
  NotificacionRepository,
  NotificationSender,
  PaginaNotificaciones,
  PlantillaRepository,
  PreferenciasPersonalRepository,
  RecordatorioRepository,
} from './ports.js';
import { PlantillaInvalida, renderizar, renderizarPlantilla, validarPlantilla, type Mensaje } from './plantillas.js';

export interface NotificacionesConfig {
  /** Intentos totales antes de pasar a FALLIDA (y alertar). */
  maxIntentos: number;
  /** Backoff exponencial: base * 2^(intento-1). */
  backoffBaseMs: number;
  vinculoTtlMs: number;
  /** Minutos de la zona horaria de la clinica respecto a UTC (La Paz = -240): define el «dia» del resumen. */
  zonaOffsetMin: number;
}

export const DEFAULT_CONFIG: NotificacionesConfig = { maxIntentos: 5, backoffBaseMs: 30_000, vinculoTtlMs: 10 * 60_000, zonaOffsetMin: -240 };

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
  plantillas: PlantillaRepository;
  personal: PreferenciasPersonalRepository;
  newId: () => string;
  now?: () => number;
  config?: Partial<NotificacionesConfig>;
  log?: (m: string) => void;
}

const CANALES: Canal[] = ['EMAIL', 'TELEGRAM'];


export interface FiltrosHistorial extends Omit<FiltroHistorial, 'desde'> {
  desde?: number;
}

export interface ResumenDia {
  fecha: string;
  total: number;
  enviadas: number;
  pendientes: number;
  fallidas: number;
  /** enviadas / (enviadas + fallidas), o null si aun no hay resultados finales. */
  tasaEntrega: number | null;
  porTipo: Record<string, number>;
  porCanal: Record<string, number>;
}

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
          mensaje: await this.mensaje(n.tipo, canal, { nombre: contacto?.nombre, fechaHora: n.fechaHora }),
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

    const resp = !n.reenviada && siguiente.estado !== 'PENDIENTE' && siguiente.tipo === 'CITA_CONFIRMADA' ? this.respuesta(siguiente, siguiente.estado === 'ENVIADA') : null;
    await this.d.notificaciones.guardar(siguiente, resp);
    if (siguiente.estado === 'FALLIDA') {
      await this.d.alertas.alertar(`Notificacion ${siguiente.tipo} FALLIDA tras ${intentos} intentos (cita ${siguiente.citaId}): ${siguiente.ultimoError}`);
    }
    return siguiente;
  }

  /** La plantilla propia vigente si existe; si no, la de fabrica. */
  private async mensaje(tipo: NotificacionTipo, canal: Canal, datos: { nombre?: string; fechaHora?: string }): Promise<Mensaje> {
    const propia = await this.d.plantillas.vigente(tipo, canal).catch(() => null);
    return propia ? renderizarPlantilla(propia, canal, datos) : renderizar(tipo, canal, datos);
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

  async guardarPreferencias(pacienteId: string, canales: string[] | undefined, extra: { tiposAviso?: string[]; antelacionHoras?: number } = {}): Promise<Contacto> {
    const actual = await this.obtenerPreferencias(pacienteId);
    let nuevo: Contacto = { ...actual };
    if (canales !== undefined) {
      const validos = [...new Set(canales)].filter((c): c is Canal => CANALES.includes(c as Canal));
      if (validos.length === 0 || validos.length !== new Set(canales).size) {
        throw new PreferenciasInvalidasError('canales debe contener EMAIL, TELEGRAM o ambos');
      }
      if (validos.includes('TELEGRAM') && !actual.telegramChatId) {
        // Se permite elegirlo antes de vincular: hasta entonces solo se usara EMAIL.
        this.d.log?.(`paciente ${pacienteId} prefiere TELEGRAM pero aun no lo vinculo`);
      }
      nuevo.canales = validos;
    }
    if (extra.tiposAviso !== undefined) {
      const tipos = [...new Set(extra.tiposAviso)];
      if (tipos.some((t) => !TIPOS_OPCIONALES.includes(t as NotificacionTipo))) {
        throw new PreferenciasInvalidasError(`tiposAviso solo admite: ${TIPOS_OPCIONALES.join(', ')} (la confirmacion y la cancelacion se envian siempre)`);
      }
      nuevo.tiposAviso = tipos as NotificacionTipo[];
    }
    if (extra.antelacionHoras !== undefined) {
      if (!ANTELACIONES_HORAS.includes(extra.antelacionHoras)) throw new PreferenciasInvalidasError(`antelacionHoras debe ser una de ${ANTELACIONES_HORAS.join(', ')}`);
      nuevo.antelacionHoras = extra.antelacionHoras;
    }
    await this.d.contactos.guardar(nuevo);
    return nuevo;
  }

  /** El paciente deja de usar Telegram: se borra el chat y, si era su unico canal, vuelve a EMAIL. */
  async desvincularTelegram(pacienteId: string): Promise<Contacto> {
    const actual = await this.obtenerPreferencias(pacienteId);
    if (!actual.telegramChatId) throw new ReglaNotificacionError('TELEGRAM_NO_VINCULADO', 404, 'El paciente no tiene Telegram vinculado');
    await this.d.contactos.desvincularTelegram(pacienteId);
    const canales = actual.canales.filter((c) => c !== 'TELEGRAM');
    const nuevo: Contacto = { ...actual, telegramChatId: undefined, canales: canales.length ? canales : ['EMAIL'] };
    await this.d.contactos.guardar(nuevo);
    return nuevo;
  }

  // --- preferencias del personal (alertas internas) ---------------------------------------------------

  async obtenerPreferenciasPersonal(usuarioId: string): Promise<PreferenciasPersonal> {
    return (await this.d.personal.obtener(usuarioId)) ?? { usuarioId, alertas: { sagaCompensada: true, notificacionFallida: true, colaDeErrores: true }, actualizadaEn: new Date(0).toISOString() };
  }

  async guardarPreferenciasPersonal(usuarioId: string, alertas: PreferenciasPersonal['alertas']): Promise<PreferenciasPersonal> {
    // Objeto plano: el DTO validado llega como instancia de clase y el cliente de DynamoDB no marshala instancias.
    const plano = { sagaCompensada: alertas.sagaCompensada, notificacionFallida: alertas.notificacionFallida, colaDeErrores: alertas.colaDeErrores };
    const p: PreferenciasPersonal = { usuarioId, alertas: plano, actualizadaEn: new Date(this.now()).toISOString() };
    await this.d.personal.guardar(p);
    return p;
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

  /**
   * Citas por recordar ahora (las pide el workflow horario de n8n). Cada paciente fija su antelacion (2-48 h); `horas` es la
   * de quien no eligio. Quien apago los recordatorios no aparece.
   */
  async recordatoriosPendientes(horas = 24): Promise<CitaRecordable[]> {
    const ahora = this.now();
    const candidatas = await this.d.recordatorios.pendientes(ahora, ahora + Math.max(horas, ...ANTELACIONES_HORAS) * 3_600_000);
    const out: CitaRecordable[] = [];
    for (const c of candidatas) {
      const pref = await this.d.contactos.obtener(c.pacienteId);
      if (pref?.tiposAviso && !pref.tiposAviso.includes('RECORDATORIO')) continue;
      if (Date.parse(c.fechaHora) <= ahora + (pref?.antelacionHoras ?? horas) * 3_600_000) out.push(c);
    }
    return out;
  }

  /** Envia el recordatorio de una cita (con los mismos reintentos) y la saca de la lista de pendientes. 'OMITIDO' si el paciente los apago. */
  async enviarRecordatorio(citaId: string): Promise<Notificacion | 'OMITIDO' | null> {
    const cita = await this.d.recordatorios.obtener(citaId);
    if (!cita) return null;
    const existente = await this.d.notificaciones.obtener(citaId, 'RECORDATORIO');
    if (existente) {
      await this.d.recordatorios.marcar(citaId);
      return existente;
    }
    if (await this.optoPorNo(cita.pacienteId, 'RECORDATORIO')) {
      await this.d.recordatorios.marcar(citaId);
      return 'OMITIDO';
    }
    const n = await this.intentar(this.nueva(citaId, cita.pacienteId, 'RECORDATORIO', cita.fechaHora));
    await this.d.recordatorios.marcar(citaId); // el reintento, si hace falta, lo lleva el barrido de PENDIENTES
    return n;
  }

  /** Recordatorio extra pedido por otro servicio (p. ej. MS7 ante un riesgo alto de inasistencia). Uno por cita; repetirlo no reenvia. */
  async reforzarRecordatorio(citaId: string): Promise<Notificacion | 'OMITIDO' | null> {
    const cita = await this.d.recordatorios.obtener(citaId);
    if (!cita) return null;
    const existente = await this.d.notificaciones.obtener(citaId, 'RECORDATORIO_REFUERZO');
    if (existente) return existente;
    if (await this.optoPorNo(cita.pacienteId, 'RECORDATORIO_REFUERZO')) return 'OMITIDO';
    return this.intentar(this.nueva(citaId, cita.pacienteId, 'RECORDATORIO_REFUERZO', cita.fechaHora));
  }

  // --- eventos de otros servicios -----------------------------------------------------------------------

  /** cita.cancelada: ya no hay nada que recordar. (El aviso de cancelacion lo pide MS3 como comando de la SAGA.) */
  async citaCancelada(citaId: string): Promise<void> {
    await this.d.recordatorios.cancelar(citaId);
  }

  /** cita.reprogramada: se recordara la nueva fecha y se avisa al paciente (una notificacion por nueva fecha). */
  async citaReprogramada(c: CitaRecordable): Promise<Notificacion | 'OMITIDO'> {
    await this.d.recordatorios.reprogramar(c);
    const previa = await this.d.notificaciones.obtener(c.citaId, claveDe('CITA_REPROGRAMADA', c.fechaHora));
    if (previa) return previa;
    if (await this.optoPorNo(c.pacienteId, 'CITA_REPROGRAMADA')) return 'OMITIDO';
    return this.intentar(this.nueva(c.citaId, c.pacienteId, 'CITA_REPROGRAMADA', c.fechaHora));
  }

  /** imagen.informe-validado: avisa que el informe esta disponible (sin ningun dato clinico). `citaId` lleva el id del estudio. */
  async estudioValidado(e: { imagenId: string; pacienteId: string }): Promise<Notificacion | 'OMITIDO'> {
    const previa = await this.d.notificaciones.obtener(e.imagenId, 'ESTUDIO_VALIDADO');
    if (previa) return previa;
    if (await this.optoPorNo(e.pacienteId, 'ESTUDIO_VALIDADO')) return 'OMITIDO';
    return this.intentar(this.nueva(e.imagenId, e.pacienteId, 'ESTUDIO_VALIDADO'));
  }

  private async optoPorNo(pacienteId: string, tipo: NotificacionTipo): Promise<boolean> {
    const c = await this.d.contactos.obtener(pacienteId);
    return !!c?.tiposAviso && !c.tiposAviso.includes(tipo);
  }

  private nueva(citaId: string, pacienteId: string, tipo: NotificacionTipo, fechaHora?: string): Notificacion {
    const ahora = new Date(this.now()).toISOString();
    return { id: this.d.newId(), citaId, pacienteId, tipo, estado: 'PENDIENTE', canalesEnviados: [], intentos: 0, fechaHora, creadaEn: ahora, actualizadaEn: ahora, version: -1 };
  }

  // --- consulta y gestion del historial -------------------------------------------------------------------

  porCita(citaId: string): Promise<Notificacion[]> {
    return this.d.notificaciones.porCita(citaId);
  }

  historial(f: FiltrosHistorial, limite: number, cursor?: string): Promise<PaginaNotificaciones> {
    return this.d.notificaciones.historial(f, Math.min(Math.max(limite, 1), 100), cursor);
  }

  /** El paciente marca como leidas las suyas; las ajenas o inexistentes se ignoran (no se revela su existencia). */
  async marcarLeidas(ids: string[], pacienteId: string): Promise<{ marcadas: number }> {
    let marcadas = 0;
    const ahora = new Date(this.now()).toISOString();
    for (const id of new Set(ids)) if (await this.d.notificaciones.marcarLeida(id, ahora, pacienteId)) marcadas++;
    return { marcadas };
  }

  /** Reenvia una notificacion FALLIDA (una accion de operador). No vuelve a responder a la SAGA, que ya tenia su resultado. */
  async reenviar(id: string): Promise<Notificacion> {
    const n = await this.d.notificaciones.obtenerPorId(id);
    if (!n) throw new ReglaNotificacionError('NOTIFICACION_NO_ENCONTRADA', 404, `No existe la notificacion ${id}`);
    if (n.estado !== 'FALLIDA') throw new ReglaNotificacionError('NOTIFICACION_NO_REENVIABLE', 409, `Solo se reenvian las FALLIDAS (esta esta ${n.estado})`);
    return this.intentar({ ...n, estado: 'PENDIENTE', intentos: 0, ultimoError: undefined, reenviada: true });
  }

  /** KPIs del dia (en la zona horaria de la clinica). `fecha` = AAAA-MM-DD; por defecto hoy. */
  async resumen(fecha?: string): Promise<ResumenDia> {
    const dia = fecha ?? new Date(this.now() + this.cfg.zonaOffsetMin * 60_000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(Date.parse(dia))) throw new ReglaNotificacionError('FECHA_INVALIDA', 422, 'fecha debe ser AAAA-MM-DD');
    const inicio = Date.parse(`${dia}T00:00:00.000Z`) - this.cfg.zonaOffsetMin * 60_000;
    const items = await this.d.notificaciones.entreFechas(inicio, inicio + 86_400_000);
    const cuenta = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
    const enviadas = items.filter((n) => n.estado === 'ENVIADA').length;
    const fallidas = items.filter((n) => n.estado === 'FALLIDA').length;
    return {
      fecha: dia,
      total: items.length,
      enviadas,
      pendientes: items.length - enviadas - fallidas,
      fallidas,
      tasaEntrega: enviadas + fallidas > 0 ? Math.round((enviadas / (enviadas + fallidas)) * 1000) / 1000 : null,
      porTipo: cuenta(items.map((n) => n.tipo)),
      porCanal: cuenta(items.flatMap((n) => n.canalesEnviados)),
    };
  }

  // --- plantillas editables ------------------------------------------------------------------------------

  /** Vigente (propia, version >= 1) o de fabrica (version 0). */
  async plantilla(tipo: NotificacionTipo, canal: Canal): Promise<Plantilla & { deFabrica: boolean }> {
    this.exigirTipoCanal(tipo, canal);
    const propia = await this.d.plantillas.vigente(tipo, canal);
    if (propia) return { ...propia, deFabrica: false };
    const base = renderizar(tipo, canal, { nombre: '{{nombre}}', fechaHora: undefined });
    return { tipo, canal, asunto: base.asunto, cuerpo: FABRICA[canal][tipo], version: 0, actualizadoPor: 'sistema', actualizadoEn: new Date(0).toISOString(), deFabrica: true };
  }

  async listarPlantillas(): Promise<(Plantilla & { deFabrica: boolean })[]> {
    const out: (Plantilla & { deFabrica: boolean })[] = [];
    for (const tipo of TIPOS) for (const canal of CANALES) out.push(await this.plantilla(tipo, canal));
    return out;
  }

  /** Guarda una version nueva. `versionBase` es la que vio quien edita (0 = la de fabrica); otra distinta -> 409 VERSION_CONFLICTO. */
  async guardarPlantilla(tipo: NotificacionTipo, canal: Canal, asunto: string, cuerpo: string, versionBase: number, usuario: string): Promise<Plantilla> {
    this.exigirTipoCanal(tipo, canal);
    try {
      validarPlantilla(tipo, canal, asunto, cuerpo);
    } catch (e) {
      if (e instanceof PlantillaInvalida) throw new ReglaNotificacionError(e.code, 422, e.message);
      throw e;
    }
    const vigente = await this.plantilla(tipo, canal);
    if (vigente.version !== versionBase) {
      throw new ReglaNotificacionError('VERSION_CONFLICTO', 409, 'Otro administrador modifico esta plantilla; recargue', { versionVigente: vigente.version });
    }
    const nueva: Plantilla = { tipo, canal, asunto: asunto.trim(), cuerpo: cuerpo.trim(), version: versionBase + 1, actualizadoPor: usuario, actualizadoEn: new Date(this.now()).toISOString() };
    await this.d.plantillas.guardar(nueva);
    return nueva;
  }

  /** Renderiza una propuesta con datos de ejemplo, sin guardarla (y con las mismas validaciones). */
  vistaPrevia(tipo: NotificacionTipo, canal: Canal, asunto: string, cuerpo: string, datos: { nombre?: string; fechaHora?: string } = {}): Mensaje {
    this.exigirTipoCanal(tipo, canal);
    try {
      validarPlantilla(tipo, canal, asunto, cuerpo);
    } catch (e) {
      if (e instanceof PlantillaInvalida) throw new ReglaNotificacionError(e.code, 422, e.message);
      throw e;
    }
    return renderizarPlantilla({ tipo, asunto, cuerpo }, canal, { nombre: datos.nombre ?? 'Ana', fechaHora: datos.fechaHora ?? new Date(this.now() + 86_400_000).toISOString() });
  }

  private exigirTipoCanal(tipo: NotificacionTipo, canal: Canal) {
    if (!TIPOS.includes(tipo)) throw new ReglaNotificacionError('TIPO_INVALIDO', 422, `tipo debe ser uno de: ${TIPOS.join(', ')}`);
    if (!CANALES.includes(canal)) throw new ReglaNotificacionError('CANAL_INVALIDO', 422, 'canal debe ser EMAIL o TELEGRAM');
  }
}

/** Cuerpo de fabrica (con variables) que se muestra al editor cuando aun no hay version propia. */
const FABRICA: Record<Canal, Record<NotificacionTipo, string>> = {
  EMAIL: {
    CITA_CONFIRMADA: 'Hola {{nombre}}. Tu cita fue confirmada para {{cuando}}.',
    RECORDATORIO: 'Hola {{nombre}}. Te recordamos que tienes una cita {{cuando}}.',
    RECORDATORIO_REFUERZO: 'Hola {{nombre}}. Es importante que asistas: tienes una cita {{cuando}}. Si no puedes venir, avisa a recepcion.',
    CITA_REPROGRAMADA: 'Hola {{nombre}}. Tu cita fue reprogramada para {{cuando}}.',
    CITA_CANCELADA: 'Hola {{nombre}}. Tu solicitud de cita no pudo completarse y fue cancelada. Contacta con recepcion para reagendar.',
    ESTUDIO_VALIDADO: 'Hola {{nombre}}. El informe de tu estudio ya esta disponible en SIGEC.',
  },
  TELEGRAM: {
    CITA_CONFIRMADA: 'Cita confirmada: {{fecha}}, {{hora}}.',
    RECORDATORIO: 'Recordatorio: tienes una cita {{fecha}}, {{hora}}.',
    RECORDATORIO_REFUERZO: 'Importante: tienes una cita {{fecha}}, {{hora}}. Si no puedes, avisa a recepcion.',
    CITA_REPROGRAMADA: 'Cita reprogramada: {{fecha}}, {{hora}}.',
    CITA_CANCELADA: 'Tu solicitud de cita no pudo completarse. Contacta con recepcion.',
    ESTUDIO_VALIDADO: 'Tu estudio ya tiene informe en SIGEC.',
  },
};

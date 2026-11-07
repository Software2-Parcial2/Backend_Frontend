import type { Canal, CitaRecordable, Contacto, Notificacion, NotificacionTipo, Plantilla, PreferenciasPersonal, RespuestaSaga } from '../domain/notificacion.js';
import type { Mensaje } from './plantillas.js';

/** Puerto de salida: el canal real (n8n -> Mailtrap / Telegram). Lanza si no pudo entregar. */
export interface NotificationSender {
  /** false para el adaptador simulado, que no necesita direccion de destino. */
  readonly requiereDestinatario: boolean;
  enviar(m: { canal: Canal; destinatario: string; mensaje: Mensaje; notificacionId: string; pacienteId: string }): Promise<void>;
}

/** Puerto de salida: alertas internas (administradores). Nunca debe lanzar. */
export interface AlertaPort {
  alertar(texto: string): Promise<void>;
}

export interface FiltroHistorial {
  pacienteId: string;
  estado?: Notificacion['estado'];
  tipo?: NotificacionTipo;
  canal?: Canal;
  /** epoch ms: solo las creadas desde entonces. */
  desde?: number;
}

export interface PaginaNotificaciones {
  items: Notificacion[];
  siguiente: string | null;
}

export interface NotificacionRepository {
  /** `clave` = el tipo, salvo CITA_REPROGRAMADA que lleva ademas la nueva fecha (una por reprogramacion). */
  obtener(citaId: string, clave: string): Promise<Notificacion | null>;
  obtenerPorId(id: string): Promise<Notificacion | null>;
  /** Historial de un paciente, mas recientes primero, con cursor opaco. */
  historial(filtro: FiltroHistorial, limite: number, cursor?: string): Promise<PaginaNotificaciones>;
  /** Notificaciones creadas en [desde, hasta) (para el resumen diario; tope de seguridad). */
  entreFechas(desde: number, hasta: number, tope?: number): Promise<Notificacion[]>;
  /** Marca como leida; con `pacienteId` solo si es de ese paciente. Devuelve null si no existe o es ajena. */
  marcarLeida(id: string, ahora: string, pacienteId?: string): Promise<Notificacion | null>;
  /** Escribe la notificacion (condicion de version) y, si hay respuesta, la encola en el outbox: todo en una transaccion. */
  guardar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void>;
  /** Notificaciones PENDIENTES cuyo proximo intento ya llego. */
  vencidas(now: number, limite?: number): Promise<{ citaId: string; tipo: string }[]>;
  porCita(citaId: string): Promise<Notificacion[]>;
}

export interface ContactoRepository {
  obtener(pacienteId: string): Promise<Contacto | null>;
  guardar(c: Contacto): Promise<void>;
  /** Quita el chat de Telegram vinculado. */
  desvincularTelegram(pacienteId: string): Promise<void>;
  crearVinculo(codigo: string, pacienteId: string, expiraEn: number): Promise<void>;
  /** Consume el codigo de forma atomica (un solo uso). Devuelve el pacienteId o null si no existe, expiro o ya se uso. */
  consumirVinculo(codigo: string, now: number): Promise<string | null>;
}

export interface RecordatorioRepository {
  registrar(c: CitaRecordable): Promise<void>;
  /** Citas confirmadas con fechaHora en [desde, hasta] y sin recordatorio enviado. */
  pendientes(desde: number, hasta: number, limite?: number): Promise<CitaRecordable[]>;
  obtener(citaId: string): Promise<CitaRecordable | null>;
  marcar(citaId: string): Promise<void>;
  /** La cita se cancelo: ya no se recuerda. */
  cancelar(citaId: string): Promise<void>;
  /** La cita cambio de fecha: se vuelve a recordar para la nueva. */
  reprogramar(c: CitaRecordable): Promise<void>;
}

export interface PlantillaRepository {
  /** Ultima version guardada o null (se usa la de fabrica). */
  vigente(tipo: NotificacionTipo, canal: Canal): Promise<Plantilla | null>;
  /** Guarda la version `p.version`; lanza ReglaNotificacionError VERSION_CONFLICTO si ya existe. */
  guardar(p: Plantilla): Promise<void>;
}

export interface PreferenciasPersonalRepository {
  obtener(usuarioId: string): Promise<PreferenciasPersonal | null>;
  guardar(p: PreferenciasPersonal): Promise<void>;
}

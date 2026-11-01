import type { Canal, CitaRecordable, Contacto, Notificacion, NotificacionTipo, RespuestaSaga } from '../domain/notificacion.js';
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

export interface NotificacionRepository {
  obtener(citaId: string, tipo: NotificacionTipo): Promise<Notificacion | null>;
  /** Escribe la notificacion (condicion de version) y, si hay respuesta, la encola en el outbox: todo en una transaccion. */
  guardar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void>;
  /** Notificaciones PENDIENTES cuyo proximo intento ya llego. */
  vencidas(now: number, limite?: number): Promise<{ citaId: string; tipo: NotificacionTipo }[]>;
  porCita(citaId: string): Promise<Notificacion[]>;
}

export interface ContactoRepository {
  obtener(pacienteId: string): Promise<Contacto | null>;
  guardar(c: Contacto): Promise<void>;
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
}

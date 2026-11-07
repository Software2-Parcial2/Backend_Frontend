import { NoEncontradoError, type CitaAggregate, type CitaEstado, type Horario } from '../../domain/cita.js';
import type { CitaRepository } from '../saga/cita-repository.js';
import { derivarPasos } from '../saga/historial.js';
import type { AgendaRepository, PerfilMedico, PerfilPaciente } from './agenda-repository.js';
import { horaLocal, limitesDelDia, OFFSET_POR_DEFECTO_MIN } from './horarios.js';

export type EstadoCelda = 'LIBRE' | 'RESERVA_TEMPORAL' | 'CONFIRMADA' | 'EN_SALA' | 'ATENDIDA' | 'NO_ASISTIO' | 'BLOQUEADO';

export interface Celda {
  hora: string;
  fechaHora: string;
  estado: EstadoCelda;
  citaId?: string;
  paciente?: { id: string; nombre: string | null; numeroHistoria: string | null };
  motivo?: string;
  reservaExpiraEn?: string;
}

const CANCELADAS: CitaEstado[] = ['CANCELADA', 'ANULADA', 'CANCELADA_USUARIO'];

const aCelda = (e: CitaEstado): EstadoCelda =>
  e === 'EN_SALA' || e === 'ATENDIDA' || e === 'NO_ASISTIO' || e === 'CONFIRMADA' ? e : 'RESERVA_TEMPORAL';

/**
 * Une los horarios publicados de un medico con sus citas del dia en celdas ordenadas. Una cita manda sobre su horario; las canceladas
 * no aparecen (su horario volvio a LIBRE). Una cita sin horario publicado (modo abierto) tambien se muestra.
 */
export function construirCeldas(horarios: Horario[], citas: CitaAggregate[], nombres: Map<string, PerfilPaciente>, offsetMin = OFFSET_POR_DEFECTO_MIN): Celda[] {
  const porHora = new Map<string, Celda>();
  for (const h of horarios) {
    const estado: EstadoCelda = h.estado === 'LIBRE' ? 'LIBRE' : h.estado === 'BLOQUEADO' ? 'BLOQUEADO' : h.estado === 'RESERVADO' ? 'RESERVA_TEMPORAL' : 'CONFIRMADA';
    porHora.set(h.fechaHora, {
      hora: horaLocal(h.fechaHora, offsetMin),
      fechaHora: h.fechaHora,
      estado,
      ...(h.citaId ? { citaId: h.citaId } : {}),
      ...(h.motivo ? { motivo: h.motivo } : {}),
      ...(h.reservaExpiraEn ? { reservaExpiraEn: new Date(h.reservaExpiraEn).toISOString() } : {}),
    });
  }
  for (const c of citas) {
    if (CANCELADAS.includes(c.estado)) continue;
    const p = nombres.get(c.input.pacienteId);
    const reserva = porHora.get(c.input.fechaHora)?.reservaExpiraEn; // el vencimiento de la reserva vive en el horario, no en la cita
    porHora.set(c.input.fechaHora, {
      hora: horaLocal(c.input.fechaHora, offsetMin),
      fechaHora: c.input.fechaHora,
      estado: aCelda(c.estado),
      citaId: c.citaId,
      paciente: { id: c.input.pacienteId, nombre: p?.nombre ?? null, numeroHistoria: p?.numeroHistoria || null },
      ...(reserva ? { reservaExpiraEn: reserva } : {}),
    });
  }
  return [...porHora.values()].sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
}

export interface FiltroAgenda {
  medicoId?: string;
  especialidad?: string;
  consultorio?: string;
}

export interface FilaResumen {
  clave: string;
  total: number;
  confirmadas: number;
  canceladas: number;
  atendidas: number;
  noAsistio: number;
}

export type AgruparPor = 'especialidad' | 'medico' | 'estado' | 'mes';

export interface AgendaDeps {
  agenda: AgendaRepository;
  citas: CitaRepository;
  offsetMin?: number;
}

/** Lecturas de agenda: dia de la clinica, mi agenda, resumen agregado e historial de una cita. */
export class AgendaService {
  private readonly offset: number;

  constructor(private readonly d: AgendaDeps) {
    this.offset = d.offsetMin ?? OFFSET_POR_DEFECTO_MIN;
  }

  /** Agenda de un dia (fecha AAAA-MM-DD, hora local) de todos los medicos o de los que cumplan el filtro. */
  async agendaDelDia(fecha: string, f: FiltroAgenda = {}) {
    const rango = limitesDelDia(fecha, this.offset);
    let medicos: PerfilMedico[];
    if (f.medicoId) {
      const m = await this.d.agenda.perfilMedico(f.medicoId);
      medicos = m ? [m] : [];
    } else {
      medicos = (await this.d.agenda.listarMedicos()).filter((m) => m.activo);
    }
    medicos = medicos.filter((m) => (!f.especialidad || m.especialidad === f.especialidad) && (!f.consultorio || m.consultorio === f.consultorio));

    const datos = await Promise.all(
      medicos.map(async (m) => ({
        medico: m,
        horarios: await this.horariosDelDia(m.medicoId, rango.desde, rango.hasta),
        citas: await this.citasDelDia(m.medicoId, rango.desdeMs, rango.hastaMs),
      })),
    );
    const nombres = await this.d.agenda.perfilesPaciente(datos.flatMap((x) => x.citas.map((c) => c.input.pacienteId)));
    return {
      fecha,
      zonaHoraria: 'America/La_Paz',
      medicos: datos.map(({ medico, horarios, citas }) => {
        const celdas = construirCeldas(horarios, citas, nombres, this.offset);
        const con = (e: EstadoCelda) => celdas.filter((c) => c.estado === e).length;
        return {
          medicoId: medico.medicoId,
          nombre: medico.nombre,
          especialidad: medico.especialidad,
          especialidadNombre: medico.especialidadNombre,
          consultorio: medico.consultorio ?? null,
          celdas,
          resumen: {
            citas: celdas.filter((c) => c.citaId && c.estado !== 'RESERVA_TEMPORAL').length,
            atendidas: con('ATENDIDA'),
            enSala: con('EN_SALA'),
            libres: con('LIBRE'),
            reservasTemporales: con('RESERVA_TEMPORAL'),
          },
        };
      }),
    };
  }

  /** Agenda del medico autenticado: por el claim `medico_id` o, si no lo trae, por su usuario de Keycloak. */
  async miAgenda(user: { medicoId?: string; username?: string }, fecha: string) {
    let medicoId = user.medicoId;
    if (!medicoId && user.username) {
      medicoId = (await this.d.agenda.listarMedicos()).find((m) => m.usuarioKeycloak === user.username)?.medicoId;
    }
    if (!medicoId) throw new NoEncontradoError('MEDICO_NO_VINCULADO', 'Su usuario no esta vinculado a un medico');
    const r = await this.agendaDelDia(fecha, { medicoId });
    if (r.medicos.length === 0) throw new NoEncontradoError('MEDICO_NO_ENCONTRADO', 'El medico no esta en el catalogo de la agenda');
    return { fecha: r.fecha, zonaHoraria: r.zonaHoraria, ...r.medicos[0] };
  }

  /**
   * Conteo de citas por especialidad, medico, estado o mes entre dos fechas (por la fecha de la CITA). Lee el indice global una sola
   * vez, hasta `maximo` citas; si hay mas, `truncado` es true.
   */
  async resumen(desde: string, hasta: string, agruparPor: AgruparPor, maximo = 5000) {
    const d = Date.parse(desde);
    const h = Date.parse(hasta);
    const nombresMedicos = agruparPor === 'medico' ? new Map((await this.d.agenda.listarMedicos()).map((m) => [m.medicoId, m.nombre])) : new Map<string, string>();
    const filas = new Map<string, FilaResumen>();
    let leidas = 0;
    let cursor: string | undefined;
    let truncado = false;
    let total = 0;
    while (true) {
      const p = await this.d.citas.buscar({}, 100, cursor);
      for (const c of p.items) {
        leidas++;
        const t = Date.parse(c.input.fechaHora);
        if (t < d || t > h) continue;
        total++;
        const clave =
          agruparPor === 'especialidad' ? c.input.especialidad : agruparPor === 'medico' ? (nombresMedicos.get(c.input.medicoId) ?? c.input.medicoId) : agruparPor === 'estado' ? c.estado : c.input.fechaHora.slice(0, 7);
        const fila = filas.get(clave) ?? { clave, total: 0, confirmadas: 0, canceladas: 0, atendidas: 0, noAsistio: 0 };
        fila.total++;
        if (['CONFIRMADA', 'EN_SALA', 'ATENDIDA', 'NO_ASISTIO'].includes(c.estado)) fila.confirmadas++;
        if (CANCELADAS.includes(c.estado)) fila.canceladas++;
        if (c.estado === 'ATENDIDA') fila.atendidas++;
        if (c.estado === 'NO_ASISTIO') fila.noAsistio++;
        filas.set(clave, fila);
      }
      if (!p.siguiente) break;
      if (leidas >= maximo) {
        truncado = true;
        break;
      }
      cursor = p.siguiente;
    }
    return { desde, hasta, agruparPor, total, grupos: [...filas.values()].sort((a, b) => b.total - a.total || a.clave.localeCompare(b.clave)), truncado };
  }

  /** Estados, pasos de la SAGA y compensacion de una cita (pantalla de detalle). */
  async historial(citaId: string, citaYaCargada?: CitaAggregate) {
    const c = citaYaCargada ?? (await this.d.citas.cargar(citaId));
    if (!c) throw new NoEncontradoError('CITA_NO_ENCONTRADA', `No existe la cita ${citaId}`);
    const { pasos, compensacion } = derivarPasos(c);
    return {
      citaId: c.citaId,
      estado: c.estado,
      sagaId: c.saga.sagaId,
      saga: { estado: c.saga.estado, paso: c.saga.paso, anulacionCobro: c.saga.anulacionCobro ?? null },
      pasos,
      compensacion,
      cancelacion: c.cancelacion ? { motivo: c.cancelacion.motivo, por: c.cancelacion.por, en: new Date(c.cancelacion.at).toISOString() } : null,
      reprogramaciones: (c.reprogramaciones ?? []).map((r) => ({ desde: r.desde, hacia: r.hacia, por: r.por, en: new Date(r.at).toISOString() })),
      asistencia: c.asistencia ?? null,
      transiciones: c.saga.historial.map((h) => ({ en: new Date(h.at).toISOString(), paso: h.paso, evento: h.evento, detalle: h.detalle ?? null })),
    };
  }

  private async horariosDelDia(medicoId: string, desde: string, hasta: string): Promise<Horario[]> {
    const res: Horario[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const p = await this.d.citas.disponibilidad({ medicoId, desde, hasta }, 200, cursor);
      res.push(...p.items);
      if (!p.siguiente) break;
      cursor = p.siguiente;
    }
    return res;
  }

  private async citasDelDia(medicoId: string, desde: number, hasta: number): Promise<CitaAggregate[]> {
    const res: CitaAggregate[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const p = await this.d.citas.buscar({ medicoId, desde, hasta }, 100, cursor);
      res.push(...p.items);
      if (!p.siguiente) break;
      cursor = p.siguiente;
    }
    return res;
  }
}

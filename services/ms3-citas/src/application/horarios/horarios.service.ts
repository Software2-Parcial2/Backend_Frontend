import { TransicionInvalidaError, type CitaAggregate } from '../../domain/cita.js';
import type { CitaRepository } from '../saga/cita-repository.js';
import type { AgendaRepository } from './agenda-repository.js';
import { bloqueoQueCubre, generarSlots, OFFSET_POR_DEFECTO_MIN, plantillaVacia, validarBloqueo, validarPlantilla, type Bloqueo, type DiaPlantilla, type Plantilla } from './horarios.js';

export interface HorariosDeps {
  agenda: AgendaRepository;
  citas: CitaRepository;
  newId: () => string;
  now?: () => number;
  offsetMin?: number;
}

/** Estados en los que una cita todavia ocupa su horario (las canceladas, atendidas y no asistidas ya no se reprograman). */
const ACTIVAS: CitaAggregate['estado'][] = ['RESERVADA', 'COBRO_PROVISIONAL', 'CONFIRMADA', 'EN_SALA'];

const TTL_HORARIO_SEG = 7 * 86400; // un horario se limpia solo una semana despues de su hora

/** Horario semanal de un medico, publicacion de horarios y bloqueos (ausencias). */
export class HorariosService {
  private readonly now: () => number;
  private readonly offset: number;

  constructor(private readonly d: HorariosDeps) {
    this.now = d.now ?? Date.now;
    this.offset = d.offsetMin ?? OFFSET_POR_DEFECTO_MIN;
  }

  async plantilla(medicoId: string): Promise<Plantilla> {
    return (await this.d.agenda.plantilla(medicoId)) ?? plantillaVacia(medicoId);
  }

  async guardarPlantilla(medicoId: string, duracionMin: number, dias: DiaPlantilla[]): Promise<Plantilla> {
    const previa = await this.d.agenda.plantilla(medicoId);
    const p = validarPlantilla(medicoId, duracionMin, dias, this.now(), previa?.version ?? 0);
    await this.d.agenda.guardarPlantilla(p);
    return p;
  }

  /**
   * Publica los horarios de la plantilla entre dos fechas locales. Es idempotente: los que ya existen no se tocan. Los que caen
   * dentro de un bloqueo se publican BLOQUEADOS. Cuando HORARIOS_ESTRICTOS=true solo estos horarios se pueden reservar.
   */
  async generar(medicoId: string, desde: string, hasta: string): Promise<{ creados: number; existentes: number; bloqueados: number; total: number }> {
    const plantilla = await this.d.agenda.plantilla(medicoId);
    if (!plantilla || !plantilla.dias.some((x) => x.atiende)) {
      throw new TransicionInvalidaError('PLANTILLA_VACIA', 'El medico no tiene un horario semanal definido');
    }
    const slots = generarSlots(plantilla, desde, hasta, this.offset);
    const bloqueos = await this.d.agenda.bloqueos(medicoId);
    let bloqueados = 0;
    const horarios = slots.map((fechaHora) => {
      const b = bloqueoQueCubre(fechaHora, bloqueos);
      if (b) bloqueados++;
      return { fechaHora, estado: b ? ('BLOQUEADO' as const) : ('LIBRE' as const), ...(b ? { motivo: b.motivo } : {}) };
    });
    const r = await this.d.agenda.publicarHorarios(medicoId, horarios, TTL_HORARIO_SEG);
    return { ...r, bloqueados, total: slots.length };
  }

  async bloqueos(medicoId: string): Promise<Bloqueo[]> {
    return (await this.d.agenda.bloqueos(medicoId)).sort((a, b) => a.desde.localeCompare(b.desde));
  }

  /**
   * Crea un bloqueo: bloquea los horarios libres del rango y devuelve las citas que ya estaban dentro (hay que reprogramarlas:
   * las citas existentes NO se cancelan solas).
   */
  async crearBloqueo(medicoId: string, desde: string, hasta: string, motivo: string, actor: string) {
    const v = validarBloqueo(desde, hasta, motivo, this.now());
    const bloqueo: Bloqueo = { id: this.d.newId(), medicoId, ...v, creadoPor: actor, creadoEn: this.now() };
    await this.d.agenda.guardarBloqueo(bloqueo);
    const horariosBloqueados = await this.d.agenda.bloquearHorarios(medicoId, v.desde, v.hasta, v.motivo);
    const citasAfectadas = (await this.citasEnRango(medicoId, v.desde, v.hasta)).map((c) => ({
      citaId: c.citaId,
      pacienteId: c.input.pacienteId,
      fechaHora: c.input.fechaHora,
      estado: c.estado,
    }));
    return { bloqueo, horariosBloqueados, citasAfectadas };
  }

  /** Quita un bloqueo y libera los horarios que ya no cubre ningun otro bloqueo. null si no existe. */
  async eliminarBloqueo(medicoId: string, id: string): Promise<{ horariosLiberados: number } | null> {
    const eliminado = await this.d.agenda.eliminarBloqueo(medicoId, id);
    if (!eliminado) return null;
    const restantes = await this.d.agenda.bloqueos(medicoId);
    const horariosLiberados = await this.d.agenda.desbloquearHorarios(medicoId, eliminado.desde, eliminado.hasta, (f) => !!bloqueoQueCubre(f, restantes));
    return { horariosLiberados };
  }

  /** Citas activas de un medico en un rango (todas las paginas del indice por medico/fecha). */
  async citasEnRango(medicoId: string, desde: string, hasta: string): Promise<CitaAggregate[]> {
    const res: CitaAggregate[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const p = await this.d.citas.buscar({ medicoId, desde: Date.parse(desde), hasta: Date.parse(hasta) }, 100, cursor);
      res.push(...p.items.filter((c) => ACTIVAS.includes(c.estado)));
      if (!p.siguiente) break;
      cursor = p.siguiente;
    }
    return res;
  }
}

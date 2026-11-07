import type { Bloqueo, Plantilla } from './horarios.js';

/** Proyeccion local del paciente (la alimenta paciente.creado / paciente.actualizado): solo lo que muestra la agenda. */
export interface PerfilPaciente {
  pacienteId: string;
  nombre: string;
  numeroHistoria: string;
}

/** Proyeccion local del medico (la alimenta medico.creado / medico.actualizado). */
export interface PerfilMedico {
  medicoId: string;
  nombre: string;
  /** Codigo de la especialidad (clave natural). */
  especialidad: string;
  especialidadNombre: string;
  consultorio?: string;
  activo: boolean;
  usuarioKeycloak?: string;
}

export interface HorarioPublicado {
  fechaHora: string;
  estado: 'LIBRE' | 'BLOQUEADO';
  motivo?: string;
}

/**
 * Puerto de la agenda: proyecciones de pacientes y medicos, plantilla semanal, bloqueos y publicacion de horarios.
 * Las proyecciones se escriben con la marca de tiempo del evento: un evento viejo que llega tarde no pisa a uno nuevo.
 */
export interface AgendaRepository {
  guardarPerfilPaciente(p: PerfilPaciente, ocurridoEn: number): Promise<void>;
  guardarPerfilMedico(m: PerfilMedico, ocurridoEn: number): Promise<void>;
  perfilesPaciente(ids: string[]): Promise<Map<string, PerfilPaciente>>;
  perfilMedico(medicoId: string): Promise<PerfilMedico | null>;
  listarMedicos(): Promise<PerfilMedico[]>;

  plantilla(medicoId: string): Promise<Plantilla | null>;
  guardarPlantilla(p: Plantilla): Promise<void>;

  bloqueos(medicoId: string): Promise<Bloqueo[]>;
  guardarBloqueo(b: Bloqueo): Promise<void>;
  eliminarBloqueo(medicoId: string, id: string): Promise<Bloqueo | null>;

  /** Crea los horarios que no existan (los existentes no se tocan). Devuelve cuantos se crearon y cuantos ya estaban. */
  publicarHorarios(medicoId: string, horarios: HorarioPublicado[], ttlSegundos: number): Promise<{ creados: number; existentes: number }>;
  /** LIBRE -> BLOQUEADO dentro del rango (los reservados o con cita no se tocan). Devuelve cuantos cambio. */
  bloquearHorarios(medicoId: string, desde: string, hasta: string, motivo: string): Promise<number>;
  /** BLOQUEADO -> LIBRE dentro del rango, salvo los que `siguenBloqueados` indique. Devuelve cuantos cambio. */
  desbloquearHorarios(medicoId: string, desde: string, hasta: string, siguenBloqueados: (fechaHora: string) => boolean): Promise<number>;
}

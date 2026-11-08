import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type { HistoriaClinica } from './tipos';

/** Cambios de una consulta que no se pudieron guardar por un 409, para compararlos y reaplicarlos. */
export interface BorradorEnConflicto { consultaId: string; motivo: string; diagnostico: string; tratamiento: string; indicaciones: string; vitales: Record<string, string>; receta: { medicamento: string; dosis: string; frecuencia: string; duracion: string }[] }

@Injectable({ providedIn: 'root' })
export class HistoriaService {
  private readonly api = inject(ApiService).cliente;
  /** Lo que el medico habia escrito cuando otro profesional modifico la consulta. */
  readonly enConflicto = signal<BorradorEnConflicto | null>(null);

  porPaciente(pacienteId: string, signal?: AbortSignal): Promise<HistoriaClinica> {
    return this.api.get<HistoriaClinica>(`/api/historias/paciente/${pacienteId}`, { signal });
  }
  porId(id: string, signal?: AbortSignal): Promise<HistoriaClinica> {
    return this.api.get<HistoriaClinica>(`/api/historias/${id}`, { signal });
  }
}

export const VITALES = [
  { id: 'pa', l: 'Presión (mmHg)' }, { id: 'fc', l: 'Frecuencia cardíaca' }, { id: 'fr', l: 'Frecuencia resp.' }, { id: 'te', l: 'Temperatura' }, { id: 'sp', l: 'Saturación' },
] as const;

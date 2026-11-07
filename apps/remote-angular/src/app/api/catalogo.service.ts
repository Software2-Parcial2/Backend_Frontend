import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import type { Especialidad, Medico } from './tipos';

/** Catalogo de especialidades y medicos (MS2), leido una vez y compartido: las pantallas muestran nombres, no ids. */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly api = inject(ApiService).cliente;
  private _medicos?: Promise<Map<string, Medico>>;
  private _especialidades?: Promise<Especialidad[]>;

  /** Medicos por id. Si falla, la proxima llamada reintenta. */
  medicos(): Promise<Map<string, Medico>> {
    this._medicos ??= this.api
      .todas<Medico>('/api/medicos', { limite: 100 })
      .then((r) => new Map(r.items.map((m) => [m.id, m])))
      .catch((e) => {
        this._medicos = undefined;
        throw e;
      });
    return this._medicos;
  }

  especialidades(): Promise<Especialidad[]> {
    this._especialidades ??= this.api
      .todas<Especialidad>('/api/especialidades', { limite: 100 })
      .then((r) => r.items.filter((e) => e.activa))
      .catch((e) => {
        this._especialidades = undefined;
        throw e;
      });
    return this._especialidades;
  }

  async nombreMedico(id: string): Promise<string> {
    return (await this.medicos().catch(() => new Map<string, Medico>())).get(id)?.nombre ?? 'Médico sin nombre';
  }
}

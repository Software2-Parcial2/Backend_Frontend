import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { fechaLocal, formatoHora } from '@sigec/api-client';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { etiquetaDia, nombreEspecialidad, proximosDias, rangoDelDia, type Cita, type Disponibilidad, type Paciente } from '../api/tipos';

@Component({
  selector: 'app-cita-reprogramar',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-rep">
  <div class="card">
    @if (cita.error(); as e) { <sigec-error [error]="e" (reintentar)="cita.recargar()" /> }
    @else if (cita.datos(); as c) {
    <div><h2 id="t-rep" style="font-size:20px;font-weight:650">Reprogramar cita</h2><p class="ink2" style="margin-top:4px">{{ paciente()?.nombre ?? 'Paciente' }} · {{ esp(c.especialidad) }} · actualmente {{ c.fechaHora | fecha }}, {{ c.fechaHora | hora }}</p></div>
    <div class="field"><label for="d">Nueva fecha</label>
      <select class="in" id="d" [value]="dia()" (change)="dia.set($any($event.target).value); hora.set('')">@for (d of dias; track d) {<option [value]="d">{{ et(d).s }} {{ et(d).n }}</option>}</select></div>
    @if (slots.error(); as e) { <sigec-error [error]="e" (reintentar)="slots.recargar()" /> }
    @else if (slots.cargando() || !slots.datos()) { <sigec-cargando [filas]="1" etiqueta="Consultando horarios…" /> }
    @else if (libres().length === 0) { <p class="muted" data-testid="vacio">No hay horarios libres este día.</p> }
    @else { <div class="fx wrap">@for (h of libres(); track h.fechaHora) {<button type="button" class="slot" data-testid="slot" [class.on]="hora() === h.fechaHora" (click)="hora.set(h.fechaHora)">{{ hh(h.fechaHora) }}</button>}</div> }
    <div class="sm muted">Se libera el horario anterior, se conserva el cargo y se envía un aviso al paciente.</div>
    @if (rep.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
    <div class="fx" style="justify-content:flex-end"><a class="btn" [attr.href]="'#/cita?id=' + c.citaId">Volver</a><button type="button" class="btn pri" [disabled]="!hora() || rep.enCurso()" (click)="confirmar()">{{ rep.enCurso() ? 'Reprogramando…' : 'Confirmar nuevo horario' }}</button></div>
    } @else { <sigec-cargando [filas]="2" /> }
  </div>
</div>`,
})
export class CitaReprogramar {
  private readonly router = inject(Router);
  readonly id = parametro('id');
  readonly dias = proximosDias(14);
  readonly dia = signal(fechaLocal());
  readonly hora = signal('');
  readonly paciente = signal<Paciente | undefined>(undefined);
  readonly cita = recurso<Cita>((api, signal) => (this.id() ? api.get<Cita>(`/api/citas/${this.id()}`, { signal }).then(async (c) => {
    this.paciente.set(await api.get<Paciente>(`/api/pacientes/${c.pacienteId}`).catch(() => undefined));
    return c;
  }) : null));
  readonly slots = recurso<Disponibilidad[]>((api, signal) => {
    const c = this.cita.datos();
    if (!c) return null;
    return api.pagina<Disponibilidad>('/api/citas/disponibilidad', { query: { medicoId: c.medicoId, ...rangoDelDia(this.dia()) }, limite: 100, signal }).then((p) => p.items);
  });
  readonly libres = computed(() => (this.slots.datos() ?? []).filter((h) => h.estado === 'LIBRE'));
  readonly rep = accion((api, fechaHora: string) => api.post(`/api/citas/${this.id()}/reprogramar`, { fechaHora }));
  et = etiquetaDia;
  esp = nombreEspecialidad;
  hh = (iso: string) => formatoHora(iso);
  async confirmar() {
    const id = this.id();
    await this.rep.ejecutar(this.hora());
    if (!this.rep.error() && id) await this.router.navigate(['/cita'], { queryParams: { id } });
    else this.slots.recargar();
  }
}

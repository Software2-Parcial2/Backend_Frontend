import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { fechaLocal, formatoDiaLargo, sumarDias } from '@sigec/api-client';
import { CatalogoService } from '../api/catalogo.service';
import { Cargando, ErrorApi } from '../api/estado';
import { recurso } from '../api/recurso';
import type { AgendaDia, Celda, Especialidad } from '../api/tipos';

@Component({
  selector: 'app-agenda',
  imports: [Cargando, ErrorApi],
  encapsulation: ViewEncapsulation.None,
  styles: `
    .sigec .cl{border:1px solid var(--line2);border-radius:6px;padding:6px 8px;font-size:12.5px;min-height:54px;line-height:1.3;display:block;color:inherit;text-decoration:none}
    .sigec .cl.o{background:var(--pri-t);border-color:#BFDDE1}
    .sigec .cl.w{background:var(--warn-t);border-color:#F0D3A5}
    .sigec .cl.f{border:1px dashed var(--bd);color:var(--ink3)}
    .sigec .cl.x{background:var(--line2);color:var(--ink3)}
    .sigec .cl.v{border-color:transparent}
    .sigec .hd{font-weight:650;font-size:13px;padding:4px 2px}
    .sigec .hr2{font-family:var(--font-mono);font-size:12px;color:var(--ink3);padding-top:6px}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Agenda general</h1><p class="sub" style="text-transform:capitalize">{{ titulo() }}</p></div><span class="sp"></span>
    <div class="fx"><button type="button" class="btn" aria-label="Día anterior" (click)="mover(-1)">‹</button><button type="button" class="btn" (click)="fecha.set(hoy)">Hoy</button><button type="button" class="btn" aria-label="Día siguiente" (click)="mover(1)">›</button></div>
    <a class="btn pri" href="#/reservar">Reservar cita</a></div>
  <div class="fx wrap">
    <select class="in" style="width:220px" aria-label="Especialidad" [value]="especialidad()" (change)="especialidad.set($any($event.target).value)">
      <option value="">Todas las especialidades</option>
      @for (e of especialidades(); track e.id) { <option [value]="e.codigo">{{ e.nombre }}</option> }
    </select>
    <input class="in" style="width:180px" aria-label="Consultorio" placeholder="Consultorio (opcional)" [value]="consultorio()" (change)="consultorio.set($any($event.target).value.trim())">
    <span class="sp"></span><span class="chip pri">Confirmada</span><span class="chip warn">Reserva temporal</span><span class="chip">Bloqueado</span>
  </div>
  @if (agenda.error(); as e) { <sigec-error [error]="e" (reintentar)="agenda.recargar()" /> }
  @else if (agenda.cargando() && !agenda.datos()) { <sigec-cargando [filas]="5" etiqueta="Cargando la agenda…" /> }
  @else if (agenda.datos(); as a) {
    @if (a.medicos.length === 0) {
      <div class="card col" style="align-items:center;padding:40px;gap:8px" data-testid="vacio"><div class="b">No hay médicos para este filtro</div><div class="ink2">Pruebe con otra especialidad o consultorio.</div></div>
    } @else if (horas().length === 0) {
      <div class="card col" style="align-items:center;padding:40px;gap:8px" data-testid="vacio"><div class="b">No hay horarios publicados ni citas este día</div><div class="ink2">Un administrador puede publicarlos desde «Horarios médicos».</div></div>
    } @else {
    <div class="card scroll">
      <div [style.grid-template-columns]="'64px repeat(' + a.medicos.length + ',minmax(150px,1fr))'" style="display:grid;gap:6px;min-width:760px" data-testid="rejilla">
        <div></div>
        @for (m of a.medicos; track m.medicoId) {<div class="hd">{{ m.nombre }}<div class="sm muted" style="font-weight:400">{{ m.especialidadNombre }}{{ m.consultorio ? ' · Cons. ' + m.consultorio : '' }}</div></div>}
        @for (h of horas(); track h) {
          <div class="hr2">{{ h }}</div>
          @for (m of a.medicos; track m.medicoId) {
            @let c = celda(m.celdas, h);
            @if (!c) { <div class="cl v"></div> }
            @else if (c.estado === 'LIBRE') { <a class="cl f" [attr.href]="'#/reservar?medico=' + m.medicoId + '&hora=' + c.fechaHora" data-testid="celda-libre">Libre</a> }
            @else if (c.estado === 'BLOQUEADO') { <div class="cl x"><b>Bloqueado</b><br>{{ c.motivo }}</div> }
            @else if (c.estado === 'RESERVA_TEMPORAL') { <a class="cl w" [attr.href]="c.citaId ? '#/cita?id=' + c.citaId : null"><b>{{ c.paciente?.nombre ?? 'Reserva' }}</b><br>Reserva temporal</a> }
            @else { <a class="cl o" [attr.href]="'#/cita?id=' + c.citaId" data-testid="celda-cita"><b>{{ c.paciente?.nombre ?? 'Paciente' }}</b><br>{{ etiqueta(c) }}</a> }
          }
        }
      </div>
    </div>
    }
  }
</div>`,
})
export class Agenda {
  private readonly catalogo = inject(CatalogoService);
  readonly hoy = fechaLocal();
  readonly fecha = signal(this.hoy);
  readonly especialidad = signal('');
  readonly consultorio = signal('');
  readonly especialidades = signal<Especialidad[]>([]);
  readonly agenda = recurso<AgendaDia>((api, signal) =>
    api.get<AgendaDia>('/api/citas/agenda', { query: { fecha: this.fecha(), especialidad: this.especialidad() || undefined, consultorio: this.consultorio() || undefined }, signal }));
  readonly titulo = computed(() => formatoDiaLargo(`${this.fecha()}T12:00:00-04:00`));
  /** Todas las horas con alguna celda, ordenadas (una fila por hora, una columna por medico). */
  readonly horas = computed(() => [...new Set((this.agenda.datos()?.medicos ?? []).flatMap((m) => m.celdas.map((c) => c.hora)))].sort());

  constructor() {
    void this.catalogo.especialidades().then((e) => this.especialidades.set(e)).catch(() => undefined);
  }
  mover(d: number) { this.fecha.update((f) => sumarDias(f, d)); }
  celda = (celdas: Celda[], hora: string) => celdas.find((c) => c.hora === hora);
  etiqueta = (c: Celda) => ({ CONFIRMADA: 'Confirmada', EN_SALA: 'En sala', ATENDIDA: 'Atendida', NO_ASISTIO: 'No asistió' } as Record<string, string>)[c.estado] ?? c.estado;
}

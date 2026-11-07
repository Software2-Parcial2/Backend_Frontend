import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { fechaLocal, iniciales, sumarDias } from '@sigec/api-client';
import { CatalogoService } from '../api/catalogo.service';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, lista, recurso } from '../api/recurso';
import type { Bloqueo, DiaPlantilla, Medico, PlantillaHorario } from '../api/tipos';
import { ContextStore } from '../context';

const NOMBRE_DIA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DURACIONES = [10, 15, 20, 30, 45, 60];

@Component({
  selector: 'app-horarios',
  imports: [FormsModule, Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Horarios médicos</h1><p class="sub">Disponibilidad semanal de cada especialista</p></div></div>
  @if (!puedeEditar) { <div class="banner"><div><b>Solo lectura</b><span>Los horarios y bloqueos los administra el administrador.</span></div></div> }
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:1 1 280px;max-width:320px">
      <div class="ch"><div class="ct">Médicos</div></div>
      <div style="padding:0 8px 12px;display:flex;flex-direction:column;gap:2px">
        @for (m of medicos(); track m.id) {
          <button type="button" class="nav" data-testid="medico" [style.background]="sel() === m.id ? 'var(--pri-t)' : ''" [style.color]="sel() === m.id ? 'var(--pri-d)' : 'var(--ink)'" style="min-height:52px;box-shadow:none" (click)="sel.set(m.id)">
            <span class="av" aria-hidden="true">{{ ini(m.nombre) }}</span><span><span class="b" style="display:block">{{ m.nombre }}</span><span class="sm" style="color:var(--ink3)">{{ m.especialidad.nombre }}</span></span>
          </button>
        } @empty { <p class="muted" style="padding:12px">Sin médicos en el catálogo.</p> }
      </div>
    </div>
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      @if (horario.error(); as e) { <sigec-error [error]="e" (reintentar)="horario.recargar()" /> }
      @else if (sel() && horario.cargando()) { <sigec-cargando [filas]="4" etiqueta="Cargando el horario…" /> }
      @else if (sel()) {
      <div class="card flush">
        <div class="ch"><div class="ct">Horario semanal · {{ medicoSel()?.nombre }}</div><span class="sp"></span>
          <div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="dur">Duración de la consulta</label><select class="in" id="dur" style="width:110px" [disabled]="!puedeEditar" [ngModel]="duracion()" (ngModelChange)="duracion.set(+$event)">@for (d of duraciones; track d) {<option [ngValue]="d">{{ d }} min</option>}</select></div></div>
        <div class="scroll">
          <table class="tbl">
            <thead><tr><th>Día</th><th>Atiende</th><th>Desde</th><th>Hasta</th><th>Consultorio</th></tr></thead>
            <tbody>
              @for (d of dias(); track d.dia; let i = $index) {
                <tr data-testid="dia">
                  <td class="b">{{ nombreDia(d.dia) }}</td>
                  <td><button type="button" class="sw" [class.on]="d.atiende" role="switch" [attr.aria-checked]="d.atiende" [disabled]="!puedeEditar" [attr.aria-label]="'Atiende el ' + nombreDia(d.dia)" (click)="alternar(i)"></button></td>
                  @if (d.atiende) {
                    <td><input class="in" style="width:100px" type="time" [disabled]="!puedeEditar" [value]="d.desde" [attr.aria-label]="nombreDia(d.dia) + ' desde'" (change)="cambiar(i, 'desde', $any($event.target).value)"></td>
                    <td><input class="in" style="width:100px" type="time" [disabled]="!puedeEditar" [value]="d.hasta" [attr.aria-label]="nombreDia(d.dia) + ' hasta'" (change)="cambiar(i, 'hasta', $any($event.target).value)"></td>
                    <td><input class="in" style="width:110px" type="text" [disabled]="!puedeEditar" [value]="d.consultorio ?? ''" [attr.aria-label]="nombreDia(d.dia) + ' consultorio'" (change)="cambiar(i, 'consultorio', $any($event.target).value)"></td>
                  } @else {<td class="muted">—</td><td class="muted">—</td><td class="muted">—</td>}
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Bloqueos y ausencias</div><span class="sp"></span>@if (puedeEditar) {<button type="button" class="btn s" (click)="agregando.set(!agregando())">{{ agregando() ? 'Cerrar' : 'Agregar bloqueo' }}</button>}</div>
        @if (agregando()) {
          <div class="fg" style="grid-template-columns:1fr 1fr 2fr auto;align-items:end;margin-bottom:12px">
            <div class="field"><label for="bd">Desde</label><input class="in" id="bd" type="datetime-local" [(ngModel)]="nb.desde"></div>
            <div class="field"><label for="bh">Hasta</label><input class="in" id="bh" type="datetime-local" [(ngModel)]="nb.hasta"></div>
            <div class="field"><label for="bm">Motivo</label><input class="in" id="bm" type="text" [(ngModel)]="nb.motivo"></div>
            <button type="button" class="btn pri" [disabled]="crearBloqueo.enCurso()" (click)="bloquear()">Bloquear</button>
          </div>
          @if (crearBloqueo.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        }
        @if (afectadas() > 0) { <div class="banner warn" role="status"><div><b>{{ afectadas() }} cita(s) caen dentro del bloqueo</b><span>Hay que reprogramarlas desde la agenda.</span></div></div> }
        @for (b of bloqueos.items(); track b.id) {
          <div class="li" data-testid="bloqueo"><span class="b" style="min-width:190px">{{ b.desde | fechaHora }} – {{ b.hasta | hora }}</span><span>{{ b.motivo }}</span><span class="sp"></span>@if (puedeEditar) {<button type="button" class="btn s gh" (click)="quitarBloqueo(b)">Quitar</button>}</div>
        } @empty { <p class="muted" data-testid="vacio" style="padding:6px 0">Sin bloqueos programados.</p> }
      </div>
      @if (puedeEditar) {
      <div class="fx wrap">
        <span class="sp"></span>
        @if (guardar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        @if (aviso()) { <span class="chip ok" role="status">{{ aviso() }}</span> }
        <button type="button" class="btn" [disabled]="generando.enCurso()" (click)="generar()" title="Publica los horarios libres de los próximos 14 días">{{ generando.enCurso() ? 'Publicando…' : 'Publicar horarios (14 días)' }}</button>
        <button type="button" class="btn" (click)="horario.recargar()">Descartar</button>
        <button type="button" class="btn pri" [disabled]="guardar.enCurso()" (click)="guardarHorario()">{{ guardar.enCurso() ? 'Guardando…' : 'Guardar horarios' }}</button>
      </div>
      }
      }
    </div>
  </div>
</div>`,
})
export class Horarios {
  private readonly catalogo = inject(CatalogoService);
  readonly puedeEditar = (inject(ContextStore).ctx()?.roles ?? []).includes('administrador');
  readonly duraciones = DURACIONES;
  readonly medicos = signal<Medico[]>([]);
  readonly sel = signal('');
  readonly medicoSel = computed(() => this.medicos().find((m) => m.id === this.sel()));
  readonly dias = signal<DiaPlantilla[]>([]);
  readonly duracion = signal(30);
  readonly aviso = signal('');
  readonly agregando = signal(false);
  readonly afectadas = signal(0);
  nb = { desde: '', hasta: '', motivo: '' };

  readonly horario = recurso<PlantillaHorario>((api, signal) =>
    this.sel() ? api.get<PlantillaHorario>(`/api/citas/medicos/${this.sel()}/horario`, { signal }).then((h) => {
      this.duracion.set(h.duracionMin);
      this.dias.set(Array.from({ length: 7 }, (_, i) => h.dias.find((d) => d.dia === i + 1) ?? { dia: i + 1, atiende: false }));
      this.aviso.set('');
      return h;
    }) : null);
  readonly bloqueos = lista<Bloqueo>(() => (this.sel() ? { ruta: `/api/citas/medicos/${this.sel()}/bloqueos` } : null), 50);

  constructor() {
    void this.catalogo.medicos().then((m) => {
      this.medicos.set([...m.values()].filter((x) => x.activo));
      if (!this.sel() && this.medicos()[0]) this.sel.set(this.medicos()[0]!.id);
    }).catch(() => undefined);
  }

  ini = iniciales;
  nombreDia = (d: number) => NOMBRE_DIA[d] ?? String(d);
  alternar(i: number) {
    this.dias.update((l) => l.map((d, n) => (n === i ? (d.atiende ? { dia: d.dia, atiende: false } : { ...d, atiende: true, desde: d.desde ?? '08:00', hasta: d.hasta ?? '12:00' }) : d)));
  }
  cambiar(i: number, campo: 'desde' | 'hasta' | 'consultorio', v: string) {
    this.dias.update((l) => l.map((d, n) => (n === i ? { ...d, [campo]: v } : d)));
  }

  readonly guardar = accion((api, cuerpo: { duracionMin: number; dias: DiaPlantilla[] }) => api.put<PlantillaHorario>(`/api/citas/medicos/${this.sel()}/horario`, cuerpo));
  async guardarHorario() {
    const r = await this.guardar.ejecutar({ duracionMin: this.duracion(), dias: this.dias().map((d) => (d.atiende ? { dia: d.dia, atiende: true, desde: d.desde, hasta: d.hasta, consultorio: d.consultorio || undefined } : { dia: d.dia, atiende: false })) });
    if (r) this.aviso.set('Horario guardado');
  }
  readonly generando = accion((api, desde: string, hasta: string) => api.post<{ creados?: number }>(`/api/citas/medicos/${this.sel()}/horario/generar`, { desde, hasta }));
  async generar() {
    const hoy = fechaLocal();
    const r = await this.generando.ejecutar(hoy, sumarDias(hoy, 13));
    if (r) this.aviso.set(`Horarios publicados${r.creados !== undefined ? ` (${r.creados})` : ''}`);
  }
  readonly crearBloqueo = accion((api, b: { desde: string; hasta: string; motivo: string }) =>
    api.post<{ bloqueo: Bloqueo; citasAfectadas: unknown[] }>(`/api/citas/medicos/${this.sel()}/bloqueos`, b));
  async bloquear() {
    if (!this.nb.desde || !this.nb.hasta || !this.nb.motivo.trim()) return;
    const r = await this.crearBloqueo.ejecutar({ desde: new Date(this.nb.desde).toISOString(), hasta: new Date(this.nb.hasta).toISOString(), motivo: this.nb.motivo.trim() });
    if (r) {
      this.afectadas.set(r.citasAfectadas?.length ?? 0);
      this.nb = { desde: '', hasta: '', motivo: '' };
      this.agregando.set(false);
      this.bloqueos.recargar();
    }
  }
  readonly borrarBloqueo = accion((api, id: string) => api.delete(`/api/citas/medicos/${this.sel()}/bloqueos/${id}`));
  async quitarBloqueo(b: Bloqueo) {
    await this.borrarBloqueo.ejecutar(b.id);
    this.bloqueos.recargar();
  }
}

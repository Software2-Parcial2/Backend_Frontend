import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { conRetraso, lista } from '../api/recurso';
import { estadoEstudio, type Imagen } from '../api/tipos';
import { ContextStore } from '../context';

const FILTROS = [{ t: 'Todos', v: '' }, { t: 'Por validar', v: 'PENDIENTE' }, { t: 'Validados', v: 'VALIDADO' }];

@Component({
  selector: 'app-estudios',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Estudios radiológicos</h1><p class="sub">Radiografías de tórax cargadas, con el análisis de apoyo de IA</p></div><span class="sp"></span>@if (puedeCargar()) {<a class="btn pri" href="#/estudios/cargar">Cargar radiografía</a>}</div>
  <div class="fx wrap">
    <label class="search"><span class="muted">Buscar</span><input type="text" placeholder="Paciente o N.° de historia" aria-label="Buscar estudio" [ngModel]="q()" (ngModelChange)="q.set($event)"></label>
    <div class="seg">@for (f of filtros; track f.v) {<button type="button" [class.on]="filtro() === f.v" (click)="filtro.set(f.v)">{{ f.t }}</button>}</div>
  </div>
  @if (estudios.error(); as e) { <sigec-error [error]="e" (reintentar)="estudios.recargar()" /> }
  @else if (estudios.cargando()) { <sigec-cargando [filas]="4" etiqueta="Cargando estudios…" /> }
  @else if (!estudios.items().length) { <sigec-vacio texto="No hay estudios para este filtro." /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Fecha</th><th>Paciente</th><th>Estudio</th><th>Origen</th><th>Estado</th><th></th></tr></thead>
    <tbody>
      @for (e of estudios.items(); track e.id) {
        <tr data-testid="estudio" [class.sel]="est(e).revisar">
          <td class="mono">{{ e.creadaEn | fechaHora }}</td><td><div class="b">{{ e.pacienteNombre ?? 'Paciente' }}</div><div class="sm muted mono">{{ e.numeroHistoria ?? '' }}</div></td>
          <td>{{ e.estudio }} · {{ tipo(e.mime) }}</td><td>{{ e.origen === 'PACIENTE' ? 'Paciente' : 'Personal' }}</td>
          <td><span [class]="'chip ' + est(e).tono">{{ est(e).texto }}</span></td>
          <td class="tr"><a [class]="est(e).revisar ? 'btn s pri' : 'btn s'" [attr.href]="'#/resultado?id=' + e.id">{{ est(e).revisar ? 'Revisar' : 'Ver informe' }}</a></td>
        </tr>
      }
    </tbody>
  </table></div></div>
  @if (estudios.hayMas()) { <button type="button" class="btn" [disabled]="estudios.cargandoMas()" (click)="estudios.cargarMas()">Cargar más</button> }
  }
  <div class="sm muted">Los resultados de la IA son de apoyo. Ningún resultado pasa a la historia clínica sin la validación de un médico.</div>
</div>`,
})
export class Estudios {
  private readonly ctx = inject(ContextStore);
  readonly filtros = FILTROS;
  readonly q = signal('');
  readonly filtro = signal('');
  private readonly qRetraso = conRetraso(this.q);
  readonly estudios = lista<Imagen>(() => ({ ruta: '/api/imagenes', query: { q: this.qRetraso().trim() || undefined, validacion: this.filtro() || undefined } }), 25);
  readonly puedeCargar = computed(() => (this.ctx.ctx()?.roles ?? []).some((r) => r === 'medico' || r === 'administrador'));
  est = estadoEstudio;
  tipo = (m: string) => (m.includes('png') ? 'PNG' : m.includes('jpeg') || m.includes('jpg') ? 'JPEG' : m.includes('dicom') ? 'DICOM' : m);
}

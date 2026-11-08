import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { HistoriaCabecera } from '../api/historia-cabecera';
import { HistoriaService } from '../api/historia.service';
import { accion, lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { TIPOS_ANTECEDENTE, textoAntecedente, type Antecedente, type Consulta, type EstudioHistoria } from '../api/tipos';
import { ContextStore } from '../context';

@Component({
  selector: 'app-historia-detalle',
  imports: [Cargando, ErrorApi, Vacio, HistoriaCabecera, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  @if (!pacienteId()) { <sigec-vacio texto="Elija un paciente para ver su historia clínica."><a class="btn pri" href="#/pacientes">Buscar paciente</a></sigec-vacio> }
  @else if (historia.error(); as e) { <sigec-error [error]="e" (reintentar)="historia.recargar()" /> }
  @else if (historia.datos(); as h) {
  <sigec-historia-cabecera [historia]="h" activa="detalle" />
  <div class="g3" style="align-items:start">
    <div class="card col" style="gap:8px"><div class="ct">Antecedentes</div>
      @if (antecedentes.error(); as e) { <sigec-error [error]="e" (reintentar)="antecedentes.recargar()" /> }
      @for (a of antecedentes.datos() ?? []; track a.id) {
        <div class="li" style="padding:8px 0" data-testid="antecedente"><span class="b">{{ texto(a.tipo) }}</span><span class="sp"></span><span>{{ a.descripcion }}</span>
          @if (esMedico()) { <button type="button" class="btn s" (click)="baja(a)" [disabled]="quitar.enCurso()">Quitar</button> }</div>
      } @empty { <p class="ink2">Sin antecedentes registrados.</p> }
      @if (quitar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
      @if (esMedico()) {
        <hr class="hr">
        <div class="field"><label for="at">Tipo</label><select class="in" id="at" [(ngModel)]="tipo">@for (t of tipos; track t.valor) {<option [value]="t.valor">{{ t.texto }}</option>}</select></div>
        <div class="field"><label for="ad">Descripción</label><input class="in" id="ad" [(ngModel)]="descripcion" maxlength="500"></div>
        @if (agregar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        <button type="button" class="btn pri" data-testid="agregar-antecedente" [disabled]="!descripcion().trim() || agregar.enCurso()" (click)="alta()">Agregar antecedente</button>
      }
    </div>
    <div class="card col" style="gap:8px"><div class="ct">Estudios</div>
      @if (estudios.error(); as e) { <sigec-error [error]="e" (reintentar)="estudios.recargar()" /> }
      @for (s of estudios.datos() ?? []; track s.imagenId) {
        <div class="li" style="padding:8px 0" data-testid="estudio"><div><div class="b">{{ s.estudio }}</div><div class="sm muted">{{ s.validadoEn ? (s.validadoEn | fecha) + ' · ' : '' }}{{ s.validacion === 'VALIDADO' ? 'informe validado' : s.validacion }}</div></div><span class="sp"></span><a class="btn s" [attr.href]="'#/resultado?id=' + s.imagenId">Abrir</a></div>
      } @empty { @if (!estudios.error()) { <p class="ink2">Sin estudios validados.</p> } }
    </div>
    <div class="card col" style="gap:8px"><div class="ct">Indicaciones vigentes</div>
      @if (ultima(); as u) {
        <div class="sm muted">Consulta del {{ u.fecha | fecha }}</div>
        <div style="white-space:pre-line">{{ u.indicaciones || 'Sin indicaciones escritas.' }}</div>
        <a class="btn pri" [attr.href]="'#/historia/receta?id=' + u.id">Ver receta imprimible</a>
      } @else { <p class="ink2">No hay consultas firmadas.</p> }
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" /> }
</div>`,
})
export class HistoriaDetalle {
  private readonly svc = inject(HistoriaService);
  private readonly ctx = inject(ContextStore);
  readonly pacienteId = parametro('paciente');
  readonly historia = recurso((api, signal) => (this.pacienteId() ? this.svc.porPaciente(this.pacienteId()!, signal) : null));
  readonly antecedentes = recurso<Antecedente[]>((api, signal) =>
    this.historia.datos() ? api.get<Antecedente[]>(`/api/historias/${this.historia.datos()!.id}/antecedentes`, { signal, query: { soloActivos: true } }) : null);
  readonly estudios = recurso<EstudioHistoria[]>((api, signal) =>
    this.historia.datos() ? api.get<EstudioHistoria[]>(`/api/historias/${this.historia.datos()!.id}/estudios`, { signal }) : null);
  private readonly firmadas = lista<Consulta>(() => (this.historia.datos() ? { ruta: `/api/historias/${this.historia.datos()!.id}/consultas`, query: { estado: 'FIRMADA' } } : null), 1);
  readonly ultima = computed(() => this.firmadas.items()[0]);
  readonly esMedico = computed(() => (this.ctx.ctx()?.roles ?? []).includes('medico'));
  readonly tipos = TIPOS_ANTECEDENTE;
  readonly tipo = signal<string>('ALERGIA');
  readonly descripcion = signal('');
  texto = textoAntecedente;

  readonly agregar = accion((api) => api.post(`/api/historias/${this.historia.datos()!.id}/antecedentes`, { tipo: this.tipo(), descripcion: this.descripcion().trim() }));
  readonly quitar = accion((api, a: Antecedente) => api.delete(`/api/historias/antecedentes/${a.id}`, { ifMatch: a.version }));
  async alta() { if ((await this.agregar.ejecutar()) !== undefined) { this.descripcion.set(''); this.antecedentes.recargar(); } }
  async baja(a: Antecedente) { await this.quitar.ejecutar(a); this.antecedentes.recargar(); }
}

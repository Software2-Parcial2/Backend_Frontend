import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { fechaLocal, nuevaIntencion } from '@sigec/api-client';
import { CatalogoService } from '../api/catalogo.service';
import { ErrorApi } from '../api/estado';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { nombreEspecialidad, type Especialidad, type Tarifa } from '../api/tipos';

@Component({
  selector: 'app-tarifa-nueva',
  imports: [ErrorApi, FormsModule],
  template: `
<div class="page">
  <div class="card col" style="max-width:560px;gap:14px" role="dialog" aria-labelledby="t-tar">
    <div><h2 id="t-tar" style="font-size:20px;font-weight:650">{{ id() ? 'Editar tarifa' : 'Nueva tarifa' }}</h2><p class="ink2" style="margin-top:4px">Solo afecta a cargos que se generen desde su fecha de vigencia</p></div>
    <div class="field"><label for="s">Especialidad o servicio</label>
      <select class="in" id="s" [ngModel]="especialidad()" (ngModelChange)="especialidad.set($event)" [disabled]="!!id()">@for (e of especialidades(); track e.codigo) {<option [value]="e.codigo">{{ e.nombre }}</option>}</select></div>
    <div class="field"><label for="ti">Tipo</label><select class="in" id="ti" [ngModel]="tipo()" (ngModelChange)="tipo.set($event)"><option value="CONSULTA">Consulta</option><option value="ESTUDIO">Estudio</option></select></div>
    <div class="g2" style="gap:12px">
      <div class="field"><label for="t">Tarifa (Bs)</label><input class="in" id="t" inputmode="decimal" [ngModel]="monto()" (ngModelChange)="monto.set($event)"></div>
      <div class="field"><label for="v">Vigente desde</label><input class="in" id="v" type="date" [ngModel]="desde()" (ngModelChange)="desde.set($event)"></div>
    </div>
    @if (guardar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/tarifario">Cancelar</a><button type="button" class="btn pri" data-testid="guardar-tarifa" [disabled]="!valido() || guardar.enCurso()" (click)="enviar()">Guardar tarifa</button></div>
  </div>
</div>`,
})
export class TarifaNueva {
  private readonly router = inject(Router);
  private readonly catalogo = inject(CatalogoService);
  readonly id = parametro('id');
  readonly especialidades = signal<Especialidad[]>([]);
  readonly especialidad = signal('');
  readonly tipo = signal('CONSULTA');
  readonly monto = signal('');
  readonly desde = signal(fechaLocal());
  private readonly intencion = nuevaIntencion();
  readonly existente = recurso<Tarifa | undefined>((api, signal) => (this.id() ? api.pagina<Tarifa>('/api/facturacion/tarifas', { limite: 100, signal }).then((p) => p.items.find((t) => t.id === this.id())) : null));

  constructor() {
    void this.catalogo.especialidades().then((e) => { this.especialidades.set(e); if (!this.especialidad() && e[0]) this.especialidad.set(e[0].codigo); });
    effect(() => {
      const t = this.existente.datos();
      untracked(() => { if (t) { this.especialidad.set(t.especialidad); this.tipo.set(t.tipo); this.monto.set(t.monto); this.desde.set(t.vigenteDesde); } });
    });
  }
  valido = () => /^\d+([.,]\d{1,2})?$/.test(this.monto().trim()) && parseFloat(this.monto().replace(',', '.')) > 0 && !!this.especialidad() && !!this.desde();

  readonly guardar = accion(async (api) => {
    const monto = parseFloat(this.monto().replace(',', '.'));
    if (this.id()) return api.put(`/api/facturacion/tarifas/${this.id()}`, { monto, tipo: this.tipo(), vigenteDesde: this.desde() }, { clave: this.intencion.clave });
    return api.post('/api/facturacion/tarifas', { especialidad: this.especialidad(), tipo: this.tipo(), monto, vigenteDesde: this.desde() }, { clave: this.intencion.clave });
  });
  async enviar() { if ((await this.guardar.ejecutar()) !== undefined) await this.router.navigate(['/tarifario']); }
  esp = nombreEspecialidad;
}

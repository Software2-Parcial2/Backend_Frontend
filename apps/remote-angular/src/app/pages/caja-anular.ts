import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { nombreEspecialidad, type Factura } from '../api/tipos';

@Component({
  selector: 'app-caja-anular',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  @if (!id()) { <sigec-vacio texto="Elija el cargo a anular desde Movimientos."><a class="btn pri" href="#/movimientos">Ir a Movimientos</a></sigec-vacio> }
  @else if (factura.error(); as e) { <sigec-error [error]="e" (reintentar)="factura.recargar()" /> }
  @else if (factura.datos(); as f) {
  <div class="card col" style="max-width:560px;gap:14px" role="dialog" aria-labelledby="t-anu">
    <div><h2 id="t-anu" style="font-size:20px;font-weight:650">Anular cargo</h2><p class="ink2" style="margin-top:4px">{{ f.numeroCargo }} · {{ f.pacienteNombre ?? 'Paciente' }} · {{ esp(f.especialidad) }} · {{ f.monto | dinero: f.moneda : true }}</p></div>
    @if (f.estado === 'ANULADA') { <div class="banner err"><div><b>Este cargo ya está anulado</b><span>{{ f.motivoAnulacion }}</span></div></div> }
    @else {
    <div class="field"><label for="m">Motivo de la anulación</label><textarea class="in" id="m" rows="3" style="height:84px" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)"></textarea></div>
    <div class="banner warn"><div><b>El cargo no se borra</b><span>Queda como anulado, con motivo, usuario y hora, para el balance y la auditoría.</span></div></div>
    @if (anular.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/caja">Volver</a><button type="button" class="btn dng" data-testid="anular" [disabled]="!motivo().trim() || anular.enCurso()" (click)="confirmar()">Anular cargo</button></div>
    }
  </div>
  } @else { <sigec-cargando [filas]="3" /> }
</div>`,
})
export class CajaAnular {
  private readonly router = inject(Router);
  readonly id = parametro('id');
  readonly motivo = signal('');
  readonly factura = recurso<Factura>((api, signal) => (this.id() ? api.get<Factura>(`/api/facturacion/facturas/${this.id()}`, { signal }) : null));
  readonly anular = accion((api) => api.post(`/api/facturacion/facturas/${this.id()}/anular`, { motivo: this.motivo().trim() }));
  esp = nombreEspecialidad;
  async confirmar() { if ((await this.anular.ejecutar()) !== undefined) await this.router.navigate(['/caja']); }
}

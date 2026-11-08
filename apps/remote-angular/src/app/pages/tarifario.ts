import { Component, computed, inject } from '@angular/core';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { lista } from '../api/recurso';
import { nombreEspecialidad, type Tarifa } from '../api/tipos';
import { ContextStore } from '../context';

@Component({
  selector: 'app-tarifario',
  imports: [Cargando, ErrorApi, Vacio, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Tarifario</h1><p class="sub">Tarifa por especialidad y servicio clínico</p></div><span class="sp"></span>@if (admin()) {<a class="btn pri" href="#/tarifario/nueva">Nueva tarifa</a>}</div>
  @if (tarifas.error(); as e) { <sigec-error [error]="e" (reintentar)="tarifas.recargar()" /> }
  @else if (tarifas.cargando()) { <sigec-cargando [filas]="4" /> }
  @else if (!tarifas.items().length) { <sigec-vacio texto="Todavía no hay tarifas." /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Especialidad o servicio</th><th>Tipo</th><th>Tarifa</th><th>Vigente desde</th><th>Estado</th><th></th></tr></thead>
    <tbody>
      @for (t of tarifas.items(); track t.id) {
        <tr data-testid="tarifa"><td class="b">{{ t.nombre ?? esp(t.especialidad) }}</td><td>{{ t.tipo === 'ESTUDIO' ? 'Estudio' : 'Consulta' }}</td><td class="b">{{ t.monto | dinero: t.moneda : true }}</td><td>{{ t.vigenteDesde | fecha }}</td>
          <td><span [class]="'chip ' + (t.estado === 'VIGENTE' ? 'ok' : t.estado === 'PROGRAMADA' ? 'info' : '')">{{ t.estado === 'VIGENTE' ? 'Vigente' : t.estado === 'PROGRAMADA' ? 'Programada' : 'Cerrada' }}</span></td>
          <td class="tr">@if (admin() && t.estado !== 'CERRADA') {<a class="btn s" [attr.href]="'#/tarifario/nueva?id=' + t.id">Editar</a>}</td></tr>
      }
    </tbody>
  </table></div></div>
  }
  <div class="banner"><div><b>Cómo se aplica</b><span>Al confirmarse una cita se genera un cargo provisional con la tarifa vigente de su especialidad. Cambiar una tarifa no modifica los cargos ya emitidos.</span></div></div>
</div>`,
})
export class Tarifario {
  private readonly ctx = inject(ContextStore);
  readonly tarifas = lista<Tarifa>(() => ({ ruta: '/api/facturacion/tarifas' }), 100);
  readonly admin = computed(() => (this.ctx.ctx()?.roles ?? []).includes('administrador'));
  esp = nombreEspecialidad;
}

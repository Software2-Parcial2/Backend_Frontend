import { Component, signal } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { fechaLocal } from '@sigec/api-client';
import { lista, recurso } from '../api/recurso';
import { textoMetodo, type Balance, type Movimiento } from '../api/tipos';

const FILTROS = [{ t: 'Todos', v: 'todos' }, { t: 'Cobros', v: 'cobros' }, { t: 'Anulaciones', v: 'anulaciones' }];

@Component({
  selector: 'app-movimientos',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Movimientos y balance diario</h1><p class="sub">{{ fecha | fecha }}</p></div></div>
  @if (balance.error(); as e) { <sigec-error [error]="e" (reintentar)="balance.recargar()" /> }
  @else if (balance.datos(); as b) {
  <div class="g4">
    <div class="card kpi"><span class="v" data-testid="total">{{ b.totalCobrado | dinero: b.moneda : true }}</span><span class="l">Total cobrado</span></div>
    <div class="card kpi"><span class="v">{{ b.porMetodo.EFECTIVO | dinero: b.moneda : true }}</span><span class="l">Efectivo</span></div>
    <div class="card kpi"><span class="v">{{ b.porMetodo.TRANSFERENCIA | dinero: b.moneda : true }}</span><span class="l">Transferencia interna</span></div>
    <div class="card kpi"><span class="v">{{ b.porMetodo.POS | dinero: b.moneda : true }}</span><span class="l">Terminal POS</span></div>
  </div>
  } @else { <sigec-cargando [filas]="2" /> }
  <div class="card flush">
    <div class="ch"><div class="ct">Movimientos</div><span class="sp"></span>
      <div class="seg">@for (f of filtros; track f.v) {<button type="button" [class.on]="filtro() === f.v" (click)="filtro.set(f.v)">{{ f.t }}</button>}</div></div>
    @if (movs.error(); as e) { <sigec-error [error]="e" (reintentar)="movs.recargar()" /> }
    @else if (movs.cargando()) { <sigec-cargando [filas]="3" /> }
    @else {
    <div class="scroll"><table class="tbl">
      <thead><tr><th>Hora</th><th>Comprobante</th><th>Paciente</th><th>Método</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        @for (m of movs.items(); track m.cargo + m.en) {
          <tr data-testid="movimiento">
            <td class="mono">{{ m.hora }}</td><td class="mono">{{ m.comprobante ?? '—' }}</td><td class="b">{{ m.paciente.nombre ?? 'Paciente' }}</td><td>{{ metodo(m.metodo) }}</td><td class="b">{{ m.monto | dinero }}</td>
            <td>@if (m.estado === 'ANULADO' || m.estado === 'ANULADA') {<span class="chip err">Anulado</span>} @else {<span class="chip ok">Pagado</span>}</td>
            <td class="tr">@if (m.estado === 'ANULADO' || m.estado === 'ANULADA') {<span class="muted sm">{{ m.motivo ?? '' }}</span>} @else {<a class="btn s" [attr.href]="'#/caja/anular?id=' + m.facturaId">Anular</a><a class="btn s" [attr.href]="'#/cobro?id=' + m.facturaId">Comprobante</a>}</td>
          </tr>
        } @empty { <tr><td colspan="7" class="muted">Sin movimientos para este filtro.</td></tr> }
      </tbody>
    </table></div>
    @if (movs.hayMas()) { <button type="button" class="btn" [disabled]="movs.cargandoMas()" (click)="movs.cargarMas()">Cargar más</button> }
    }
  </div>
  <div class="sm muted">Un cargo anulado conserva su registro y su motivo para mantener la trazabilidad.</div>
</div>`,
})
export class Movimientos {
  readonly filtros = FILTROS;
  readonly filtro = signal('todos');
  readonly fecha = fechaLocal();
  readonly balance = recurso<Balance>((api, signal) => api.get<Balance>('/api/facturacion/balance', { signal, query: { fecha: this.fecha } }));
  readonly movs = lista<Movimiento>(() => ({ ruta: '/api/facturacion/movimientos', query: { fecha: this.fecha, tipo: this.filtro() } }), 50);
  metodo = textoMetodo;
}

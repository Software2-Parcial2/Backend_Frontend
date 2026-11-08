import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { conRetraso, lista, recurso } from '../api/recurso';
import { estadoFactura, nombreEspecialidad, type Balance, type Factura } from '../api/tipos';
import { ContextStore } from '../context';

const FILTROS = [{ t: 'Por cobrar', v: 'cobrar' }, { t: 'Pagados', v: 'PAGADA' }, { t: 'Anulados', v: 'ANULADA' }];

@Component({
  selector: 'app-caja',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Caja y cargos pendientes</h1><p class="sub">Toda cita confirmada genera un cargo según la tarifa de su especialidad</p></div><span class="sp"></span>@if (esCaja()) {<a class="btn" href="#/movimientos">Movimientos y balance</a>}</div>
  @if (balance.datos(); as b) {
  <div class="g3">
    <div class="card kpi"><span class="v" data-testid="kpi-cobrado">{{ b.totalCobrado | dinero: b.moneda : true }}</span><span class="l">Cobrado hoy</span></div>
    <div class="card kpi"><span class="v">{{ b.pendiente.monto | dinero: b.moneda : true }}</span><span class="l">Pendiente de cobro</span></div>
    <div class="card kpi"><span class="v">{{ b.pendiente.cargos }}</span><span class="l">Cargos por cobrar</span></div>
  </div>
  }
  <div class="fx wrap">
    <label class="search"><span class="muted">Buscar</span><input type="text" placeholder="Paciente o N.° de cargo" aria-label="Buscar cargo" [ngModel]="q()" (ngModelChange)="q.set($event)"></label>
    <div class="seg">@for (f of filtros; track f.v) {<button type="button" [class.on]="filtro() === f.v" (click)="filtro.set(f.v)">{{ f.t }}</button>}</div>
  </div>
  @if (cargos.error(); as e) { <sigec-error [error]="e" (reintentar)="cargos.recargar()" /> }
  @else if (cargos.cargando()) { <sigec-cargando [filas]="4" etiqueta="Cargando cargos…" /> }
  @else if (!cargos.items().length) { <sigec-vacio texto="No hay cargos para este filtro." /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Cargo</th><th>Paciente</th><th>Concepto</th><th>Fecha de cita</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
    <tbody>
      @for (c of cargos.items(); track c.id) {
        <tr data-testid="cargo">
          <td class="mono">{{ c.numeroCargo }}</td><td class="b">{{ c.pacienteNombre ?? 'Paciente' }}</td><td>{{ esp(c.especialidad) }}</td>
          <td>{{ c.fechaCita ? (c.fechaCita | fecha) + ' ' + (c.fechaCita | hora) : '—' }}</td><td class="b">{{ c.monto | dinero: c.moneda : true }}</td>
          <td><span [class]="'chip ' + est(c.estado).tono">{{ est(c.estado).texto }}</span></td>
          <td class="tr">
            @if (c.estado === 'PAGADA') { <a class="btn s" [attr.href]="'#/cobro?id=' + c.id">Comprobante</a> }
            @else if (c.estado !== 'ANULADA' && esCaja()) { <a class="btn s pri" [attr.href]="'#/cobro?id=' + c.id">Cobrar</a> }
            @else { <span class="muted">—</span> }
          </td>
        </tr>
      }
    </tbody>
  </table></div></div>
  @if (cargos.hayMas()) { <button type="button" class="btn" [disabled]="cargos.cargandoMas()" (click)="cargos.cargarMas()">Cargar más</button> }
  }
  <div class="sm muted">Un cargo provisional pasa a confirmado cuando la SAGA confirma la cita, y se anula si la cita se cancela o la reserva no se completa.</div>
</div>`,
})
export class Caja {
  private readonly ctx = inject(ContextStore);
  readonly filtros = FILTROS;
  readonly q = signal('');
  readonly filtro = signal('cobrar');
  private readonly qRetraso = conRetraso(this.q);
  readonly esCaja = computed(() => (this.ctx.ctx()?.roles ?? []).some((r) => r === 'caja' || r === 'administrador'));
  readonly balance = recurso<Balance | undefined>((api, signal) => (this.esCaja() ? api.get<Balance>('/api/facturacion/balance', { signal }).catch(() => undefined) : null));
  readonly cargos = lista<Factura>(() => ({
    ruta: '/api/facturacion/facturas',
    query: { porCobrar: this.filtro() === 'cobrar' ? true : undefined, estado: this.filtro() !== 'cobrar' ? this.filtro() : undefined, q: this.qRetraso().trim() || undefined },
  }), 25);
  est = estadoFactura;
  esp = nombreEspecialidad;
}

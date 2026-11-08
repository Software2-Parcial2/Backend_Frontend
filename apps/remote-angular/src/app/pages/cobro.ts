import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nuevaIntencion } from '@sigec/api-client';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { ApiService } from '../api/api.service';
import { METODOS_PAGO, estadoFactura, nombreEspecialidad, textoMetodo, type ComprobanteCaja, type Factura, type PagoRegistrado } from '../api/tipos';

@Component({
  selector: 'app-cobro',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  @if (!id()) { <sigec-vacio texto="Elija un cargo desde Caja."><a class="btn pri" href="#/caja">Ir a Caja</a></sigec-vacio> }
  @else if (factura.error(); as e) { <sigec-error [error]="e" (reintentar)="factura.recargar()" /> }
  @else if (factura.datos(); as f) {
  <div class="ph"><div><h1 class="h1">{{ f.estado === 'PAGADA' ? 'Cobro registrado' : 'Registrar cobro' }}</h1><p class="sub">Cargo <span class="mono">{{ f.numeroCargo }}</span> · {{ f.pacienteNombre ?? 'Paciente' }}</p></div><span class="sp"></span><span [class]="'chip ' + est(f.estado).tono" data-testid="estado-cargo">{{ est(f.estado).texto }}</span></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 520px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Cargo</div></div>
        <div class="li" style="padding:8px 0"><span class="muted">Concepto</span><span class="sp"></span><span class="b">Consulta de {{ esp(f.especialidad) }}{{ f.fechaCita ? ' · ' + (f.fechaCita | fecha) + ' ' + (f.fechaCita | hora) : '' }}</span></div>
        <div class="li" style="padding:8px 0"><span class="muted">Tarifa</span><span class="sp"></span><span class="b">{{ f.monto | dinero: f.moneda }}</span></div>
        <div class="li" style="padding:8px 0"><span class="muted">Saldo pendiente</span><span class="sp"></span><span class="b" style="font-size:18px">{{ f.estado === 'PAGADA' ? (0 | dinero: f.moneda) : (f.monto | dinero: f.moneda) }}</span></div>
      </div>
      @if (cobrable()) {
      <div class="card col" style="gap:14px">
        <div class="ct">Pago</div>
        <div class="field"><label>Método de pago</label><div class="seg" style="align-self:flex-start">@for (m of metodos; track m.v) {<button type="button" [class.on]="metodo() === m.v" [attr.data-metodo]="m.v" (click)="metodo.set(m.v)">{{ m.t }}</button>}</div></div>
        <div class="fg">
          @if (metodo() === 'EFECTIVO') {
            <div class="field"><label for="mo">Monto recibido ({{ f.moneda }})</label><input class="in" id="mo" inputmode="decimal" [ngModel]="recibido()" (ngModelChange)="recibido.set($event)"></div>
            <div class="field"><label for="cm">Cambio</label><input class="in" id="cm" [value]="cambio()" readonly data-testid="cambio"></div>
          }
        </div>
        @if (metodo() !== 'EFECTIVO') { <div class="field"><label for="rf">Referencia de operación</label><input class="in" id="rf" [ngModel]="referencia()" (ngModelChange)="referencia.set($event)" maxlength="100"></div> }
        <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px" data-testid="clave">{{ intencion.clave }}</div><span class="hint">Si el envío se repite por un corte, el cobro no se registra dos veces.</span></div>
        @if (pagar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        <div class="fx"><a class="btn" href="#/caja">Cancelar</a><span class="sp"></span><button type="button" class="btn pri" style="height:46px" data-testid="cobrar" [disabled]="!valido() || pagar.enCurso()" (click)="cobrar()">Registrar cobro de {{ f.monto | dinero: f.moneda : true }}</button></div>
      </div>
      }
    </div>
    @if (comprobante(); as c) {
    <div class="card col" style="flex:1 1 340px;max-width:420px;gap:12px;background:#FBFCFC" data-testid="comprobante">
      <div class="fx"><span class="ct">Comprobante interno</span><span class="sp"></span><span class="chip ok">{{ c.anulado ? 'Anulado' : 'Emitido' }}</span></div>
      <div class="mono" style="font-size:13px">N.° {{ c.numero }} · {{ c.emitidoEn | fechaHora }}</div>
      <hr class="hr">
      <div class="li" style="padding:4px 0"><span class="muted">Paciente</span><span class="sp"></span><span class="b">{{ c.paciente.nombre ?? '—' }}</span></div>
      <div class="li" style="padding:4px 0"><span class="muted">Concepto</span><span class="sp"></span><span class="b">{{ c.concepto }}</span></div>
      <div class="li" style="padding:4px 0"><span class="muted">Método</span><span class="sp"></span><span class="b">{{ metodoTxt(c.metodo) }}</span></div>
      <div class="li" style="padding:4px 0"><span class="muted">Total cobrado</span><span class="sp"></span><span class="b">{{ c.total | dinero: c.moneda }}</span></div>
      <div class="li" style="padding:4px 0"><span class="muted">Cajero</span><span class="sp"></span><span class="b">{{ c.cajero }}</span></div>
      <div class="sm muted">{{ c.aviso }}</div>
      <div class="fx"><button type="button" class="btn" (click)="imprimir()">Imprimir</button></div>
    </div>
    }
  </div>
  } @else { <sigec-cargando [filas]="4" /> }
</div>`,
})
export class Cobro {
  private readonly cliente = inject(ApiService).cliente;
  readonly id = parametro('id');
  readonly metodos = METODOS_PAGO;
  readonly intencion = nuevaIntencion();
  readonly factura = recurso<Factura>((api, signal) => (this.id() ? api.get<Factura>(`/api/facturacion/facturas/${this.id()}`, { signal }) : null));
  readonly metodo = signal<'EFECTIVO' | 'TRANSFERENCIA' | 'POS'>('EFECTIVO');
  readonly recibido = signal('');
  readonly referencia = signal('');
  readonly pagado = signal<ComprobanteCaja | null>(null);
  private readonly existente = recurso<ComprobanteCaja | undefined>((api, signal) =>
    this.factura.datos()?.estado === 'PAGADA' ? api.get<ComprobanteCaja>(`/api/facturacion/facturas/${this.id()}/comprobante`, { signal, query: { formato: 'json' } }).catch(() => undefined) : null);
  readonly comprobante = computed(() => this.pagado() ?? this.existente.datos() ?? null);
  readonly cobrable = computed(() => !this.pagado() && ['PENDIENTE', 'PROVISIONAL', 'CONFIRMADA'].includes(this.factura.datos()?.estado ?? ''));
  readonly cambio = computed(() => {
    const m = Math.round(parseFloat(this.recibido().replace(',', '.')) * 100), t = Math.round(parseFloat(this.factura.datos()?.monto ?? '0') * 100);
    return Number.isFinite(m) && m >= t ? ((m - t) / 100).toFixed(2) : '0.00';
  });
  readonly valido = computed(() => {
    if (this.metodo() === 'EFECTIVO') {
      const m = parseFloat(this.recibido().replace(',', '.'));
      return Number.isFinite(m) && m >= parseFloat(this.factura.datos()?.monto ?? 'Infinity');
    }
    return this.referencia().trim().length > 0;
  });
  constructor() {
    // Si se abre otro cargo con el mismo componente, el formulario y la clave de idempotencia empiezan de cero.
    effect(() => {
      this.id();
      untracked(() => { this.pagado.set(null); this.recibido.set(''); this.referencia.set(''); this.metodo.set('EFECTIVO'); this.pagar.limpiar(); this.intencion.renovar(); });
    });
  }
  est = estadoFactura;
  esp = nombreEspecialidad;
  metodoTxt = textoMetodo;
  imprimir() { window.print(); }

  readonly pagar = accion((api) => {
    const cuerpo = this.metodo() === 'EFECTIVO' ? { metodo: 'EFECTIVO', recibido: parseFloat(this.recibido().replace(',', '.')) } : { metodo: this.metodo(), referencia: this.referencia().trim() };
    return api.post<PagoRegistrado>(`/api/facturacion/facturas/${this.id()}/pagos`, cuerpo, { clave: this.intencion.clave });
  });
  async cobrar() {
    const r = await this.pagar.ejecutar();
    if (r) { this.pagado.set(r.comprobante); this.factura.recargar(); }
  }
}

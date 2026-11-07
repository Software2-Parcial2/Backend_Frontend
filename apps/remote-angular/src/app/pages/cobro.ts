import { Component } from '@angular/core';

@Component({
  selector: 'app-cobro',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Registrar cobro</h1><p class="sub">Cargo <span class="mono">CG-20261103-0412</span> · Carla Rojas Vaca</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 520px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Cargo</div></div>
        <div class="li" style="padding:8px 0"><span class="muted">Concepto</span><span class="sp"></span><span class="b">Consulta de Cardiología · 03 nov 10:00</span></div>
        <div class="li" style="padding:8px 0"><span class="muted">Tarifa</span><span class="sp"></span><span class="b">Bs 180,00</span></div>
        <div class="li" style="padding:8px 0"><span class="muted">Saldo pendiente</span><span class="sp"></span><span class="b" style="font-size:18px">Bs 180,00</span></div>
      </div>
      <div class="card col" style="gap:14px">
        <div class="ct">Pago</div>
        <div class="field"><label>Método de pago</label><div class="seg" style="align-self:flex-start"><button type="button" class="on">Efectivo</button><button type="button">Transferencia interna</button><button type="button">Terminal POS</button></div></div>
        <div class="fg">
          <div class="field"><label for="mo">Monto recibido (Bs)</label><input class="in" id="mo" value="200,00"></div>
          <div class="field"><label for="cm">Cambio</label><input class="in" id="cm" value="20,00" readonly></div>
        </div>
        <div class="field"><label for="rf">Referencia de operación</label><input class="in" id="rf" placeholder="Solo para transferencia o POS"></div>
        <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px">e6d3a1c9-0b42-47f8-8a15-7c9be2d41f60</div><span class="hint">Si el envío se repite por un corte, el cobro no se registra dos veces.</span></div>
        <div class="fx"><a class="btn" href="#/caja">Cancelar</a><span class="sp"></span><button type="button" class="btn pri" style="height:46px">Registrar cobro de Bs 180</button></div>
      </div>
    </div>
    <div class="card col" style="flex:1 1 340px;max-width:420px;gap:12px;background:#FBFCFC">
      <div class="fx"><span class="ct">Comprobante interno</span><span class="sp"></span><span class="chip ok">Emitido</span></div>
      <div class="mono" style="font-size:13px">N.° CI-000873 · 03 nov 2026 · 10:21</div>
      <hr class="hr">
      @for (r of filas; track r[0]) {<div class="li" style="padding:4px 0"><span class="muted">{{ r[0] }}</span><span class="sp"></span><span class="b">{{ r[1] }}</span></div>}
      <div class="sm muted">Comprobante administrativo de caja. No es una factura fiscal.</div>
      <div class="fx"><button type="button" class="btn">Imprimir</button><button type="button" class="btn">Descargar PDF</button></div>
    </div>
  </div>
</div>`,
})
export class Cobro {
  readonly filas = [['Paciente', 'Carla Rojas Vaca'], ['Concepto', 'Cardiología'], ['Método', 'Efectivo'], ['Total cobrado', 'Bs 180,00'], ['Cajero', 'Jorge Choque']];
}

import { Component } from '@angular/core';

@Component({
  selector: 'app-caja',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Caja y cargos pendientes</h1><p class="sub">Toda cita confirmada genera un cargo según la tarifa de su especialidad</p></div></div>
  <div class="g3">
    <div class="card kpi"><span class="v">Bs 1.440</span><span class="l">Cobrado hoy</span></div>
    <div class="card kpi"><span class="v">Bs 600</span><span class="l">Pendiente de cobro</span></div>
    <div class="card kpi"><span class="v">4</span><span class="l">Cargos por cobrar</span></div>
  </div>
  <div class="fx wrap">
    <label class="search"><span class="muted">Buscar</span><input type="text" placeholder="Paciente o N.° de cargo" aria-label="Buscar cargo"></label>
    <div class="seg"><button type="button" class="on">Por cobrar</button><button type="button">Pagados</button><button type="button">Anulados</button></div>
  </div>
  <div class="card flush">
    <div class="scroll">
      <table class="tbl">
        <thead><tr><th>Cargo</th><th>Paciente</th><th>Concepto</th><th>Fecha de cita</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (c of filas; track c.id) {
            <tr [class.sel]="c.sel">
              <td class="mono">{{ c.id }}</td><td class="b">{{ c.paciente }}</td><td>{{ c.concepto }}</td><td>{{ c.fecha }}</td><td class="b">{{ c.monto }}</td>
              <td><span [class]="'chip ' + c.tono">{{ c.estado }}</span></td>
              <td class="tr">@if (c.pagado) {<button type="button" class="btn s">Comprobante</button>} @else {<a class="btn s pri" href="#/cobro">Cobrar</a>}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="sm muted">Un cargo provisional pasa a confirmado cuando la SAGA confirma la cita, y se anula si la cita se cancela o la reserva no se completa.</div>
</div>`,
})
export class Caja {
  readonly filas = [
    { id: 'CG-20261103-0412', paciente: 'Carla Rojas Vaca', concepto: 'Cardiología', fecha: '03 nov 10:00', monto: 'Bs 180', estado: 'Provisional', tono: 'warn', pagado: false, sel: true },
    { id: 'CG-20261103-0409', paciente: 'Wilma Justiniano', concepto: 'Neumología', fecha: '03 nov 10:00', monto: 'Bs 160', estado: 'Provisional', tono: 'warn', pagado: false, sel: false },
    { id: 'CG-20261103-0405', paciente: 'Teresa Mendoza', concepto: 'Medicina general', fecha: '03 nov 10:30', monto: 'Bs 120', estado: 'Confirmado', tono: 'info', pagado: false, sel: false },
    { id: 'CG-20261103-0401', paciente: 'Valentina Roca', concepto: 'Pediatría', fecha: '03 nov 10:30', monto: 'Bs 140', estado: 'Confirmado', tono: 'info', pagado: false, sel: false },
    { id: 'CG-20261103-0388', paciente: 'Mario Vargas', concepto: 'Cardiología', fecha: '03 nov 08:00', monto: 'Bs 180', estado: 'Pagado', tono: 'ok', pagado: true, sel: false },
  ];
}

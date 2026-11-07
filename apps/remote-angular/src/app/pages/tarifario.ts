import { Component } from '@angular/core';

@Component({
  selector: 'app-tarifario',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Tarifario</h1><p class="sub">Tarifa por especialidad y servicio clínico</p></div><span class="sp"></span><a class="btn pri" href="#/tarifario/nueva">Nueva tarifa</a></div>
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Especialidad o servicio</th><th>Tipo</th><th>Tarifa</th><th>Vigente desde</th><th>Estado</th><th></th></tr></thead>
    <tbody>
      @for (t of filas; track t.n) {
        <tr [class.sel]="t.n === 'Cardiología'"><td class="b">{{ t.n }}</td><td>{{ t.tipo }}</td><td class="b">Bs {{ t.bs }}</td><td>01 ene 2026</td><td><span class="chip ok">Vigente</span></td><td class="tr"><a class="btn s" href="#/tarifario/nueva">Editar</a></td></tr>
      }
    </tbody>
  </table></div></div>
  <div class="banner"><div><b>Cómo se aplica</b><span>Al confirmarse una cita se genera un cargo provisional con la tarifa vigente de su especialidad. Cambiar una tarifa no modifica los cargos ya emitidos.</span></div></div>
</div>`,
})
export class Tarifario {
  readonly filas = [
    { n: 'Medicina general', tipo: 'Consulta', bs: 120 }, { n: 'Cardiología', tipo: 'Consulta', bs: 180 },
    { n: 'Neumología', tipo: 'Consulta', bs: 160 }, { n: 'Pediatría', tipo: 'Consulta', bs: 140 },
    { n: 'Traumatología', tipo: 'Consulta', bs: 170 }, { n: 'Gastroenterología', tipo: 'Consulta', bs: 170 },
    { n: 'Radiografía de tórax', tipo: 'Estudio', bs: 110 },
  ];
}

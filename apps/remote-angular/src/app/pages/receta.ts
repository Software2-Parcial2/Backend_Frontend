import { Component } from '@angular/core';

@Component({
  selector: 'app-receta',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Receta médica</h1><p class="sub">Vista previa para imprimir o exportar en PDF</p></div><span class="sp"></span><a class="btn" href="#/historia/detalle">Volver</a><button type="button" class="btn pri" (click)="imprimir()">Imprimir</button></div>
  <div class="card col" style="gap:14px;max-width:760px;padding:32px">
    <div class="fx"><div><div class="b" style="font-size:18px">Clínica Médica Santa Cruz</div><div class="sm muted">Santa Cruz de la Sierra</div></div><span class="sp"></span><div class="sm muted" style="text-align:right">3 nov 2026<br>Receta RX-0932</div></div>
    <div class="li"><span class="muted">Paciente</span><span class="sp"></span><span class="b">Carla Rojas Vaca · HC-004218</span></div>
    <div class="li"><span class="muted">Alergias</span><span class="sp"></span><span class="chip warn">Penicilina</span></div>
    <div class="b">Indicaciones</div>
    <div>1. [MEDICAMENTO Y DOSIS A DEFINIR POR EL MÉDICO]<br>2. Reposo relativo y evitar esfuerzos intensos<br>3. Control en 15 días</div>
    <div class="fx" style="margin-top:24px"><span class="sp"></span><div style="text-align:center"><div style="width:220px;border-top:1px solid var(--bd)"></div><div class="sm muted">Dra. Valeria Antelo · Cardiología</div></div></div>
  </div>
</div>`,
})
export class Receta {
  imprimir() { window.print(); }
}

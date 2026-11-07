import { Component } from '@angular/core';

@Component({
  selector: 'app-historia-detalle',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Carla Rojas Vaca</h1><p class="sub"><span class="mono">HC-004218</span> · 34 años</p></div></div>
  <div class="tabs"><a class="tab" href="#/historia">Consultas</a><span class="tab on">Antecedentes</span><span class="tab">Estudios</span><span class="tab">Indicaciones</span><a class="tab" href="#/historia/auditoria">Auditoría</a></div>
  <div class="g3" style="align-items:start">
    <div class="card col" style="gap:8px"><div class="ct">Antecedentes</div>
      <div class="li" style="padding:8px 0"><span class="b">Alergia</span><span class="sp"></span><span>Penicilina</span></div>
      <div class="li" style="padding:8px 0"><span class="b">Crónicos</span><span class="sp"></span><span>Hipertensión leve</span></div>
      <div class="li" style="padding:8px 0"><span class="b">Quirúrgicos</span><span class="sp"></span><span>Apendicectomía 2015</span></div></div>
    <div class="card col" style="gap:8px"><div class="ct">Estudios</div>
      <div class="li" style="padding:8px 0"><div><div class="b">Radiografía de tórax</div><div class="sm muted">12 oct 2026 · informe validado</div></div><span class="sp"></span><a class="btn s" href="#/resultado">Abrir</a></div></div>
    <div class="card col" style="gap:8px"><div class="ct">Indicaciones vigentes</div>
      <div class="li" style="padding:8px 0"><span>Reposo relativo</span></div>
      <div class="li" style="padding:8px 0"><span>Control en 15 días</span></div>
      <a class="btn pri" href="#/historia/receta">Ver receta imprimible</a></div>
  </div>
</div>`,
})
export class HistoriaDetalle {}

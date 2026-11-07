import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-cita-reprogramar',
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-rep">
  <div class="card">
    <div><h2 id="t-rep" style="font-size:20px;font-weight:650">Reprogramar cita</h2><p class="ink2" style="margin-top:4px">Carla Rojas Vaca · Cardiología · actualmente mar 3 nov, 10:00</p></div>
    <div class="field"><label for="d">Nueva fecha</label><input class="in" id="d" type="text" value="Jue 5 nov 2026"></div>
    <div class="fx wrap">
      @for (h of horas; track h) {<button type="button" class="slot" [class.on]="hora() === h" (click)="hora.set(h)">{{ h }}</button>}
    </div>
    <div class="sm muted">Se libera el horario anterior y se envía un aviso al paciente.</div>
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/cita">Volver</a><a class="btn pri" href="#/cita">Confirmar nuevo horario</a></div>
  </div>
</div>`,
})
export class CitaReprogramar {
  readonly horas = ['09:00', '10:00', '10:30', '11:30'];
  readonly hora = signal('10:00');
}

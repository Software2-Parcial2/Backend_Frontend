import { Component } from '@angular/core';

@Component({
  selector: 'app-cita-cancelar',
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-can">
  <div class="card">
    <div><h2 id="t-can" style="font-size:20px;font-weight:650">Cancelar cita</h2><p class="ink2" style="margin-top:4px">Carla Rojas Vaca · Cardiología · mar 3 nov, 10:00</p></div>
    <div class="field"><label for="m">Motivo</label><select class="in" id="m"><option>Pedido del paciente</option><option>Médico no disponible</option><option>Otro</option></select></div>
    <div class="banner warn"><div><b>Se anulará el cargo provisional</b><span>Bs 180. El registro del cargo se conserva con su trazabilidad.</span></div></div>
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/cita">Mantener cita</a><a class="btn dng" href="#/cita">Cancelar cita</a></div>
  </div>
</div>`,
})
export class CitaCancelar {}

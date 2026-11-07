import { Component } from '@angular/core';

@Component({
  selector: 'app-caja-anular',
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-anu">
  <div class="card">
    <div><h2 id="t-anu" style="font-size:20px;font-weight:650">Anular cargo</h2><p class="ink2" style="margin-top:4px">Teresa Mendoza · Medicina general · Bs 120</p></div>
    <div class="field"><label for="m">Motivo de la anulación</label><textarea class="in" id="m" rows="3" style="height:84px">Cita cancelada por el paciente</textarea></div>
    <div class="banner warn"><div><b>El cargo no se borra</b><span>Queda como anulado, con motivo, usuario y hora, para el balance y la auditoría.</span></div></div>
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/caja">Volver</a><a class="btn dng" href="#/caja">Anular cargo</a></div>
  </div>
</div>`,
})
export class CajaAnular {}

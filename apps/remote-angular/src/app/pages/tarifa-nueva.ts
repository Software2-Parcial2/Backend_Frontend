import { Component } from '@angular/core';

@Component({
  selector: 'app-tarifa-nueva',
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-tar">
  <div class="card">
    <div><h2 id="t-tar" style="font-size:20px;font-weight:650">Nueva tarifa</h2><p class="ink2" style="margin-top:4px">Solo afecta a cargos que se generen desde su fecha de vigencia</p></div>
    <div class="field"><label for="s">Especialidad o servicio</label><select class="in" id="s"><option>Cardiología</option><option>Neumología</option><option>Radiografía de tórax</option></select></div>
    <div class="g2" style="gap:12px"><div class="field"><label for="t">Tarifa (Bs)</label><input class="in" id="t" type="text" value="190"></div><div class="field"><label for="v">Vigente desde</label><input class="in" id="v" type="text" value="01 dic 2026"></div></div>
    <div class="fx" style="justify-content:flex-end"><a class="btn" href="#/tarifario">Cancelar</a><a class="btn pri" href="#/tarifario">Guardar tarifa</a></div>
  </div>
</div>`,
})
export class TarifaNueva {}

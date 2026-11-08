import { Component } from '@angular/core';
import { parametro } from '../api/ruta';

@Component({
  selector: 'app-estudio-rechazada',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Archivo no válido</h1><p class="sub">La revisión en este equipo detectó un problema antes de enviar</p></div><span class="sp"></span><span class="chip err">Rechazado</span></div>
  <div class="card col" style="gap:14px;max-width:640px">
    <div class="banner err" role="alert"><div><b>No se envió al servidor</b><span data-testid="motivo">{{ motivo() ?? 'El archivo no cumple los requisitos.' }}</span></div></div>
    @if (archivo()) { <div class="sm muted">Archivo: <span class="mono">{{ archivo() }}</span></div> }
    <div class="b">Qué hacer</div>
    <div class="ink2">Suba una radiografía de tórax en formato JPG, PNG o DICOM de hasta 20 MB. Puede cargar otra imagen o cancelar.</div>
    <div class="fx"><a class="btn" href="#/estudios">Cancelar</a><a class="btn pri" href="#/estudios/cargar">Elegir otro archivo</a></div>
  </div>
</div>`,
})
export class EstudioRechazada {
  readonly motivo = parametro('motivo');
  readonly archivo = parametro('archivo');
}

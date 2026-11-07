import { Component } from '@angular/core';

@Component({
  selector: 'app-estudio-rechazada',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Imagen no válida</h1><p class="sub">La validación local detectó que no es una radiografía de tórax</p></div><span class="sp"></span><span class="chip err">Rechazada</span></div>
  <div class="g2" style="align-items:start">
    <div class="col" style="gap:12px"><div class="xray" style="height:360px">[Imagen subida: foto de documento]</div><div class="sm muted">carla_rojas_cedula.jpg · 1,2 MB</div></div>
    <div class="card col" style="gap:14px">
      <div class="banner err" role="alert"><div><b>No se envió al servidor</b><span>La imagen se descartó en el dispositivo; no se almacenó ni se analizó.</span></div></div>
      <div class="b">Qué hacer</div>
      <div class="ink2">Suba una radiografía de tórax en formato JPG, PNG o DICOM. Puede cargar otra imagen o cancelar.</div>
      <div class="fx"><a class="btn" href="#/estudios">Cancelar</a><a class="btn pri" href="#/estudios/cargar">Elegir otra imagen</a></div>
    </div>
  </div>
</div>`,
})
export class EstudioRechazada {}

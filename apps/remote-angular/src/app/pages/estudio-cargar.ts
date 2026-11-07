import { Component } from '@angular/core';

@Component({
  selector: 'app-estudio-cargar',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Cargar radiografía de tórax</h1><p class="sub">La imagen se revisa en este equipo antes de enviarse al servidor</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card" style="border-style:dashed;border-color:var(--bd)">
        <div class="fx wrap" style="gap:18px">
          <div class="xray" style="width:150px;height:150px;flex:none">Vista previa</div>
          <div class="col" style="gap:6px;flex:1 1 240px">
            <div class="b" style="font-size:16px">torax_cuellar_03nov.png</div>
            <div class="muted">PNG · 2,4 MB · 2048 × 2500 px</div>
            <div class="fx" style="gap:8px"><button type="button" class="btn s">Cambiar archivo</button><span class="sm muted">Se aceptan DICOM, PNG y JPEG en 2D</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Verificaciones</div></div>
        <div class="li" style="align-items:flex-start"><span class="chip ok">Listo</span><div style="flex:1"><div class="b">En este dispositivo: ¿es una radiografía de tórax?</div><div class="sm muted">Modelo MobileNet local · 98 % radiografía de tórax · la imagen no sale del equipo</div></div></div>
        <div class="li" style="align-items:flex-start"><span class="chip ok">Listo</span><div style="flex:1"><div class="b">Huella SHA-256 del archivo</div><div class="mono muted" style="word-break:break-all">e3b0c44298fc1c149afbf4c8996fb92427ae41e4</div><div class="sm muted">No hay un archivo idéntico cargado antes</div></div></div>
        <div class="li" style="align-items:flex-start"><span class="chip info">En curso</span><div style="flex:1"><div class="b">Subida a almacenamiento privado</div><div class="pb" style="margin-top:8px" role="progressbar" aria-valuenow="64" aria-valuemin="0" aria-valuemax="100"><i style="width:64%"></i></div></div></div>
        <div class="li" style="align-items:flex-start"><span class="chip">Pendiente</span><div style="flex:1"><div class="b">Validación en el servidor y análisis con IA</div></div></div>
      </div>
    </div>
    <div class="card col" style="flex:1 1 320px;max-width:400px;gap:14px">
      <div class="ct">Datos del estudio</div>
      <div class="field"><label for="pc">Paciente</label><input class="in" id="pc" value="Pedro Cuéllar · HC-003781"></div>
      <div class="field"><label for="te">Tipo de estudio</label><select class="in" id="te"><option>Radiografía de tórax</option></select></div>
      <div class="field"><label for="ob">Observaciones</label><textarea class="in" id="ob" rows="3">Tos de tres semanas. Sin antecedentes de tuberculosis.</textarea></div>
      <div class="banner"><div><b>Resultado de apoyo</b><span>La IA no emite un diagnóstico; lo interpreta un médico.</span></div></div>
      <a class="btn pri" href="#/resultado" style="height:46px">Subir y solicitar análisis</a>
      <div class="sm muted">Si la imagen no es una radiografía de tórax, se rechaza antes de subirla. <a href="#/estudios/rechazada">Ver ejemplo de imagen rechazada</a></div>
    </div>
  </div>
</div>`,
})
export class EstudioCargar {}

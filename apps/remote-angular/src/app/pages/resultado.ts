import { Component } from '@angular/core';

@Component({
  selector: 'app-resultado',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Radiografía de tórax · Pedro Cuéllar</h1><p class="sub">Cargada el 3 nov 08:34 · <span class="mono">HC-003781</span></p></div><span class="chip warn">Resultado por validar</span></div>
  <div class="disc"><span class="b">Resultado de apoyo.</span><span>No es un diagnóstico automático: debe ser interpretado y firmado por un médico.</span></div>
  <div class="g2">
    <div class="card col" style="gap:10px"><div class="ct">Radiografía original</div><div class="xray" style="height:380px">[Radiografía de tórax]</div></div>
    <div class="card col" style="gap:10px">
      <div class="fx"><div class="ct">Regiones de interés · Grad-CAM</div><span class="sp"></span><span class="sm muted">Mapa de calor</span></div>
      <div class="xray" style="height:380px"><div class="heat" style="width:150px;height:130px;left:62%;top:52%"></div><div class="heat" style="width:90px;height:80px;left:22%;top:30%;opacity:.6"></div><span style="position:relative">[Radiografía con regiones resaltadas]</span></div>
    </div>
  </div>
  <div class="g2">
    <div class="card col" style="gap:12px">
      <div class="ct">Clasificación del modelo</div>
      <div><div class="fx"><span class="b">PNEUMONIA</span><span class="sp"></span><span class="b">87 %</span></div><div class="pb" style="margin-top:6px;height:10px" role="img" aria-label="87 por ciento"><i style="width:87%"></i></div></div>
      <div><div class="fx"><span class="b">NORMAL</span><span class="sp"></span><span class="b">13 %</span></div><div class="pb" style="margin-top:6px;height:10px" role="img" aria-label="13 por ciento"><i style="width:13%;background:var(--bd)"></i></div></div>
      <hr class="hr">
      <div class="sm muted">Modelo cnn-neumonia v1.2 (MobileNetV2) · procesado el 3 nov 08:41. El conjunto de entrenamiento es pediátrico y puede tener fuga de datos entre entrenamiento y prueba.</div>
    </div>
    <div class="card col" style="gap:12px">
      <div class="ct">Validación médica</div>
      <div class="seg" style="align-self:flex-start"><button type="button" class="on">Confirmo el hallazgo</button><button type="button">Lo modifico</button><button type="button">Lo descarto</button></div>
      <div class="field"><label for="inf">Informe del médico</label><textarea class="in" id="inf" rows="3">Opacidad en el lóbulo inferior derecho compatible con proceso neumónico. Se recomienda correlación clínica y control a las 72 horas.</textarea></div>
      <a class="btn pri" href="#/historia" style="height:46px">Firmar y agregar a la historia clínica</a>
      <div class="sm muted">Ningún resultado llega a la historia clínica sin esta firma. Se registra la versión del modelo y la huella del archivo.</div>
    </div>
  </div>
</div>`,
})
export class Resultado {}

import { Component } from '@angular/core';

@Component({
  selector: 'app-consulta',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Consulta · Carla Rojas Vaca</h1><p class="sub">Martes 3 de noviembre de 2026 · 10:00 · Cardiología</p></div><span class="sp"></span><span class="chip warn">Alergia: penicilina</span></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Motivo y anamnesis</div></div>
        <div class="col" style="gap:14px">
          <div class="field"><label for="mo">Motivo de consulta</label><input class="in" id="mo" type="text" value="Dolor torácico al esfuerzo desde hace tres semanas"></div>
          <div class="field"><label for="an">Anamnesis</label><textarea class="in" id="an" rows="3">Dolor opresivo de 5 a 10 minutos al subir escaleras, cede con el reposo. Sin disnea ni palpitaciones. Niega consumo de tabaco.</textarea></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Signos vitales</div></div>
        <div class="fg" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
          @for (v of vitales; track v.id) {<div class="field"><label [for]="v.id">{{ v.l }}</label><input class="in" [id]="v.id" [value]="v.v"></div>}
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Evaluación y diagnóstico</div></div>
        <div class="col" style="gap:14px">
          <div class="field"><label for="ev">Evaluación clínica</label><textarea class="in" id="ev" rows="2">Ruidos cardíacos rítmicos, sin soplos. Pulmones limpios. Se solicita electrocardiograma.</textarea></div>
          <div class="field"><label for="dx">Diagnóstico (CIE-10)</label><input class="in" id="dx" value="R07.4 Dolor torácico, no especificado"></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Indicaciones y estudios</div><span class="sp"></span><button type="button" class="btn s">Agregar indicación</button></div>
        <div class="scroll"><table class="tbl" style="min-width:520px"><thead><tr><th>Indicación</th><th>Dosis</th><th>Frecuencia</th><th>Duración</th></tr></thead>
          <tbody><tr><td class="b">Reposo relativo y evitar esfuerzos intensos</td><td class="muted">—</td><td class="muted">—</td><td>7 días</td></tr></tbody></table></div>
        <hr class="hr" style="margin:12px 0">
        <div class="fx wrap"><span class="b">Estudios asociados</span><span class="tag">Electrocardiograma</span><a class="btn s" href="#/estudios">Asociar radiografía</a></div>
      </div>
    </div>
    <div class="col" style="flex:1 1 280px;max-width:340px;gap:16px">
      <div class="card col">
        <div class="fx"><div class="ct">Registro</div><span class="sp"></span><span class="chip warn">Borrador</span></div>
        <div class="li" style="padding:6px 0"><span class="muted">Versión</span><span class="sp"></span><span class="mono">v3</span></div>
        <div class="li" style="padding:6px 0"><span class="muted">Guardado</span><span class="sp"></span><span>Hace 1 min</span></div>
        <button type="button" class="btn">Guardar borrador</button>
        <a class="btn pri" href="#/historia" style="height:46px">Firmar y cerrar consulta</a>
      </div>
      <div class="banner"><div><b>Edición protegida</b><span>Requiere conexión. Si otro profesional modifica el registro, se le avisará en lugar de sobrescribir.</span></div></div>
    </div>
  </div>
</div>`,
})
export class Consulta {
  readonly vitales = [
    { id: 'pa', l: 'Presión (mmHg)', v: '128/82' }, { id: 'fc', l: 'Frecuencia cardíaca', v: '76 lpm' },
    { id: 'fr', l: 'Frecuencia resp.', v: '16 rpm' }, { id: 'te', l: 'Temperatura', v: '36,6 °C' }, { id: 'sp', l: 'Saturación', v: '98 %' },
  ];
}

import { Component, ViewEncapsulation, signal } from '@angular/core';

@Component({
  selector: 'app-plantillas',
  encapsulation: ViewEncapsulation.None,
  styles: `.sigec .bub{max-width:300px;padding:10px 14px;border-radius:14px 14px 14px 4px;background:#fff;border:1px solid var(--line)}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Plantillas y alertas internas</h1><p class="sub">Mensajes que n8n envía al paciente y al personal</p></div><span class="sp"></span><a class="btn" href="#/historial">Historial de envíos</a><a class="btn" href="#/historial/preferencias">Mis preferencias</a></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:1 1 240px;max-width:280px">
      <div class="ch"><div class="ct">Plantillas</div></div>
      <div style="padding:0 8px 12px;display:flex;flex-direction:column;gap:2px">
        @for (p of plantillas; track p) {
          <button type="button" class="nav" [style.background]="sel() === p ? 'var(--pri-t)' : ''" [style.color]="sel() === p ? 'var(--pri-d)' : 'var(--ink)'" style="box-shadow:none" (click)="sel.set(p)">{{ p }}</button>
        }
      </div>
    </div>
    <div class="card col" style="flex:999 1 400px;min-width:0;gap:14px">
      <div class="ct">{{ sel() }}</div>
      <div class="field"><label for="as">Asunto del correo</label><input class="in" id="as" value="Su cita fue confirmada"></div>
      <div class="field"><label for="cu">Mensaje</label><textarea class="in" id="cu" rows="4" [value]="mensaje"></textarea><span class="hint">Variables disponibles: &#123;nombre&#125;, &#123;fecha&#125;, &#123;hora&#125;</span></div>
      <div class="banner warn"><div><b>Sin datos clínicos</b><span>Los mensajes no incluyen diagnósticos, estudios ni especialidades sensibles; el detalle se consulta en el portal.</span></div></div>
      <div class="fx"><span class="sp"></span><button type="button" class="btn">Descartar</button><button type="button" class="btn pri">Guardar plantilla</button></div>
    </div>
    <div class="col" style="flex:1 1 320px;max-width:380px;gap:16px">
      <div class="card col" style="gap:10px"><div class="ct">Vista previa · correo</div>
        <div class="card col" style="gap:6px;background:var(--bg)"><div class="b">Su cita fue confirmada</div><div class="ink2">Hola Carla, su cita del 3 de noviembre a las 10:00 fue confirmada. Consulte el detalle en el portal del paciente.</div></div></div>
      <div class="card col" style="gap:10px"><div class="ct">Vista previa · bot de Telegram</div>
        <div class="bub">Tu cita del 3 de noviembre a las 10:00 fue confirmada.</div>
        <div class="sm muted">El paciente vincula el bot con un código de un solo uso desde el portal.</div></div>
    </div>
  </div>
</div>`,
})
export class Plantillas {
  readonly plantillas = ['Confirmación de cita', 'Recordatorio', 'Cancelación', 'Reprogramación', 'Alerta interna al personal'];
  readonly sel = signal('Confirmación de cita');
  readonly mensaje = 'Hola {nombre}, su cita del {fecha} a las {hora} fue confirmada. Consulte el detalle en el portal del paciente.';
}

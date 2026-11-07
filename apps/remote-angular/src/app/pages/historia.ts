import { Component } from '@angular/core';

@Component({
  selector: 'app-historia',
  template: `
<div class="page">
  <div class="card fx wrap" style="gap:18px">
    <div class="av" style="width:56px;height:56px;font-size:20px" aria-hidden="true">CR</div>
    <div><h1 class="h1">Carla Rojas Vaca</h1><div class="ink2">34 años · Femenino · <span class="mono">HC-004218</span></div></div>
    <span class="sp"></span>
    <span class="chip warn">Alergia: penicilina</span>
    <a class="btn pri" href="#/consulta">Nueva consulta</a>
  </div>
  <div class="tabs"><span class="tab on">Consultas</span><span class="tab">Antecedentes</span><span class="tab">Estudios</span><span class="tab">Indicaciones</span><span class="tab">Auditoría</span></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card" style="flex:999 1 560px;min-width:0">
      <div class="ch"><div class="ct">Historial de atención</div><span class="sp"></span><span class="sm muted">Más reciente primero</span></div>
      <div class="tl">
        @for (c of consultas; track c.fecha) {
          <div class="tli"><span class="dot"></span><div style="flex:1">
            <div class="fx wrap"><span class="b">{{ c.fecha }} · {{ c.area }}</span><span class="sp"></span><span class="sm muted">{{ c.medico }}</span></div>
            <div class="ink2" style="margin-top:4px">{{ c.nota }}</div>
            <div class="fx wrap" style="margin-top:8px;gap:8px"><span class="tag">{{ c.dx }}</span>@if (c.estudio) {<span class="chip ok">{{ c.estudio }}</span>}</div>
          </div></div>
        }
      </div>
    </div>
    <div class="col" style="flex:1 1 300px;max-width:380px;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Antecedentes</div></div>
        <div class="li" style="padding:8px 0"><span class="muted" style="min-width:110px">Patológicos</span><span>Asma leve en la infancia</span></div>
        <div class="li" style="padding:8px 0"><span class="muted" style="min-width:110px">Familiares</span><span>Padre con hipertensión</span></div>
        <div class="li" style="padding:8px 0"><span class="muted" style="min-width:110px">Alergias</span><span class="b" style="color:var(--warn)">Penicilina</span></div>
      </div>
      <div class="card"><div class="ch"><div class="ct">Indicaciones vigentes</div></div><p class="ink2">Sin medicación activa.</p></div>
      <div class="banner"><div><b>Acceso registrado</b><span>Cada lectura de esta historia queda en la bitácora de auditoría.</span></div></div>
    </div>
  </div>
</div>`,
})
export class Historia {
  readonly consultas = [
    { fecha: '12 sep 2026', area: 'Medicina general', medico: 'Dr. Rodrigo Egüez', nota: 'Tos persistente de dos semanas, sin fiebre. Se solicita radiografía de tórax.', dx: 'J20.9 Bronquitis aguda', estudio: 'Informe validado: radiografía de tórax' },
    { fecha: '18 mar 2026', area: 'Medicina general', medico: 'Dr. Rodrigo Egüez', nota: 'Control anual. Presión arterial 118/76 mmHg, sin hallazgos.', dx: 'Z00.0 Examen médico general', estudio: '' },
    { fecha: '02 oct 2025', area: 'Medicina general', medico: 'Dra. Mónica Landívar', nota: 'Cuadro gripal. Reposo e hidratación.', dx: 'J06.9 Infección de vías respiratorias altas', estudio: '' },
  ];
}

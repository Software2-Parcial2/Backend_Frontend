import { Component } from '@angular/core';

@Component({
  selector: 'app-agenda-medico',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Mi agenda de hoy</h1><p class="sub">Martes 3 de noviembre de 2026 · Consultorio 3</p></div></div>
  <div class="g3">
    <div class="card kpi"><span class="v">6</span><span class="l">Citas de hoy</span></div>
    <div class="card kpi"><span class="v">3</span><span class="l">Atendidas</span></div>
    <div class="card kpi"><span class="v">1</span><span class="l">Paciente en sala de espera</span></div>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:999 1 560px;min-width:0">
      <div class="ch"><div class="ct">Pacientes del día</div></div>
      <div class="scroll"><table class="tbl">
        <thead><tr><th>Hora</th><th>Paciente</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (c of citas; track c.hora) {
            <tr [class.sel]="c.sel">
              <td class="mono">{{ c.hora }}</td><td class="b">{{ c.paciente }}</td><td class="ink2">{{ c.motivo }}</td>
              <td><span [class]="'chip ' + c.tono">{{ c.estado }}</span></td>
              <td class="tr">@if (c.accion === 'consulta') {<a class="btn s pri" href="#/consulta">Iniciar consulta</a>} @else if (c.accion === 'historia') {<a class="btn s" href="#/historia">Historia</a>} @else {<span class="muted">—</span>}</td>
            </tr>
          }
        </tbody>
      </table></div>
    </div>
    <div class="col" style="flex:1 1 300px;max-width:380px;gap:16px">
      <div class="card col" style="gap:10px">
        <div class="ct">Siguiente paciente</div>
        <div class="fx"><div class="av" aria-hidden="true">CR</div><div><div class="b">Carla Rojas Vaca</div><div class="sm muted">34 años · <span class="mono">HC-004218</span></div></div></div>
        <div class="banner warn"><div><b>Alergia registrada</b><span>Penicilina</span></div></div>
        <a class="btn pri" href="#/consulta">Iniciar consulta</a>
      </div>
      <div class="card col" style="gap:10px">
        <div class="ct">Estudio previo de la paciente</div>
        <div><div class="b">Radiografía de tórax</div><div class="sm muted">18 sep · informe validado</div></div>
        <a class="btn" href="#/resultado">Ver informe</a>
      </div>
    </div>
  </div>
</div>`,
})
export class AgendaMedico {
  readonly citas = [
    { hora: '08:00', paciente: 'Mario Vargas', motivo: 'Control de hipertensión', estado: 'Atendida', tono: '', accion: 'historia', sel: false },
    { hora: '08:30', paciente: 'Ana Suárez', motivo: 'Primera vez', estado: 'Atendida', tono: '', accion: 'historia', sel: false },
    { hora: '09:30', paciente: 'Raúl Peña', motivo: 'Control', estado: 'Atendida', tono: '', accion: 'historia', sel: false },
    { hora: '10:00', paciente: 'Carla Rojas Vaca', motivo: 'Primera vez · dolor torácico', estado: 'En sala de espera', tono: 'pri', accion: 'consulta', sel: true },
    { hora: '11:00', paciente: 'Jaime Ortiz', motivo: 'Control', estado: 'Confirmada', tono: 'ok', accion: 'historia', sel: false },
    { hora: '14:00', paciente: 'Gloria Salas', motivo: 'Electrocardiograma', estado: 'Reserva temporal', tono: 'warn', accion: '', sel: false },
  ];
}

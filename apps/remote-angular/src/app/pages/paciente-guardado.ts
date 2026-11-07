import { Component } from '@angular/core';

@Component({
  selector: 'app-paciente-guardado',
  template: `
<div class="page">
  <div class="banner ok" role="status"><div><b>Paciente registrado</b><span>Daniela Flores Gutiérrez · <span class="mono">HC-006402</span></span></div></div>
  <div class="g2" style="align-items:start">
    <div class="card col" style="gap:14px">
      <div class="ct">Qué sigue</div>
      <a class="btn pri" href="#/reservar" style="height:46px">Reservar una cita para Daniela</a>
      <a class="btn" href="#/pacientes/ficha">Abrir ficha del paciente</a>
      <a class="btn gh" href="#/pacientes/nuevo">Registrar otro paciente</a>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Reintento sin duplicados</div><span class="chip ok">Un solo paciente</span></div>
      <div class="tl">
        <div class="tli"><span class="dot warn"></span><div><div class="b">Primer envío · 10:31:02</div><div class="sm muted">La conexión se cortó antes de recibir la respuesta</div></div></div>
        <div class="tli"><span class="dot"></span><div><div class="b">Reenvío automático · 10:31:09</div><div class="sm muted">Misma clave <span class="mono">7c1e9b52…c6a4</span>; el sistema devolvió el resultado anterior</div></div></div>
        <div class="tli"><span class="dot"></span><div><div class="b">Evento publicado</div><div class="sm muted">«Paciente registrado» salió por Outbox hacia RabbitMQ</div></div></div>
      </div>
    </div>
  </div>
</div>`,
})
export class PacienteGuardado {}

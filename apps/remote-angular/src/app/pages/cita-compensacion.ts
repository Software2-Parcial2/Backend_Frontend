import { Component } from '@angular/core';

@Component({
  selector: 'app-cita-compensacion',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Cita de Daniela Flores</h1><p class="sub">Medicina general · Mar 3 nov 2026 · 10:00 · Dr. Rodrigo Egüez</p></div><span class="chip err">No confirmada</span><span class="sp"></span><a class="btn pri" href="#/reservar">Elegir otro horario</a></div>
  <div class="banner err" role="alert"><div><b>La cita no pudo confirmarse</b><span>Facturación no respondió a tiempo. Se liberó el horario y no quedó ningún cargo activo.</span></div></div>
  <div class="g2" style="align-items:start">
    <div class="card">
      <div class="ch"><div class="ct">Qué pasó en la SAGA</div></div>
      <div class="tl">
        <div class="tli"><span class="dot"></span><div style="flex:1"><div class="fx"><span class="b">1 · MS3 Citas</span><span class="sp"></span><span class="chip ok">Completado</span></div><div class="ink2">Reserva temporal del horario · 10:34:10</div></div></div>
        <div class="tli"><span class="dot err"></span><div style="flex:1"><div class="fx"><span class="b">2 · MS6 Facturación</span><span class="sp"></span><span class="chip err">Falló</span></div><div class="ink2">Sin respuesta en 30 segundos, con 3 reintentos de espera creciente</div></div></div>
        <div class="tli"><span class="dot warn"></span><div style="flex:1"><div class="fx"><span class="b">Compensación · liberar la reserva</span><span class="sp"></span><span class="chip ok">Completada</span></div><div class="ink2">El horario volvió a estar disponible · 10:35:02</div></div></div>
        <div class="tli"><span class="dot mute"></span><div style="flex:1"><div class="fx"><span class="b">3 · MS8 Notificaciones</span><span class="sp"></span><span class="chip">No ejecutado</span></div><div class="ink2">No se envió aviso de confirmación</div></div></div>
      </div>
    </div>
    <div class="col" style="gap:16px">
      <div class="card col" style="gap:8px">
        <div class="ct">Reglas aplicadas</div>
        <div class="li" style="padding:8px 0"><div><div class="b">Falla una operación crítica</div><div class="sm muted">Se anula el cargo provisional y se libera la reserva.</div></div></div>
        <div class="li" style="padding:8px 0"><div><div class="b">Falla solo el aviso</div><div class="sm muted">Se reintenta sin cancelar una cita válida.</div></div></div>
        <div class="li" style="padding:8px 0"><div><div class="b">Trazabilidad</div><div class="sm muted">El cargo anulado conserva su registro.</div></div></div>
      </div>
      <div class="sm muted">Reserva temporal de 10 minutos, 30 segundos por paso y 3 reintentos. Para la demostración los tiempos pueden bajarse a 60 segundos.</div>
    </div>
  </div>
</div>`,
})
export class CitaCompensacion {}

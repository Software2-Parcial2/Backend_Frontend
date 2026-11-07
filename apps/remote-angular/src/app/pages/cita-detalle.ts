import { Component } from '@angular/core';

@Component({
  selector: 'app-cita-detalle',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Cita de Carla Rojas Vaca</h1><p class="sub">Cardiología · Mar 3 nov 2026 · 10:00 · Dra. Valeria Antelo</p></div><span class="chip ok">Confirmada</span><span class="sp"></span><a class="btn" href="#/cita/reprogramar">Reprogramar</a><a class="btn dng" href="#/cita/cancelar">Cancelar cita</a></div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Confirmación por SAGA</div><span class="sp"></span><span class="muted sm">Orquestada por MS3</span></div>
      <div class="tl">
        @for (p of pasos; track p.n) {
          <div class="tli"><span class="dot"></span><div style="flex:1"><div class="fx"><span class="b">{{ p.n }}</span><span class="sp"></span><span class="chip ok">Completado</span></div><div class="ink2">{{ p.t }}</div><div class="sm muted">{{ p.f }}</div></div></div>
        }
      </div>
      <hr class="hr" style="margin:16px 0">
      <div class="sm muted">Cada paso tiene 30 segundos de límite y 3 reintentos con espera creciente. La reserva temporal dura 10 minutos.</div>
    </div>
    <div class="col" style="gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Historial de estados</div></div>
        <div class="tl">
          <div class="tli"><span class="dot"></span><div><div class="b">Confirmada</div><div class="sm muted">03 nov 08:52 · SAGA completada</div></div></div>
          <div class="tli"><span class="dot"></span><div><div class="b">Reserva temporal</div><div class="sm muted">03 nov 08:52 · 10 min de vigencia</div></div></div>
          <div class="tli"><span class="dot mute"></span><div><div class="b">Solicitada</div><div class="sm muted">03 nov 08:49 · desde la PWA, guardada sin conexión</div></div></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Datos de la cita</div></div>
        <div class="fg" style="grid-template-columns:1fr 1fr;row-gap:12px">
          <div><div class="sm muted">Paciente</div><div class="b">Carla Rojas Vaca</div></div>
          <div><div class="sm muted">Cargo</div><div class="b">Bs 180 · pendiente de cobro</div></div>
          <div><div class="sm muted">Consultorio</div><div class="b">Cons. 3</div></div>
          <div><div class="sm muted">Idempotency-Key</div><div class="mono">b84f20d1…8b36</div></div>
        </div>
      </div>
    </div>
  </div>
</div>`,
})
export class CitaDetalle {
  readonly pasos = [
    { n: '1 · MS3 Citas', t: 'Reserva temporal del horario · 08:52:10', f: 'Si falla: liberar la reserva' },
    { n: '2 · MS6 Facturación', t: 'Cargo provisional de Bs 180 · 08:52:11', f: 'Si falla: anular el cargo, conservando la trazabilidad' },
    { n: '3 · MS8 Notificaciones', t: 'Aviso de confirmación por correo y Telegram · 08:52:13', f: 'Si falla: se reintenta; no se cancela una cita válida' },
  ];
}

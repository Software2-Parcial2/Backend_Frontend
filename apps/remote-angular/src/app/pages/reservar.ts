import { Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-reservar',
  encapsulation: ViewEncapsulation.None,
  styles: `
    .sigec .day{flex:1;min-width:84px;padding:10px;border:1px solid var(--bd);border-radius:8px;background:#fff;text-align:center;font-weight:600;cursor:pointer}
    .sigec .day.on{background:var(--pri);border-color:var(--pri);color:#fff}
    .sigec .day small{display:block;font-weight:400;font-size:12px}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Reservar cita</h1><p class="sub">Elija paciente, médico y horario disponible</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">1 · Paciente</div></div>
        <div class="fx"><div class="av" aria-hidden="true">CR</div><div><div class="b">Carla Rojas Vaca</div><div class="sm muted"><span class="mono">HC-004218</span> · 7845123 SC</div></div><span class="sp"></span><a class="btn s" href="#/pacientes">Cambiar</a></div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">2 · Especialidad y médico</div></div>
        <div class="fg">
          <div class="field"><label for="es">Especialidad</label><select class="in" id="es"><option>Cardiología</option></select></div>
          <div class="field"><label for="md">Médico</label><select class="in" id="md"><option>Dra. Valeria Antelo Rojas</option></select></div>
        </div>
      </div>
      <div class="card col" style="gap:14px">
        <div class="ch" style="margin-bottom:0"><div class="ct">3 · Fecha y hora</div><span class="sp"></span><span class="sm muted">Disponibilidad en tiempo real</span></div>
        <div class="fx wrap" style="gap:8px">
          @for (d of dias; track d.n; let i = $index) {<button type="button" class="day" [class.on]="i === dia" (click)="dia = i">{{ d.s }}<small>{{ d.n }}</small></button>}
        </div>
        <div class="fx wrap" style="gap:8px">
          @for (h of horas; track h.h) {<button type="button" class="slot" [class.off]="h.off" [class.on]="!h.off && hora === h.h" [disabled]="h.off" (click)="hora = h.h">{{ h.h }}</button>}
        </div>
        <div class="sm muted">Los horarios tachados ya están ocupados. El sistema impide que dos pacientes ocupen el mismo turno.</div>
      </div>
    </div>
    <div class="card col" style="flex:1 1 320px;max-width:380px;gap:14px">
      <div class="ct">Resumen</div>
      <div class="li" style="padding:6px 0"><span class="muted">Paciente</span><span class="sp"></span><span class="b">Carla Rojas Vaca</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Médico</span><span class="sp"></span><span class="b">Dra. Valeria Antelo</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Fecha</span><span class="sp"></span><span class="b">{{ dias[dia].s }} {{ dias[dia].n }} · {{ hora }}</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Cargo provisional</span><span class="sp"></span><span class="b">Bs 180</span></div>
      <div class="banner warn"><div><b>Reserva temporal de 10 minutos</b><span>El horario se libera si la cita no se confirma a tiempo.</span></div></div>
      <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px;word-break:break-all">b84f20d1-6a7c-4e19-9c3f-51a2d7e08b36</div></div>
      <a class="btn pri" href="#/cita" style="height:46px">Confirmar cita</a>
      <div class="sm muted">Al confirmar, la SAGA coordina la reserva, el cargo provisional y el aviso al paciente.</div>
    </div>
  </div>
</div>`,
})
export class Reservar {
  dia = 0;
  hora = '10:00';
  readonly dias = [
    { s: 'Mar', n: '3 nov' }, { s: 'Mié', n: '4 nov' }, { s: 'Jue', n: '5 nov' }, { s: 'Vie', n: '6 nov' }, { s: 'Lun', n: '9 nov' },
  ];
  readonly horas = [
    { h: '08:00', off: true }, { h: '08:30', off: true }, { h: '09:00', off: false }, { h: '09:30', off: true },
    { h: '10:00', off: false }, { h: '10:30', off: false }, { h: '11:00', off: true }, { h: '11:30', off: false },
  ];
}

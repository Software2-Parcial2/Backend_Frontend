import { Component, ViewEncapsulation } from '@angular/core';

interface Celda { t: 'o' | 'w' | 'f' | 'x'; a?: string; b?: string }
const o = (a: string, b: string): Celda => ({ t: 'o', a, b });
const L: Celda = { t: 'f' };

@Component({
  selector: 'app-agenda',
  encapsulation: ViewEncapsulation.None,
  styles: `
    .sigec .cl{border:1px solid var(--line2);border-radius:6px;padding:6px 8px;font-size:12.5px;min-height:54px;line-height:1.3}
    .sigec .cl.o{background:var(--pri-t);border-color:#BFDDE1}
    .sigec .cl.w{background:var(--warn-t);border-color:#F0D3A5}
    .sigec .cl.f{border:1px dashed var(--bd);color:var(--ink3)}
    .sigec .cl.x{background:var(--line2);color:var(--ink3)}
    .sigec .hd{font-weight:650;font-size:13px;padding:4px 2px}
    .sigec .hr2{font-family:var(--font-mono);font-size:12px;color:var(--ink3);padding-top:6px}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Agenda general</h1><p class="sub">Martes 3 de noviembre de 2026</p></div><span class="sp"></span>
    <div class="fx"><button type="button" class="btn" aria-label="Día anterior">‹</button><button type="button" class="btn">Hoy</button><button type="button" class="btn" aria-label="Día siguiente">›</button></div>
    <a class="btn pri" href="#/reservar">Reservar cita</a></div>
  <div class="fx wrap">
    <select class="in" style="width:200px" aria-label="Especialidad"><option>Todas las especialidades</option></select>
    <select class="in" style="width:180px" aria-label="Consultorio"><option>Todos los consultorios</option></select>
    <span class="sp"></span><span class="chip pri">Confirmada</span><span class="chip warn">Reserva temporal</span><span class="chip">Bloqueado</span>
  </div>
  <div class="card scroll">
    <div style="display:grid;grid-template-columns:64px repeat(4,minmax(150px,1fr));gap:6px;min-width:760px">
      <div></div>
      @for (m of medicos; track m.n) {<div class="hd">{{ m.n }}<div class="sm muted" style="font-weight:400">{{ m.e }}</div></div>}
      @for (f of filas; track f.h) {
        <div class="hr2">{{ f.h }}</div>
        @for (c of f.c; track $index) {
          <div class="cl" [class]="'cl ' + c.t">
            @if (c.t === 'f') { Libre } @else if (c.t === 'x') { {{ c.a }}<br>{{ c.b }} } @else { <b>{{ c.a }}</b><br>{{ c.b }} }
          </div>
        }
      }
    </div>
  </div>
  <a class="btn gh" style="align-self:flex-start" href="#/cita">Ver detalle de la cita de Carla Rojas Vaca</a>
</div>`,
})
export class Agenda {
  readonly medicos = [
    { n: 'Dra. Valeria Antelo', e: 'Cardiología · Cons. 3' },
    { n: 'Dr. Marcelo Suárez', e: 'Neumología · Cons. 5' },
    { n: 'Dr. Rodrigo Egüez', e: 'Medicina general · Cons. 1' },
    { n: 'Dra. Natalia Heredia', e: 'Pediatría · Cons. 2' },
  ];
  readonly filas: { h: string; c: Celda[] }[] = [
    { h: '08:00', c: [o('Mario Vargas', 'Control'), L, o('Elsa Montaño', 'Consulta'), o('Mateo Arias', 'Control niño sano')] },
    { h: '08:30', c: [o('Ana Suárez', 'Primera vez'), o('Pedro Cuéllar', 'Radiografía'), L, L] },
    { h: '09:00', c: [L, o('Gladys Parada', 'Control'), o('Iván Salvatierra', 'Consulta'), o('Sofía Landívar', 'Fiebre')] },
    { h: '09:30', c: [o('Raúl Peña', 'Control'), L, L, { t: 'x', a: 'Bloqueado', b: 'Reunión clínica' }] },
    { h: '10:00', c: [o('Carla Rojas Vaca', 'Primera vez'), o('Wilma Justiniano', 'Control'), { t: 'w', a: 'Daniela Flores', b: 'Reserva 08:52' }, L] },
    { h: '10:30', c: [L, o('Óscar Melgar', 'Consulta'), o('Teresa Mendoza', 'Consulta'), o('Valentina Roca', 'Vacuna')] },
    { h: '11:00', c: [o('Jaime Ortiz', 'Control'), L, L, L] },
    { h: '11:30', c: [L, L, o('Nelson Guzmán', 'Consulta'), L] },
  ];
}

import { Component, signal } from '@angular/core';

interface Dia { dia: string; on: boolean; desde: string; hasta: string; cons: string }

@Component({
  selector: 'app-horarios',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Horarios médicos</h1><p class="sub">Disponibilidad semanal de cada especialista</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:1 1 280px;max-width:320px">
      <div class="ch"><div class="ct">Médicos</div></div>
      <div style="padding:0 8px 12px;display:flex;flex-direction:column;gap:2px">
        @for (m of medicos; track m.ini; let i = $index) {
          <button type="button" class="nav" [style.background]="sel() === i ? 'var(--pri-t)' : ''" [style.color]="sel() === i ? 'var(--pri-d)' : 'var(--ink)'" style="min-height:52px;box-shadow:none" (click)="sel.set(i)">
            <span class="av" aria-hidden="true">{{ m.ini }}</span><span><span class="b" style="display:block">{{ m.n }}</span><span class="sm" style="color:var(--ink3)">{{ m.e }}</span></span>
          </button>
        }
      </div>
    </div>
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card flush">
        <div class="ch"><div class="ct">Horario semanal · {{ medicos[sel()].n }}</div><span class="sp"></span>
          <div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="dur">Duración de la consulta</label><select class="in" id="dur" style="width:110px"><option>30 min</option><option>20 min</option><option>45 min</option></select></div></div>
        <div class="scroll">
          <table class="tbl">
            <thead><tr><th>Día</th><th>Atiende</th><th>Desde</th><th>Hasta</th><th>Consultorio</th></tr></thead>
            <tbody>
              @for (d of dias(); track d.dia; let i = $index) {
                <tr>
                  <td class="b">{{ d.dia }}</td>
                  <td><button type="button" class="sw" [class.on]="d.on" role="switch" [attr.aria-checked]="d.on" [attr.aria-label]="'Atiende el ' + d.dia" (click)="alternar(i)"></button></td>
                  @if (d.on) {
                    <td><input class="in" style="width:100px" [value]="d.desde" [attr.aria-label]="d.dia + ' desde'"></td>
                    <td><input class="in" style="width:100px" [value]="d.hasta" [attr.aria-label]="d.dia + ' hasta'"></td>
                    <td>{{ d.cons }}</td>
                  } @else {<td class="muted">—</td><td class="muted">—</td><td class="muted">—</td>}
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Bloqueos y ausencias</div><span class="sp"></span><button type="button" class="btn s">Agregar bloqueo</button></div>
        <div class="li"><span class="b" style="min-width:150px">Mar 3 nov · 09:30</span><span>Reunión clínica</span><span class="sp"></span><span class="chip">Bloqueo puntual</span></div>
        <div class="li"><span class="b" style="min-width:150px">23 – 27 nov</span><span>Congreso de cardiología</span><span class="sp"></span><span class="chip warn">3 citas por reprogramar</span></div>
      </div>
      <div class="fx"><span class="sp"></span><button type="button" class="btn">Descartar</button><button type="button" class="btn pri">Guardar horarios</button></div>
    </div>
  </div>
</div>`,
})
export class Horarios {
  readonly sel = signal(0);
  readonly medicos = [
    { ini: 'VA', n: 'Dra. Valeria Antelo', e: 'Cardiología' }, { ini: 'MS', n: 'Dr. Marcelo Suárez', e: 'Neumología' },
    { ini: 'RE', n: 'Dr. Rodrigo Egüez', e: 'Medicina general' }, { ini: 'NH', n: 'Dra. Natalia Heredia', e: 'Pediatría' },
  ];
  readonly dias = signal<Dia[]>([
    { dia: 'Lunes', on: true, desde: '08:00', hasta: '12:00', cons: 'Cons. 3' },
    { dia: 'Martes', on: true, desde: '08:00', hasta: '12:00', cons: 'Cons. 3' },
    { dia: 'Miércoles', on: false, desde: '', hasta: '', cons: '' },
    { dia: 'Jueves', on: true, desde: '14:00', hasta: '18:00', cons: 'Cons. 3' },
    { dia: 'Viernes', on: true, desde: '08:00', hasta: '12:00', cons: 'Cons. 3' },
  ]);
  alternar(i: number) { this.dias.update((l) => l.map((d, n) => (n === i ? { ...d, on: !d.on } : d))); }
}

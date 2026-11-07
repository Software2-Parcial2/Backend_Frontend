import { Component, computed, signal } from '@angular/core';

interface Mov { hora: string; comp: string; paciente: string; metodo: string; monto: number; anulado: boolean }

@Component({
  selector: 'app-movimientos',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Movimientos y balance diario</h1><p class="sub">Martes 3 de noviembre de 2026 · Turno mañana</p></div></div>
  <div class="g4">
    <div class="card kpi"><span class="v">Bs 1.440</span><span class="l">Total cobrado</span></div>
    <div class="card kpi"><span class="v">Bs 900</span><span class="l">Efectivo</span></div>
    <div class="card kpi"><span class="v">Bs 360</span><span class="l">Transferencia interna</span></div>
    <div class="card kpi"><span class="v">Bs 180</span><span class="l">Terminal POS</span></div>
  </div>
  <div class="card flush">
    <div class="ch"><div class="ct">Movimientos</div><span class="sp"></span>
      <div class="seg">@for (f of filtros; track f) {<button type="button" [class.on]="filtro() === f" (click)="filtro.set(f)">{{ f }}</button>}</div></div>
    <div class="scroll"><table class="tbl">
      <thead><tr><th>Hora</th><th>Comprobante</th><th>Paciente</th><th>Método</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        @for (m of visibles(); track m.comp) {
          <tr>
            <td class="mono">{{ m.hora }}</td><td class="mono">{{ m.comp }}</td><td class="b">{{ m.paciente }}</td><td>{{ m.metodo }}</td><td class="b">Bs {{ m.monto }}</td>
            <td>@if (m.anulado) {<span class="chip err">Anulado</span>} @else {<span class="chip ok">Pagado</span>}</td>
            <td class="tr">@if (m.anulado) {<span class="muted sm">Cita cancelada</span>} @else {<a class="btn s" href="#/caja/anular">Anular</a>}</td>
          </tr>
        }
      </tbody>
    </table></div>
  </div>
  <div class="sm muted">Un cargo anulado conserva su registro y su motivo para mantener la trazabilidad.</div>
</div>`,
})
export class Movimientos {
  readonly filtros = ['Todos', 'Cobros', 'Anulaciones'];
  readonly filtro = signal('Todos');
  private readonly movs: Mov[] = [
    { hora: '10:21', comp: 'CI-000873', paciente: 'Carla Rojas Vaca', metodo: 'Efectivo', monto: 180, anulado: false },
    { hora: '09:47', comp: 'CI-000871', paciente: 'Mario Vargas', metodo: 'Terminal POS', monto: 180, anulado: false },
    { hora: '09:12', comp: 'CI-000868', paciente: 'Ana Suárez', metodo: 'Transferencia interna', monto: 180, anulado: false },
    { hora: '08:58', comp: 'CI-000866', paciente: 'Sofía Landívar', metodo: '—', monto: 140, anulado: true },
    { hora: '08:40', comp: 'CI-000863', paciente: 'Elsa Montaño', metodo: 'Efectivo', monto: 120, anulado: false },
  ];
  readonly visibles = computed(() => {
    const f = this.filtro();
    return f === 'Cobros' ? this.movs.filter((m) => !m.anulado) : f === 'Anulaciones' ? this.movs.filter((m) => m.anulado) : this.movs;
  });
}

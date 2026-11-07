import { Component, signal } from '@angular/core';

interface Sol { paciente: string; dato: string; actual: string; propuesto: string; cuando: string; mono: boolean; estado?: 'aprobada' | 'rechazada' }

@Component({
  selector: 'app-solicitudes',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Solicitudes de actualización</h1><p class="sub">Cambios de contacto pedidos por pacientes desde su portal</p></div></div>
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Paciente</th><th>Dato</th><th>Actual</th><th>Propuesto</th><th>Solicitado</th><th></th></tr></thead>
    <tbody>
      @for (s of filas(); track s.paciente; let i = $index) {
        <tr>
          <td class="b">{{ s.paciente }}</td><td>{{ s.dato }}</td>
          <td [class.mono]="s.mono">{{ s.actual }}</td><td [class.mono]="s.mono">{{ s.propuesto }}</td><td>{{ s.cuando }}</td>
          <td class="tr">
            @if (s.estado === 'aprobada') {<span class="chip ok">Aprobada</span>}
            @else if (s.estado === 'rechazada') {<span class="chip err">Rechazada</span>}
            @else {<button type="button" class="btn s" (click)="resolver(i, 'rechazada')">Rechazar</button> <button type="button" class="btn s pri" (click)="resolver(i, 'aprobada')">Aprobar</button>}
          </td>
        </tr>
      }
    </tbody>
  </table></div></div>
  <div class="banner"><div><b>Datos protegidos</b><span>Nombre y documento de identidad no se cambian desde el portal; se corrigen en ventanilla.</span></div></div>
</div>`,
})
export class Solicitudes {
  readonly filas = signal<Sol[]>([
    { paciente: 'Carla Rojas Vaca', dato: 'Teléfono', actual: '7 1234567', propuesto: '7 7654321', cuando: 'Hoy 09:12', mono: true },
    { paciente: 'Ernesto Parada', dato: 'Correo', actual: 'e.parada&#64;mail.example'.replace('&#64;', '@'), propuesto: 'eparada@correo.example', cuando: 'Ayer 17:40', mono: false },
    { paciente: 'Lucía Vargas', dato: 'Dirección', actual: 'Av. Banzer 3er anillo', propuesto: 'Calle Los Pinos 120', cuando: 'Ayer 11:05', mono: false },
  ]);
  resolver(i: number, estado: 'aprobada' | 'rechazada') {
    this.filas.update((l) => l.map((s, n) => (n === i ? { ...s, estado } : s)));
  }
}

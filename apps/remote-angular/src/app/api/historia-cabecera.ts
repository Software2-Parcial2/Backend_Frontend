import { Component, input } from '@angular/core';
import type { HistoriaClinica } from './tipos';

/** Titulo y pestañas comunes de las pantallas de la historia clinica. */
@Component({
  selector: 'sigec-historia-cabecera',
  template: `
  <div class="ph"><div><h1 class="h1" data-testid="paciente-nombre">{{ historia().pacienteNombre ?? 'Paciente' }}</h1><p class="sub"><span class="mono">{{ historia().numeroHistoria ?? 'sin número' }}</span></p></div><ng-content /></div>
  <div class="tabs">
    <a class="tab" [class.on]="activa() === 'consultas'" [attr.href]="'#/historia?paciente=' + historia().pacienteId">Consultas</a>
    <a class="tab" [class.on]="activa() === 'detalle'" [attr.href]="'#/historia/detalle?paciente=' + historia().pacienteId">Antecedentes y estudios</a>
    <a class="tab" [class.on]="activa() === 'auditoria'" [attr.href]="'#/historia/auditoria?paciente=' + historia().pacienteId + '&h=' + historia().id">Auditoría</a>
  </div>`,
})
export class HistoriaCabecera {
  readonly historia = input.required<HistoriaClinica>();
  readonly activa = input<'consultas' | 'detalle' | 'auditoria'>('consultas');
}

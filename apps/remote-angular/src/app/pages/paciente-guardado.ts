import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Cargando, ErrorApi } from '../api/estado';
import { recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { Paciente } from '../api/tipos';

@Component({
  selector: 'app-paciente-guardado',
  imports: [Cargando, ErrorApi],
  template: `
<div class="page">
  @if (p.error(); as e) { <sigec-error [error]="e" (reintentar)="p.recargar()" /> }
  @else if (p.datos(); as d) {
  <div class="banner ok" role="status"><div><b>Paciente registrado</b><span>{{ d.nombre }} · <span class="mono">{{ d.numeroHistoria }}</span></span></div></div>
  <div class="g2" style="align-items:start">
    <div class="card col" style="gap:14px">
      <div class="ct">Qué sigue</div>
      <a class="btn pri" [attr.href]="'#/reservar?paciente=' + d.id" style="height:46px">Reservar una cita para {{ primerNombre(d.nombre) }}</a>
      <a class="btn" [attr.href]="'#/pacientes/ficha?id=' + d.id">Abrir ficha del paciente</a>
      <a class="btn gh" href="#/pacientes/nuevo">Registrar otro paciente</a>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Envío sin duplicados</div><span class="chip ok">Un solo paciente</span></div>
      <div class="tl">
        <div class="tli"><span class="dot"></span><div><div class="b">Clave de idempotencia</div><div class="sm muted">Este registro se envió con la clave <span class="mono" data-testid="clave">{{ clave ?? 'no disponible' }}</span>@if (repetida) { — el sistema devolvió el resultado anterior en lugar de crear otro paciente }</div></div></div>
        <div class="tli"><span class="dot"></span><div><div class="b">Evento publicado</div><div class="sm muted">«Paciente registrado» salió por Outbox hacia RabbitMQ; la historia clínica y los avisos se crean a partir de él.</div></div></div>
      </div>
    </div>
  </div>
  } @else { <sigec-cargando etiqueta="Cargando el registro…" /> }
</div>`,
})
export class PacienteGuardado {
  readonly id = parametro('id');
  readonly p = recurso<Paciente>((api, signal) => (this.id() ? api.get<Paciente>(`/api/pacientes/${this.id()}`, { signal }) : null));
  private readonly estado = (inject(Router).getCurrentNavigation()?.extras.state ?? history.state ?? {}) as { clave?: string; repetida?: boolean };
  readonly clave = this.estado.clave;
  readonly repetida = this.estado.repetida === true;
  primerNombre = (n: string) => n.split(' ')[0] ?? n;
}

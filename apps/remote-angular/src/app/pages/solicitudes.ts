import { Component, signal } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, lista } from '../api/recurso';
import type { Solicitud } from '../api/tipos';

const CAMPO = { TELEFONO: 'Teléfono', EMAIL: 'Correo', DIRECCION: 'Dirección' } as const;

@Component({
  selector: 'app-solicitudes',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Solicitudes de actualización</h1><p class="sub">Cambios de contacto pedidos por pacientes desde su portal</p></div></div>
  @if (solicitudes.error(); as e) { <sigec-error [error]="e" (reintentar)="solicitudes.recargar()" /> }
  @else if (solicitudes.cargando()) { <sigec-cargando [filas]="3" etiqueta="Cargando solicitudes…" /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Paciente</th><th>Dato</th><th>Actual</th><th>Propuesto</th><th>Solicitado</th><th></th></tr></thead>
    <tbody>
      @for (s of solicitudes.items(); track s.id) {
        <tr data-testid="fila-solicitud">
          <td class="b">{{ s.pacienteNombre || 'Paciente' }}</td><td>{{ campo(s.campo) }}</td>
          <td [class.mono]="s.campo === 'TELEFONO'">{{ s.valorActual || '—' }}</td><td [class.mono]="s.campo === 'TELEFONO'">{{ s.valorPropuesto }}</td><td>{{ s.solicitadaEn | hace }}</td>
          <td class="tr">
            @if (resueltas()[s.id] === 'APROBADA') {<span class="chip ok">Aprobada</span>}
            @else if (resueltas()[s.id] === 'RECHAZADA') {<span class="chip err">Rechazada</span>}
            @else if (rechazando() === s.id) {<span class="fx"><input class="in" aria-label="Motivo del rechazo" placeholder="Motivo (opcional)" [value]="motivo()" (input)="motivo.set($any($event.target).value)" style="width:200px"><button type="button" class="btn s" (click)="rechazando.set(null)">Volver</button><button type="button" class="btn s dng" [disabled]="resolver.enCurso()" (click)="rechazar(s)">Confirmar rechazo</button></span>}
            @else {<button type="button" class="btn s" [disabled]="resolver.enCurso()" (click)="rechazando.set(s.id)">Rechazar</button> <button type="button" class="btn s pri" [disabled]="resolver.enCurso()" (click)="aprobar(s)">Aprobar</button>}
          </td>
        </tr>
      } @empty {
        <tr><td colspan="6" class="muted" style="text-align:center;padding:28px" data-testid="vacio">No hay solicitudes pendientes.</td></tr>
      }
    </tbody>
  </table></div>
  @if (solicitudes.hayMas()) { <div class="ch" style="justify-content:center"><button type="button" class="btn s" (click)="solicitudes.cargarMas()">Cargar más</button></div> }
  </div>
  }
  @if (resolver.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
  <div class="banner"><div><b>Datos protegidos</b><span>Nombre y documento de identidad no se cambian desde el portal; se corrigen en ventanilla.</span></div></div>
</div>`,
})
export class Solicitudes {
  readonly solicitudes = lista<Solicitud>(() => ({ ruta: '/api/pacientes/solicitudes', query: { estado: 'PENDIENTE' } }));
  readonly resueltas = signal<Record<string, 'APROBADA' | 'RECHAZADA'>>({});
  campo = (c: Solicitud['campo']) => CAMPO[c];

  readonly resolver = accion((api, id: string, que: 'aprobar' | 'rechazar', motivo?: string) =>
    api.post(`/api/pacientes/solicitudes/${id}/${que}`, que === 'rechazar' ? { motivo } : undefined));

  readonly rechazando = signal<string | null>(null);
  readonly motivo = signal('');

  async aprobar(s: Solicitud) {
    await this.resolver.ejecutar(s.id, 'aprobar');
    if (!this.resolver.error()) this.resueltas.update((r) => ({ ...r, [s.id]: 'APROBADA' }));
  }
  async rechazar(s: Solicitud) {
    await this.resolver.ejecutar(s.id, 'rechazar', this.motivo().trim() || undefined);
    if (!this.resolver.error()) {
      this.resueltas.update((r) => ({ ...r, [s.id]: 'RECHAZADA' }));
      this.rechazando.set(null);
      this.motivo.set('');
    }
  }
}

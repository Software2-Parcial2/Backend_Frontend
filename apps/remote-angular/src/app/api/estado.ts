import { Component, input, output } from '@angular/core';
import { ApiError } from '@sigec/api-client';

/** Texto para el usuario segun el tipo de fallo (sin jerga tecnica). */
export function mensajeDeError(e: unknown): { titulo: string; texto: string } {
  if (!(e instanceof ApiError)) return { titulo: 'No se pudo completar la operación', texto: e instanceof Error ? e.message : 'Ocurrió un error inesperado.' };
  switch (e.estado) {
    case 0: return { titulo: 'Sin conexión con el servidor', texto: 'Revise su red e intente de nuevo.' };
    case 401: return { titulo: 'Su sesión venció', texto: 'Vuelva a iniciar sesión para continuar.' };
    case 403: return { titulo: 'No tiene permiso para esto', texto: 'Su rol no incluye esta operación. El intento quedó registrado.' };
    case 404: return { titulo: 'No se encontró', texto: e.detalle ?? 'El registro no existe o fue eliminado.' };
    case 409: return { titulo: 'La operación entra en conflicto', texto: e.detalle ?? 'El estado actual no lo permite.' };
    case 503: return { titulo: 'El servicio no está disponible', texto: e.detalle ?? 'Intente de nuevo en unos minutos.' };
    default: return { titulo: e.estado >= 500 ? 'Error del servidor' : 'No se pudo completar', texto: e.detalle ?? e.message };
  }
}

@Component({
  selector: 'sigec-cargando',
  template: `<div class="card col" style="gap:12px" role="status" aria-live="polite" [attr.aria-label]="etiqueta()">
    @for (f of filas(); track f) { <div [style.width.%]="90 - f * 15" style="height:14px;border-radius:6px;background:var(--line);opacity:.7"></div> }
    <span class="sm muted">{{ etiqueta() }}</span>
  </div>`,
})
export class Cargando {
  readonly etiqueta = input('Cargando…');
  readonly filasN = input(3, { alias: 'filas' });
  filas = () => Array.from({ length: this.filasN() }, (_, i) => i);
}

@Component({
  selector: 'sigec-error',
  template: `<div class="banner err" role="alert">
    <div><b>{{ m().titulo }}</b><span>{{ m().texto }}</span>@if (cid()) {<span class="sm mono" data-testid="correlation-id">Código de soporte: {{ cid() }}</span>}</div>
    @if (reintentable()) { <button type="button" class="btn s" (click)="reintentar.emit()">Reintentar</button> }
  </div>`,
})
export class ErrorApi {
  readonly error = input.required<unknown>();
  readonly reintentable = input(true);
  readonly reintentar = output<void>();
  m = () => mensajeDeError(this.error());
  cid = () => (this.error() instanceof ApiError ? (this.error() as ApiError).correlationId : undefined);
}

@Component({
  selector: 'sigec-vacio',
  template: `<div class="card col muted" style="text-align:center;padding:28px;gap:8px" data-testid="vacio"><span>{{ texto() }}</span><ng-content /></div>`,
})
export class Vacio {
  readonly texto = input.required<string>();
}

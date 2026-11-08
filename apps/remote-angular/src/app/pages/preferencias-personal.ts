import { Component, effect, signal, untracked } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { accion, recurso } from '../api/recurso';

interface PrefPersonal { usuarioId: string; alertas: { sagaCompensada: boolean; notificacionFallida: boolean; colaDeErrores: boolean }; actualizadaEn: string }
type Alertas = PrefPersonal['alertas'];

@Component({
  selector: 'app-preferencias-personal',
  imports: [Cargando, ErrorApi],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Mis preferencias de aviso</h1><p class="sub">Qué alertas internas de la clínica recibe usted</p></div></div>
  @if (pref.error(); as e) { <sigec-error [error]="e" (reintentar)="pref.recargar()" /> }
  @else if (pref.datos()) {
  <div class="card col" style="gap:4px;max-width:640px"><div class="ct" style="margin-bottom:8px">Alertas que recibo</div>
    @for (c of alertas; track c.k) {
      <div class="li"><div><div class="b">{{ c.n }}</div><div class="sm muted">{{ c.d }}</div></div><span class="sp"></span>
        <button type="button" class="sw" [class.on]="v()[c.k]" role="switch" [attr.aria-checked]="v()[c.k]" [attr.aria-label]="c.n" [attr.data-alerta]="c.k" (click)="alternar(c.k)"></button></div>
    }
    <div class="sm muted" style="margin-top:8px">Las alertas llegan por los canales que tenga vinculados (correo y Telegram).</div>
  </div>
  @if (guardar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
  @if (guardado()) { <div class="banner" role="status"><div><b>Preferencias guardadas</b></div></div> }
  <div class="fx" style="justify-content:flex-end"><button type="button" class="btn pri" data-testid="guardar-pref" [disabled]="guardar.enCurso()" (click)="enviar()">Guardar preferencias</button></div>
  } @else { <sigec-cargando [filas]="3" /> }
</div>`,
})
export class PreferenciasPersonal {
  readonly alertas: { k: keyof Alertas; n: string; d: string }[] = [
    { k: 'sagaCompensada', n: 'SAGA con compensación', d: 'Una cita no pudo confirmarse y se deshicieron pasos.' },
    { k: 'notificacionFallida', n: 'Aviso a paciente fallido', d: 'Un correo o mensaje agotó sus reintentos.' },
    { k: 'colaDeErrores', n: 'Cola de errores', d: 'Hay mensajes en la cola de mensajes fallidos.' },
  ];
  readonly pref = recurso<PrefPersonal>((api, signal) => api.get<PrefPersonal>('/api/notificaciones/preferencias/personal/me', { signal }));
  readonly v = signal<Alertas>({ sagaCompensada: true, notificacionFallida: true, colaDeErrores: true });
  readonly guardado = signal(false);
  constructor() { effect(() => { const p = this.pref.datos(); untracked(() => { if (p) this.v.set({ ...p.alertas }); }); }); }
  alternar(k: keyof Alertas) { this.v.update((o) => ({ ...o, [k]: !o[k] })); this.guardado.set(false); }
  readonly guardar = accion(async (api) => { await api.put('/api/notificaciones/preferencias/personal/me', { alertas: this.v() }); return true; });
  async enviar() { if ((await this.guardar.ejecutar()) !== undefined) { this.guardado.set(true); this.pref.recargar(); } }
}

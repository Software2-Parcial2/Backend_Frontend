import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-preferencias-personal',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Mis preferencias de aviso</h1><p class="sub">Cómo recibe usted las alertas internas de la clínica</p></div></div>
  <div class="g2" style="align-items:start">
    <div class="card col" style="gap:4px"><div class="ct" style="margin-bottom:8px">Canales</div>
      @for (c of canales; track c.k) {
        <div class="li"><div><div class="b">{{ c.n }}</div><div class="sm muted">{{ c.d }}</div></div><span class="sp"></span>
          <button type="button" class="sw" [class.on]="v()[c.k]" role="switch" [attr.aria-checked]="v()[c.k]" [attr.aria-label]="c.n" (click)="alternar(c.k)"></button></div>
      }
    </div>
    <div class="card col" style="gap:4px"><div class="ct" style="margin-bottom:8px">Alertas que recibo</div>
      @for (c of alertas; track c.k) {
        <div class="li"><span>{{ c.n }}</span><span class="sp"></span>
          <button type="button" class="sw" [class.on]="v()[c.k]" role="switch" [attr.aria-checked]="v()[c.k]" [attr.aria-label]="c.n" (click)="alternar(c.k)"></button></div>
      }
    </div>
  </div>
  <div class="fx" style="justify-content:flex-end"><a class="btn pri" href="#/historial">Guardar preferencias</a></div>
</div>`,
})
export class PreferenciasPersonal {
  readonly canales = [{ k: 'correo', n: 'Correo', d: 'elena.camacho&#64;clinicasc.example'.replace('&#64;', '@') }, { k: 'telegram', n: 'Telegram', d: 'Cuenta vinculada' }];
  readonly alertas = [{ k: 'sinResp', n: 'Servicio sin respuesta' }, { k: 'saga', n: 'SAGA con compensación' }, { k: 'resumen', n: 'Resumen diario de la clínica' }];
  readonly v = signal<Record<string, boolean>>({ correo: true, telegram: true, sinResp: true, saga: true, resumen: false });
  alternar(k: string) { this.v.update((o) => ({ ...o, [k]: !o[k] })); }
}

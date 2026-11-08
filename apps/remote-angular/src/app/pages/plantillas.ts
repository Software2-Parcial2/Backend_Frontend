import { Component, ViewEncapsulation, computed, effect, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nuevaIntencion } from '@sigec/api-client';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { textoTipoAviso, type Plantilla, type VistaPrevia } from '../api/tipos';

@Component({
  selector: 'app-plantillas',
  encapsulation: ViewEncapsulation.None,
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  styles: `.sigec .bub{max-width:300px;padding:10px 14px;border-radius:14px 14px 14px 4px;background:#fff;border:1px solid var(--line)}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Plantillas y alertas internas</h1><p class="sub">Mensajes que n8n envía al paciente y al personal</p></div><span class="sp"></span><a class="btn" href="#/historial">Historial de envíos</a><a class="btn" href="#/historial/preferencias">Mis preferencias</a></div>
  @if (todas.error(); as e) { <sigec-error [error]="e" (reintentar)="todas.recargar()" /> }
  @else if (todas.datos(); as lista) {
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:1 1 240px;max-width:280px">
      <div class="ch"><div class="ct">Plantillas</div></div>
      <div style="padding:0 8px 12px;display:flex;flex-direction:column;gap:2px">
        @for (p of lista; track p.tipo + p.canal) {
          <button type="button" class="nav" data-testid="plantilla" [style.background]="clave(p) === sel() ? 'var(--pri-t)' : ''" [style.color]="clave(p) === sel() ? 'var(--pri-d)' : 'var(--ink)'" style="box-shadow:none" (click)="sel.set(clave(p))">{{ texto(p.tipo) }} · {{ p.canal === 'EMAIL' ? 'Correo' : 'Telegram' }}</button>
        }
      </div>
    </div>
    @if (actual(); as p) {
    <div class="card col" style="flex:999 1 400px;min-width:0;gap:14px">
      <div class="fx"><div class="ct">{{ texto(p.tipo) }} · {{ p.canal === 'EMAIL' ? 'correo' : 'Telegram' }}</div><span class="sp"></span><span class="chip" data-testid="version">{{ p.deFabrica ? 'De fábrica' : 'Versión ' + p.version }}</span></div>
      <div class="field"><label for="as">Asunto</label><input class="in" id="as" [ngModel]="asunto()" (ngModelChange)="asunto.set($event)" maxlength="150"></div>
      <div class="field"><label for="cu">Mensaje</label><textarea class="in" id="cu" rows="4" [ngModel]="cuerpo()" (ngModelChange)="cuerpo.set($event)" maxlength="1500"></textarea><span class="hint">Variables disponibles: {{ variables }}</span></div>
      <div class="banner warn"><div><b>Sin datos clínicos</b><span>Los mensajes no incluyen diagnósticos, estudios ni especialidades; el servidor rechaza ese contenido.</span></div></div>
      @if (guardar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" />
        @if (e.estado === 409) { <button type="button" class="btn" data-testid="cargar-vigente" (click)="cargarVigente()">Cargar la versión vigente</button> } }
      @if (guardado()) { <div class="banner" role="status"><div><b>Plantilla guardada</b></div></div> }
      <div class="fx"><span class="sp"></span><button type="button" class="btn" (click)="descartar()" [disabled]="!sucio()">Descartar</button><button type="button" class="btn pri" data-testid="guardar-plantilla" [disabled]="!sucio() || guardar.enCurso()" (click)="enviar()">Guardar plantilla</button></div>
    </div>
    <div class="col" style="flex:1 1 320px;max-width:380px;gap:16px">
      <div class="card col" style="gap:10px"><div class="ct">Vista previa</div>
        @if (previa.datos(); as v) { <div class="card col" style="gap:6px;background:var(--bg)"><div class="b" data-testid="previa-asunto">{{ v.asunto }}</div><div class="ink2" style="white-space:pre-line" data-testid="previa-texto">{{ v.texto }}</div></div> }
        @else if (previa.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        @else { <sigec-cargando [filas]="2" /> }
        <div class="sm muted">Se renderiza con datos de ejemplo; no se guarda.</div></div>
    </div>
    }
  </div>
  } @else { <sigec-cargando [filas]="4" /> }
</div>`,
})
export class Plantillas {
  readonly todas = recurso<Plantilla[]>((api, signal) => api.get<{ items: Plantilla[] }>('/api/notificaciones/plantillas', { signal }).then((r) => r.items));
  readonly variables = '{' + '{nombre}}, {' + '{fecha}}, {' + '{hora}}, {' + '{cuando}}';
  readonly sel = signal('');
  readonly asunto = signal('');
  readonly cuerpo = signal('');
  readonly guardado = signal(false);
  readonly actual = computed(() => this.todas.datos()?.find((p) => this.clave(p) === this.sel()));
  readonly sucio = computed(() => !!this.actual() && (this.asunto() !== this.actual()!.asunto || this.cuerpo() !== this.actual()!.cuerpo));
  private intencion = nuevaIntencion();
  readonly previa = recurso<VistaPrevia>((api, signal) => {
    const p = this.actual();
    if (!p) return null;
    return api.post<VistaPrevia>(`/api/notificaciones/plantillas/${p.tipo}/vista-previa`, { canal: p.canal, asunto: this.asunto(), cuerpo: this.cuerpo(), nombre: 'Carla' }, { signal, clave: false });
  });
  clave = (p: Plantilla) => `${p.tipo}|${p.canal}`;
  texto = textoTipoAviso;

  constructor() {
    effect(() => { const l = this.todas.datos(); untracked(() => { if (l?.length && !this.sel()) this.sel.set(this.clave(l[0]!)); }); });
    effect(() => { const p = this.actual(); untracked(() => { if (p) { this.asunto.set(p.asunto); this.cuerpo.set(p.cuerpo); this.intencion = nuevaIntencion(); } }); });
    effect(() => { this.sel(); untracked(() => this.guardado.set(false)); });
  }
  cargarVigente() { this.guardar.limpiar(); this.todas.recargar(); }
  descartar() { const p = this.actual(); if (p) { this.asunto.set(p.asunto); this.cuerpo.set(p.cuerpo); } }

  readonly guardar = accion((api) => {
    const p = this.actual()!;
    return api.put(`/api/notificaciones/plantillas/${p.tipo}`, { canal: p.canal, asunto: this.asunto().trim(), cuerpo: this.cuerpo().trim() }, { ifMatch: p.version, clave: this.intencion.clave });
  });
  async enviar() {
    this.guardado.set(false);
    if ((await this.guardar.ejecutar()) !== undefined) { this.todas.recargar(); this.guardado.set(true); }
  }
}

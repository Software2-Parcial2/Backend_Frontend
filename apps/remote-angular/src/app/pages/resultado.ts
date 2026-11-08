import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { nuevaIntencion } from '@sigec/api-client';
import { Router } from '@angular/router';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { estadoEstudio, type Imagen } from '../api/tipos';
import { ContextStore } from '../context';
import { ApiService } from '../api/api.service';

@Component({
  selector: 'app-resultado',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  @if (!id()) { <sigec-vacio texto="Abra un estudio desde la bandeja."><a class="btn pri" href="#/estudios">Ir a estudios</a></sigec-vacio> }
  @else if (img.error(); as e) { <sigec-error [error]="e" (reintentar)="img.recargar()" /> }
  @else if (img.datos(); as i) {
  <div class="ph"><div><h1 class="h1">Radiografía de tórax · {{ i.pacienteNombre ?? 'Paciente' }}</h1><p class="sub">Cargada el {{ i.creadaEn | fechaHora }} · <span class="mono">{{ i.numeroHistoria ?? 'sin N.° de historia' }}</span></p></div>
    <span [class]="'chip ' + est(i).tono" data-testid="estado-estudio">{{ est(i).texto }}</span></div>
  <div class="disc"><span class="b">Resultado de apoyo.</span><span>{{ i.aviso }}</span></div>
  <div class="g2">
    <div class="card col" style="gap:10px"><div class="ct">Radiografía original</div>
      @if (urlOriginal(); as u) { <img [src]="u" alt="Radiografía original" style="max-width:100%;max-height:380px;object-fit:contain;background:#000;border-radius:8px" data-testid="img-original"> } @else { <div class="xray" style="height:380px">Cargando imagen…</div> }</div>
    <div class="card col" style="gap:10px">
      <div class="fx"><div class="ct">Regiones de interés · Grad-CAM</div><span class="sp"></span><span class="sm muted">Mapa de calor</span></div>
      @if (urlGradcam(); as u) { <img [src]="u" alt="Mapa de calor Grad-CAM" style="max-width:100%;max-height:380px;object-fit:contain;background:#000;border-radius:8px"> }
      @else { <div class="xray" style="height:380px;text-align:center;padding:20px">{{ i.tieneGradcam ? 'Cargando mapa…' : 'El análisis no generó un mapa de calor para este estudio.' }}</div> }
    </div>
  </div>
  <div class="g2">
    <div class="card col" style="gap:12px">
      <div class="ct">Clasificación del modelo</div>
      @if (i.resultado?.probabilidad_neumonia !== undefined) {
        <div><div class="fx"><span class="b">PNEUMONIA</span><span class="sp"></span><span class="b" data-testid="prob">{{ pct(i.resultado!.probabilidad_neumonia!) }} %</span></div><div class="pb" style="margin-top:6px;height:10px" role="img"><i [style.width.%]="pct(i.resultado!.probabilidad_neumonia!)"></i></div></div>
        <div><div class="fx"><span class="b">NORMAL</span><span class="sp"></span><span class="b">{{ 100 - pct(i.resultado!.probabilidad_neumonia!) }} %</span></div><div class="pb" style="margin-top:6px;height:10px" role="img"><i [style.width.%]="100 - pct(i.resultado!.probabilidad_neumonia!)" style="background:var(--bd)"></i></div></div>
      } @else { <p class="ink2">{{ i.error ?? 'El análisis todavía no termina.' }}</p> }
      <hr class="hr">
      <div class="sm muted">Modelo {{ i.resultado?.modelo ?? '—' }} {{ i.resultado?.version_modelo ?? '' }} · huella <span class="mono">{{ i.hashSha256.slice(0, 12) }}…</span>. {{ i.resultado?.aviso ?? '' }}</div>
    </div>
    <div class="card col" style="gap:12px">
      <div class="ct">Validación médica</div>
      @if (i.informe; as inf) {
        <div class="fx"><span class="chip ok">{{ inf.decision }}</span><span class="sm muted">{{ inf.validadoEn | fechaHora }}</span></div>
        <div style="white-space:pre-line" data-testid="informe">{{ inf.texto }}</div>
        <div class="sm muted">Firma digital <span class="mono">{{ inf.huella.slice(0, 12) }}…</span> · modelo {{ inf.versionModelo }}</div>
      } @else if (puedeValidar()) {
        <div class="seg" style="align-self:flex-start">
          @for (d of decisiones; track d.v) {<button type="button" [class.on]="decision() === d.v" (click)="decision.set(d.v)">{{ d.t }}</button>}
        </div>
        <div class="field"><label for="inf">Informe del médico</label><textarea class="in" id="inf" rows="3" [ngModel]="informe()" (ngModelChange)="informe.set($event)"></textarea></div>
        @if (validar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        <button type="button" class="btn pri" style="height:46px" data-testid="validar" [disabled]="validar.enCurso() || !informe().trim()" (click)="firmar()">Firmar y agregar a la historia clínica</button>
        <div class="sm muted">Ningún resultado llega a la historia clínica sin esta firma. Se registra la versión del modelo y la huella del archivo.</div>
      } @else { <p class="ink2">{{ i.estado === 'ANALIZADA' ? 'Pendiente de validación médica.' : 'El análisis todavía no termina; podrá validarse cuando esté listo.' }}</p> }
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" etiqueta="Cargando el estudio…" /> }
</div>`,
})
export class Resultado {
  private readonly ctx = inject(ContextStore);
  private readonly router = inject(Router);
  private readonly cliente = inject(ApiService).cliente;
  readonly id = parametro('id');
  readonly img = recurso<Imagen>((api, signal) => (this.id() ? api.get<Imagen>(`/api/imagenes/${this.id()}`, { signal }) : null));
  readonly urlOriginal = signal<string | null>(null);
  readonly urlGradcam = signal<string | null>(null);
  readonly decisiones = [{ v: 'CONFIRMA', t: 'Confirmo el hallazgo' }, { v: 'MODIFICA', t: 'Lo modifico' }, { v: 'DESCARTA', t: 'Lo descarto' }];
  readonly decision = signal('CONFIRMA');
  readonly informe = signal('');
  readonly puedeValidar = computed(() => (this.ctx.ctx()?.roles ?? []).includes('medico') && this.img.datos()?.estado === 'ANALIZADA' && this.img.datos()?.validacion === 'PENDIENTE');
  private readonly intencion = nuevaIntencion();
  est = estadoEstudio;
  pct = (p: number) => Math.round(p * 100);

  constructor() {
    effect(() => {
      const i = this.img.datos();
      untracked(() => {
        if (!i) return;
        void this.cliente.get<{ url: string }>(`/api/imagenes/${i.id}/url`).then((r) => this.urlOriginal.set(r.url)).catch(() => this.urlOriginal.set(null));
        if (i.tieneGradcam) void this.cliente.get<{ url: string }>(`/api/imagenes/${i.id}/gradcam-url`).then((r) => this.urlGradcam.set(r.url)).catch(() => this.urlGradcam.set(null));
      });
    });
  }

  readonly validar = accion((api) => api.post(`/api/imagenes/${this.id()}/validacion`, { decision: this.decision(), informe: this.informe().trim() }, { clave: this.intencion.clave }));
  async firmar() {
    if ((await this.validar.ejecutar()) !== undefined) { this.img.recargar(); await this.router.navigate(['/estudios']); }
  }
}

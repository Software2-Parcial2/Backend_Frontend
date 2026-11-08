import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiError, nuevaIntencion } from '@sigec/api-client';
import { ErrorApi } from '../api/estado';
import { accion, conRetraso, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { Imagen, Paciente } from '../api/tipos';

const TIPOS = ['image/png', 'image/jpeg', 'application/dicom'];
const MAX_MB = 20;

async function sha256(archivo: File): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

@Component({
  selector: 'app-estudio-cargar',
  imports: [ErrorApi, FormsModule],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Cargar radiografía de tórax</h1><p class="sub">Se revisa el archivo en este equipo antes de enviarse al servidor</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card" style="border-style:dashed;border-color:var(--bd)">
        <div class="fx wrap" style="gap:18px">
          <div class="xray" style="width:150px;height:150px;flex:none;overflow:hidden">@if (vista()) { <img [src]="vista()!" alt="Vista previa" style="width:100%;height:100%;object-fit:cover"> } @else { Vista previa }</div>
          <div class="col" style="gap:6px;flex:1 1 240px">
            <div class="b" style="font-size:16px" data-testid="nombre-archivo">{{ archivo()?.name ?? 'Ningún archivo elegido' }}</div>
            @if (archivo(); as a) { <div class="muted">{{ a.type || 'tipo desconocido' }} · {{ tamano(a.size) }}</div> }
            <label class="btn s" style="width:fit-content">{{ archivo() ? 'Cambiar archivo' : 'Elegir archivo' }}<input type="file" accept="image/png,image/jpeg,.dcm,application/dicom" data-testid="archivo" style="display:none" (change)="elegir($event)"></label>
            <span class="sm muted">Se aceptan DICOM, PNG y JPEG en 2D, hasta {{ maxMb }} MB</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Verificaciones</div></div>
        <div class="li" style="align-items:flex-start"><span [class]="'chip ' + (formatoOk() === null ? '' : formatoOk() ? 'ok' : 'err')">{{ formatoOk() === null ? 'Pendiente' : formatoOk() ? 'Listo' : 'Rechazado' }}</span><div style="flex:1"><div class="b">En este equipo: formato y tamaño</div><div class="sm muted">{{ problemaLocal() ?? 'PNG, JPEG o DICOM de hasta ' + maxMb + ' MB. La clasificación de contenido la hace el servidor.' }}</div></div></div>
        <div class="li" style="align-items:flex-start"><span [class]="'chip ' + (huella() ? 'ok' : '')">{{ huella() ? 'Listo' : 'Pendiente' }}</span><div style="flex:1"><div class="b">Huella SHA-256 del archivo</div><div class="mono muted" style="word-break:break-all" data-testid="huella">{{ huella() ?? '—' }}</div><div class="sm muted">El servidor rechaza un archivo idéntico cargado antes para el mismo paciente.</div></div></div>
        <div class="li" style="align-items:flex-start"><span [class]="'chip ' + (subir.enCurso() ? 'info' : '')">{{ subir.enCurso() ? 'En curso' : 'Pendiente' }}</span><div style="flex:1"><div class="b">Subida a almacenamiento privado y análisis con IA</div></div></div>
      </div>
    </div>
    <div class="card col" style="flex:1 1 320px;max-width:400px;gap:14px">
      <div class="ct">Datos del estudio</div>
      <div class="field"><label for="pc">Paciente</label>
        @if (paciente(); as p) { <div class="fx" data-testid="paciente-elegido"><span class="b">{{ p.nombre }} · {{ p.numeroHistoria }}</span><span class="sp"></span><button type="button" class="btn s" (click)="quitarPaciente()">Cambiar</button></div> }
        @else {
          <input class="in" id="pc" placeholder="Nombre, documento o N.° de historia" [ngModel]="busca()" (ngModelChange)="busca.set($event)" autocomplete="off">
          @for (p of candidatos.datos() ?? []; track p.id) { <button type="button" class="btn s" style="justify-content:flex-start" data-testid="candidato" (click)="elegirPaciente(p)">{{ p.nombre }} · {{ p.numeroHistoria }}</button> }
        }
      </div>
      <div class="field"><label for="te">Tipo de estudio</label><select class="in" id="te" [ngModel]="estudio()" (ngModelChange)="estudio.set($event)"><option value="radiografia-torax">Radiografía de tórax</option></select></div>
      <div class="field"><label for="ob">Observaciones</label><textarea class="in" id="ob" rows="3" [ngModel]="obs()" (ngModelChange)="obs.set($event)"></textarea></div>
      <div class="banner"><div><b>Resultado de apoyo</b><span>La IA no emite un diagnóstico; lo interpreta un médico.</span></div></div>
      @if (subir.error(); as e) { <sigec-error [error]="e" [reintentable]="false" />
        @if (duplicada()) { <a class="btn" [attr.href]="'#/estudios'">Ver la bandeja de estudios</a> } }
      <button type="button" class="btn pri" style="height:46px" data-testid="subir" [disabled]="!listo() || subir.enCurso()" (click)="enviar()">Subir y solicitar análisis</button>
    </div>
  </div>
</div>`,
})
export class EstudioCargar {
  private readonly router = inject(Router);
  readonly maxMb = MAX_MB;
  readonly archivo = signal<File | null>(null);
  readonly vista = signal<string | null>(null);
  readonly huella = signal<string | null>(null);
  readonly problemaLocal = signal<string | null>(null);
  readonly paciente = signal<Paciente | null>(null);
  readonly pacienteQuery = parametro('paciente');
  readonly busca = signal('');
  private readonly buscaRetraso = conRetraso(this.busca);
  readonly estudio = signal('radiografia-torax');
  readonly obs = signal('');
  private readonly intencion = nuevaIntencion();
  private claveDe = '';

  readonly candidatos = recurso<Paciente[]>((api, signal) => {
    const q = this.buscaRetraso().trim();
    if (this.paciente() || q.length < 2) return null;
    return api.pagina<Paciente>('/api/pacientes', { query: { q, tipo: /^HC-/i.test(q) ? 'historia' : /^\d|SEED/i.test(q) ? 'documento' : 'nombre' }, limite: 5, signal }).then((p) => p.items);
  });
  readonly formatoOk = computed(() => (this.archivo() ? this.problemaLocal() === null : null));
  readonly duplicada = computed(() => (this.subir.error() as ApiError | null)?.code === 'IMAGEN_DUPLICADA');
  readonly listo = computed(() => !!this.archivo() && this.problemaLocal() === null && !!this.paciente() && !!this.huella());

  constructor() {
    inject(DestroyRef).onDestroy(() => { const v = this.vista(); if (v) URL.revokeObjectURL(v); });
    const pid = this.pacienteQuery();
    if (pid) void inject(CargaPaciente).cargar(pid).then((p) => p && this.paciente.set(p));
  }

  tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  elegirPaciente(p: Paciente) { this.paciente.set(p); }
  quitarPaciente() { this.paciente.set(null); }

  async elegir(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const viejo = this.vista(); if (viejo) URL.revokeObjectURL(viejo);
    this.archivo.set(f); this.huella.set(null); this.vista.set(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    const esDicom = f.name.toLowerCase().endsWith('.dcm') || f.type === 'application/dicom';
    this.problemaLocal.set(!(TIPOS.includes(f.type) || esDicom) ? 'Formato no admitido: suba PNG, JPEG o DICOM.' : f.size > MAX_MB * 1024 * 1024 ? `El archivo supera ${MAX_MB} MB.` : f.size === 0 ? 'El archivo está vacío.' : null);
    if (this.problemaLocal()) { void this.router.navigate(['/estudios/rechazada'], { queryParams: { motivo: this.problemaLocal(), archivo: f.name } }); return; }
    this.huella.set(await sha256(f));
  }

  readonly subir = accion(async (api) => {
    const f = this.archivo()!;
    const clave = this.huella()! + this.paciente()!.id; // mismo archivo y paciente = misma intencion
    if (clave !== this.claveDe) { this.intencion.renovar(); this.claveDe = clave; }
    const fd = new FormData();
    fd.append('archivo', f);
    fd.append('pacienteId', this.paciente()!.id);
    fd.append('estudio', this.estudio());
    if (this.obs().trim()) fd.append('observaciones', this.obs().trim());
    const r = await api.subir<Imagen>('/api/imagenes', fd, { clave: this.intencion.clave });
    await this.router.navigate(['/resultado'], { queryParams: { id: r.datos.id } });
    return r.datos;
  });
  enviar() { return this.subir.ejecutar(); }
}

import { Injectable } from '@angular/core';
import { ApiService } from '../api/api.service';
@Injectable({ providedIn: 'root' })
export class CargaPaciente {
  private readonly api = inject(ApiService).cliente;
  cargar(id: string) { return this.api.get<Paciente>(`/api/pacientes/${id}`).catch(() => null); }
}

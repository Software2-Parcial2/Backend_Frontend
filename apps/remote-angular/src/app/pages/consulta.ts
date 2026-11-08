import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { nuevaIntencion } from '@sigec/api-client';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { ApiService } from "../api/api.service";
import { HistoriaService, VITALES } from '../api/historia.service';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { Antecedente, Consulta as ConsultaT, Evolucion, HistoriaClinica } from '../api/tipos';

interface Fila { medicamento: string; dosis: string; frecuencia: string; duracion: string }

@Component({
  selector: 'app-consulta',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  @if (!id() && !pacienteId()) { <sigec-vacio texto="Inicie la consulta desde la agenda o desde la historia del paciente."><a class="btn pri" href="#/pacientes">Buscar paciente</a></sigec-vacio> }
  @else if (cargaError(); as e) { <sigec-error [error]="e" (reintentar)="recargarTodo()" /> }
  @else if (historia(); as h) {
  <div class="ph"><div><h1 class="h1">Consulta · {{ h.pacienteNombre }}</h1><p class="sub">{{ fecha() | fecha }} · {{ medico() }}</p></div><span class="sp"></span>
    @for (a of alergias(); track a.id) { <span class="chip warn">Alergia: {{ a.descripcion }}</span> }</div>
  @if (aplicado()) { <div class="banner warn" role="status"><div><b>Sus cambios se reaplicaron</b><span>Se cargaron sobre la versión vigente. Revíselos y guarde.</span></div></div> }
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Motivo de consulta</div></div>
        <div class="field"><label for="mo">Motivo</label><input class="in" id="mo" type="text" [ngModel]="motivo()" (ngModelChange)="motivo.set($event); sucio.set(true)" [disabled]="soloLectura()" maxlength="500"></div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Signos vitales</div></div>
        <div class="fg" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
          @for (v of vitales; track v.id) {<div class="field"><label [for]="v.id">{{ v.l }}</label><input class="in" [id]="v.id" [ngModel]="signos()[v.id] ?? ''" (ngModelChange)="cambiarSigno(v.id, $event)" [disabled]="soloLectura()"></div>}
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Diagnóstico y tratamiento</div></div>
        <div class="col" style="gap:14px">
          <div class="field"><label for="dx">Diagnóstico</label><input class="in" id="dx" [ngModel]="diagnostico()" (ngModelChange)="diagnostico.set($event); sucio.set(true)" [disabled]="soloLectura()"></div>
          <div class="field"><label for="tr">Tratamiento</label><textarea class="in" id="tr" rows="2" [ngModel]="tratamiento()" (ngModelChange)="tratamiento.set($event); sucio.set(true)" [disabled]="soloLectura()"></textarea></div>
          <div class="field"><label for="in">Indicaciones</label><textarea class="in" id="in" rows="2" [ngModel]="indicaciones()" (ngModelChange)="indicaciones.set($event); sucio.set(true)" [disabled]="soloLectura()"></textarea></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Receta</div><span class="sp"></span>@if (!soloLectura()) {<button type="button" class="btn s" data-testid="agregar-fila" (click)="agregarFila()">Agregar medicamento</button>}</div>
        <div class="scroll"><table class="tbl" style="min-width:520px"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Duración</th><th></th></tr></thead>
          <tbody>
            @for (f of receta(); track $index) {
              <tr data-testid="fila-receta">
                <td><input class="in" [ngModel]="f.medicamento" (ngModelChange)="cambiarFila($index, 'medicamento', $event)" [disabled]="soloLectura()" aria-label="Medicamento"></td>
                <td><input class="in" [ngModel]="f.dosis" (ngModelChange)="cambiarFila($index, 'dosis', $event)" [disabled]="soloLectura()" aria-label="Dosis"></td>
                <td><input class="in" [ngModel]="f.frecuencia" (ngModelChange)="cambiarFila($index, 'frecuencia', $event)" [disabled]="soloLectura()" aria-label="Frecuencia"></td>
                <td><input class="in" [ngModel]="f.duracion" (ngModelChange)="cambiarFila($index, 'duracion', $event)" [disabled]="soloLectura()" aria-label="Duración"></td>
                <td>@if (!soloLectura()) {<button type="button" class="btn s" (click)="quitarFila($index)">Quitar</button>}</td>
              </tr>
            } @empty { <tr><td colspan="5" class="muted">Sin medicamentos.</td></tr> }
          </tbody></table></div>
      </div>
      @if (firmada()) {
        <div class="card">
          <div class="ch"><div class="ct">Evoluciones</div></div>
          @for (e of evoluciones.datos() ?? []; track e.id) { <div class="li" style="padding:8px 0" data-testid="evolucion"><span>{{ e.nota }}</span><span class="sp"></span><span class="sm muted">{{ e.fecha | fechaHora }}</span></div> }
            @empty { <p class="ink2">Sin evoluciones.</p> }
          @if (esAutor()) {
            <div class="field"><label for="ev">Nueva nota de evolución</label><textarea class="in" id="ev" rows="2" [ngModel]="nota()" (ngModelChange)="nota.set($event)"></textarea></div>
            @if (anotar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
            <button type="button" class="btn" data-testid="agregar-evolucion" [disabled]="!nota().trim() || anotar.enCurso()" (click)="evolucionar()">Agregar nota</button>
          }
        </div>
      }
    </div>
    <div class="col" style="flex:1 1 280px;max-width:340px;gap:16px">
      <div class="card col">
        <div class="fx"><div class="ct">Registro</div><span class="sp"></span><span [class]="'chip ' + (firmada() ? 'ok' : 'warn')" data-testid="estado-consulta">{{ firmada() ? 'Firmada' : 'Borrador' }}</span></div>
        <div class="li" style="padding:6px 0"><span class="muted">Versión</span><span class="sp"></span><span class="mono" data-testid="version">v{{ version() }}</span></div>
        @if (guardadaEn()) { <div class="li" style="padding:6px 0"><span class="muted">Guardado</span><span class="sp"></span><span>{{ guardadaEn() | hace }}</span></div> }
        @if (guardar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        @if (firmar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        @if (errorValidacion(); as m) { <div class="banner err" role="alert"><div>{{ m }}</div></div> }
        @if (!soloLectura()) {
          <button type="button" class="btn" data-testid="guardar" [disabled]="guardar.enCurso() || !motivo().trim()" (click)="guardarBorrador()">Guardar borrador</button>
          @if (id()) { <button type="button" class="btn pri" data-testid="firmar" style="height:46px" [disabled]="firmar.enCurso() || guardar.enCurso()" (click)="firmarYCerrar()">Firmar y cerrar consulta</button> }
        } @else { <a class="btn" [attr.href]="'#/historia?paciente=' + h.pacienteId">Volver a la historia</a>
          <a class="btn pri" [attr.href]="'#/historia/receta?id=' + id()">Ver receta</a> }
      </div>
      <div class="banner"><div><b>Edición protegida</b><span>Requiere conexión. Si otro profesional modifica el registro, se le avisará en lugar de sobrescribir.</span></div></div>
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" etiqueta="Cargando la consulta…" /> }
</div>`,
})
export class Consulta {
  private readonly api = inject(HistoriaService);
  private readonly router = inject(Router);
  private readonly catalogo = inject(CatalogoService);
  readonly id = parametro('id');
  readonly pacienteId = parametro('paciente');
  readonly citaId = parametro('cita');
  readonly vitales = VITALES;

  readonly existente = recurso<ConsultaT>((api, signal) => (this.id() ? api.get<ConsultaT>(`/api/historias/consultas/${this.id()}`, { signal }) : null));
  readonly historiaRec = recurso<HistoriaClinica>((api, signal) =>
    this.id() ? (this.existente.datos() ? this.api.porId(this.existente.datos()!.historiaId, signal) : null) : this.pacienteId() ? this.api.porPaciente(this.pacienteId()!, signal) : null);
  readonly historia = computed(() => this.historiaRec.datos());
  readonly cargaError = computed(() => this.existente.error() ?? this.historiaRec.error());
  readonly alergias = signal<Antecedente[]>([]);
  readonly evoluciones = recurso<Evolucion[]>((api, signal) => (this.id() && this.existente.datos()?.estado === 'FIRMADA' ? api.get<Evolucion[]>(`/api/historias/consultas/${this.id()}/evoluciones`, { signal }) : null));

  readonly motivo = signal('');
  readonly diagnostico = signal('');
  readonly tratamiento = signal('');
  readonly indicaciones = signal('');
  readonly signos = signal<Record<string, string>>({});
  readonly receta = signal<Fila[]>([]);
  readonly sucio = signal(false);
  readonly aplicado = signal(false);
  readonly nota = signal('');
  readonly medico = signal('');
  readonly guardadaEn = signal<string | null>(null);
  readonly errorValidacion = signal<string | null>(null);

  readonly version = computed(() => this.existente.datos()?.version ?? 0);
  readonly firmada = computed(() => this.existente.datos()?.estado === 'FIRMADA');
  readonly soloLectura = computed(() => this.firmada());
  readonly fecha = computed(() => this.existente.datos()?.fecha ?? new Date().toISOString());
  readonly esAutor = computed(() => true);
  private readonly intencion = nuevaIntencion();

  constructor() {
    effect(() => {
      const c = this.existente.datos();
      untracked(() => {
        if (!c) return;
        const pendiente = this.api.enConflicto();
        const mio = pendiente && pendiente.consultaId === c.id ? pendiente : null;
        this.cargarFormulario(c);
        if (mio) { this.api.enConflicto.set(null); this.aplicarBorrador(mio); }
        void this.catalogo.nombreMedico(c.medicoId).then((n) => this.medico.set(n));
      });
    });
    effect(() => {
      const h = this.historia();
      untracked(() => {
        if (!h) return;
        void this.cargarAlergias(h.id);
      });
    });
  }

  private async cargarAlergias(historiaId: string) {
    const lista = await this.apiRaw().get<Antecedente[]>(`/api/historias/${historiaId}/antecedentes`, { query: { soloActivos: true } }).catch(() => []);
    this.alergias.set(lista.filter((a) => a.tipo === 'ALERGIA'));
  }
  private apiRaw() { return this.guardarApi.cliente; }
  private readonly guardarApi = inject(ApiService);

  private cargarFormulario(c: ConsultaT) {
    this.motivo.set(c.motivo ?? '');
    this.diagnostico.set(c.diagnostico ?? '');
    this.tratamiento.set(c.tratamiento ?? '');
    this.indicaciones.set(c.indicaciones ?? '');
    this.signos.set({ ...(c.signosVitales ?? {}) });
    this.receta.set((c.receta ?? []).map((r) => ({ medicamento: r.medicamento, dosis: r.dosis ?? '', frecuencia: r.frecuencia ?? '', duracion: r.duracion ?? '' })));
    this.sucio.set(false);
  }
  private aplicarBorrador(b: NonNullable<ReturnType<HistoriaService['enConflicto']>>) {
    this.motivo.set(b.motivo); this.diagnostico.set(b.diagnostico); this.tratamiento.set(b.tratamiento); this.indicaciones.set(b.indicaciones);
    this.signos.set({ ...b.vitales }); this.receta.set(b.receta.map((r) => ({ ...r })));
    this.sucio.set(true); this.aplicado.set(true);
  }
  private cuerpo() {
    const signos = Object.fromEntries(Object.entries(this.signos()).filter(([, v]) => v.trim() !== ''));
    return {
      motivo: this.motivo().trim(),
      diagnostico: this.diagnostico().trim() || null,
      tratamiento: this.tratamiento().trim() || null,
      indicaciones: this.indicaciones().trim() || null,
      signosVitales: Object.keys(signos).length ? signos : null,
      receta: this.receta().filter((f) => f.medicamento.trim()).map((f) => ({ medicamento: f.medicamento.trim(), dosis: f.dosis.trim() || null, frecuencia: f.frecuencia.trim() || null, duracion: f.duracion.trim() || null })),
    };
  }

  cambiarSigno(k: string, v: string) { this.signos.update((s) => ({ ...s, [k]: v })); this.sucio.set(true); }
  agregarFila() { this.receta.update((r) => [...r, { medicamento: '', dosis: '', frecuencia: '', duracion: '' }]); this.sucio.set(true); }
  quitarFila(i: number) { this.receta.update((r) => r.filter((_, j) => j !== i)); this.sucio.set(true); }
  cambiarFila(i: number, campo: keyof Fila, v: string) { this.receta.update((r) => r.map((f, j) => (j === i ? { ...f, [campo]: v } : f))); this.sucio.set(true); }

  private async conflicto(e: unknown): Promise<boolean> {
    const x = e as { estado?: number; code?: string };
    if (x?.estado === 409 && x.code === 'VERSION_CONFLICTO') {
      this.api.enConflicto.set({ consultaId: this.id()!, motivo: this.motivo(), diagnostico: this.diagnostico(), tratamiento: this.tratamiento(), indicaciones: this.indicaciones(), vitales: { ...this.signos() }, receta: this.receta().map((r) => ({ ...r })) });
      await this.router.navigate(['/consulta/conflicto'], { queryParams: { id: this.id() } });
      return true;
    }
    return false;
  }

  readonly guardar = accion(async (api) => {
    const cuerpo = this.cuerpo();
    if (!this.id()) {
      const c = await api.post<ConsultaT>(`/api/historias/${this.historia()!.id}/consultas`, { citaId: this.citaId() || undefined, motivo: cuerpo.motivo, signosVitales: cuerpo.signosVitales ?? undefined }, { clave: this.intencion.clave });
      const hayMas = cuerpo.diagnostico || cuerpo.tratamiento || cuerpo.indicaciones || cuerpo.receta.length;
      const final = hayMas ? await api.put<ConsultaT>(`/api/historias/consultas/${c.id}`, cuerpo, { ifMatch: c.version }) : c;
      await this.router.navigate(['/consulta'], { queryParams: { id: final.id } });
      return final;
    }
    const c = await api.put<ConsultaT>(`/api/historias/consultas/${this.id()}`, cuerpo, { ifMatch: this.version() }).catch(async (e) => { if (await this.conflicto(e)) return undefined; throw e; });
    if (c) { this.existente.recargar(); this.sucio.set(false); this.aplicado.set(false); this.guardadaEn.set(new Date().toISOString()); }
    return c;
  });
  async guardarBorrador() { this.errorValidacion.set(null); await this.guardar.ejecutar(); }

  readonly firmar = accion(async (api) => {
    const guardada = await api.put<ConsultaT>(`/api/historias/consultas/${this.id()}`, this.cuerpo(), { ifMatch: this.version() });
    await api.post(`/api/historias/consultas/${this.id()}/firmar`, undefined, { ifMatch: guardada.version });
    return true;
  });
  async firmarYCerrar() {
    this.errorValidacion.set(null);
    if (!this.diagnostico().trim()) { this.errorValidacion.set('Escriba el diagnóstico antes de firmar.'); return; }
    const ok = await this.firmar.ejecutar();
    const err = this.firmar.error();
    if (!ok && err && (await this.conflicto(err))) return;
    if (ok) await this.router.navigate(['/historia'], { queryParams: { paciente: this.historia()!.pacienteId } });
  }

  readonly anotar = accion((api) => api.post(`/api/historias/consultas/${this.id()}/evoluciones`, { nota: this.nota().trim() }));
  async evolucionar() { if ((await this.anotar.ejecutar()) !== undefined) { this.nota.set(''); this.evoluciones.recargar(); } }

  recargarTodo() { this.existente.recargar(); this.historiaRec.recargar(); }
}

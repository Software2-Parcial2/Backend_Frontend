import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { fechaLocal, formatoDiaLargo, formatoHora, iniciales, nuevaIntencion } from '@sigec/api-client';
import { CatalogoService } from '../api/catalogo.service';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, conRetraso, lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { etiquetaDia, proximosDias, rangoDelDia, type Disponibilidad, type Especialidad, type Medico, type Paciente, type Tarifa } from '../api/tipos';

@Component({
  selector: 'app-reservar',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  encapsulation: ViewEncapsulation.None,
  styles: `
    .sigec .day{flex:1;min-width:84px;padding:10px;border:1px solid var(--bd);border-radius:8px;background:#fff;text-align:center;font-weight:600;cursor:pointer}
    .sigec .day.on{background:var(--pri);border-color:var(--pri);color:#fff}
    .sigec .day small{display:block;font-weight:400;font-size:12px}`,
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Reservar cita</h1><p class="sub">Elija paciente, médico y horario disponible</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">1 · Paciente</div></div>
        @if (paciente(); as p) {
          <div class="fx" data-testid="paciente-elegido"><div class="av" aria-hidden="true">{{ ini(p.nombre) }}</div><div><div class="b">{{ p.nombre }}</div><div class="sm muted"><span class="mono">{{ p.numeroHistoria }}</span> · {{ p.documento }}</div></div><span class="sp"></span><button type="button" class="btn s" (click)="cambiarPaciente()">Cambiar</button></div>
        } @else {
          <label class="search"><span class="muted">Buscar</span><input type="text" aria-label="Buscar paciente" placeholder="Nombre, documento o N.° de historia" [value]="q()" (input)="q.set($any($event.target).value)"></label>
          @if (candidatos.cargando()) { <p class="sm muted" style="margin-top:8px">Buscando…</p> }
          @for (c of candidatos.items(); track c.id) {
            <div class="li" data-testid="candidato"><div><div class="b">{{ c.nombre }}</div><div class="sm muted"><span class="mono">{{ c.numeroHistoria }}</span> · {{ c.documento }}</div></div><span class="sp"></span><button type="button" class="btn s" (click)="elegir(c)">Elegir</button></div>
          } @empty { @if (busqueda().length > 1 && !candidatos.cargando()) { <p class="sm muted" style="margin-top:8px">Sin coincidencias. <a href="#/pacientes/nuevo">Registrar paciente</a></p> } }
        }
      </div>
      <div class="card">
        <div class="ch"><div class="ct">2 · Especialidad y médico</div></div>
        <div class="fg">
          <div class="field"><label for="es">Especialidad</label><select class="in" id="es" [value]="especialidad()" (change)="elegirEspecialidad($any($event.target).value)"><option value="">Elija…</option>@for (e of especialidades(); track e.id) {<option [value]="e.codigo">{{ e.nombre }}</option>}</select></div>
          <div class="field"><label for="md">Médico</label><select class="in" id="md" [value]="medicoId()" [disabled]="!especialidad()" (change)="elegirMedico($any($event.target).value)"><option value="">Elija…</option>@for (m of medicos.items(); track m.id) {<option [value]="m.id">{{ m.nombre }}</option>}</select></div>
        </div>
      </div>
      <div class="card col" style="gap:14px">
        <div class="ch" style="margin-bottom:0"><div class="ct">3 · Fecha y hora</div><span class="sp"></span><span class="sm muted">Disponibilidad en tiempo real</span></div>
        <div class="fx wrap" style="gap:8px">
          @for (d of dias; track d) { <button type="button" class="day" [class.on]="d === dia()" (click)="elegirDia(d)">{{ et(d).s }}<small>{{ et(d).n }}</small></button> }
        </div>
        @if (!medicoId()) { <p class="sm muted">Elija un médico para ver sus horarios.</p> }
        @else if (slots.error(); as e) { <sigec-error [error]="e" (reintentar)="slots.recargar()" /> }
        @else if (slots.cargando() && !slots.datos()) { <sigec-cargando [filas]="2" etiqueta="Consultando horarios…" /> }
        @else if ((slots.datos() ?? []).length === 0) { <p class="muted" data-testid="vacio">El médico no tiene horarios publicados este día.</p> }
        @else {
          <div class="fx wrap" style="gap:8px">
            @for (h of slots.datos(); track h.fechaHora) {<button type="button" class="slot" data-testid="slot" [class.off]="h.estado !== 'LIBRE'" [class.on]="h.estado === 'LIBRE' && hora() === h.fechaHora" [disabled]="h.estado !== 'LIBRE'" (click)="hora.set(h.fechaHora)">{{ hh(h.fechaHora) }}</button>}
          </div>
        }
        <div class="sm muted">Los horarios tachados ya están ocupados. El sistema impide que dos pacientes ocupen el mismo turno.</div>
      </div>
    </div>
    <div class="card col" style="flex:1 1 320px;max-width:380px;gap:14px">
      <div class="ct">Resumen</div>
      <div class="li" style="padding:6px 0"><span class="muted">Paciente</span><span class="sp"></span><span class="b">{{ paciente()?.nombre ?? '—' }}</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Médico</span><span class="sp"></span><span class="b">{{ medicoNombre() }}</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Fecha</span><span class="sp"></span><span class="b">{{ hora() ? (hora() | fechaHora) : '—' }}</span></div>
      <div class="li" style="padding:6px 0"><span class="muted">Cargo provisional</span><span class="sp"></span><span class="b">{{ tarifa() ? (tarifa()!.monto | dinero: tarifa()!.moneda : true) : '—' }}</span></div>
      <div class="banner warn"><div><b>Reserva temporal de 10 minutos</b><span>El horario se libera si la cita no se confirma a tiempo.</span></div></div>
      <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px;word-break:break-all" data-testid="clave">{{ clave() }}</div></div>
      @if (crear.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
      <button type="button" class="btn pri" style="height:46px" [disabled]="!listo() || crear.enCurso()" (click)="confirmar()">{{ crear.enCurso() ? 'Reservando…' : 'Confirmar cita' }}</button>
      <div class="sm muted">Al confirmar, la SAGA coordina la reserva, el cargo provisional y el aviso al paciente.</div>
    </div>
  </div>
</div>`,
})
export class Reservar {
  private readonly router = inject(Router);
  private readonly catalogo = inject(CatalogoService);
  readonly pacienteId = parametro('paciente');
  readonly medicoParam = parametro('medico');
  readonly horaParam = parametro('hora');

  readonly dias = proximosDias(8);
  readonly dia = signal(fechaLocal());
  readonly hora = signal('');
  readonly especialidad = signal('');
  readonly medicoId = signal('');
  readonly especialidades = signal<Especialidad[]>([]);
  readonly seleccionado = signal<Paciente | undefined>(undefined);
  readonly q = signal('');
  readonly busqueda = conRetraso(this.q, 300);
  readonly intencion = nuevaIntencion();
  readonly clave = signal(this.intencion.clave);

  readonly cargado = recurso<Paciente>((api, signal) => (this.pacienteId() ? api.get<Paciente>(`/api/pacientes/${this.pacienteId()}`, { signal }) : null));
  readonly paciente = computed(() => this.seleccionado() ?? this.cargado.datos());
  /** Segun lo escrito: «HC-…» busca por historia; algo con digitos y sin espacios, por documento; el resto, por nombre (fonetica). */
  private tipoBusqueda(t: string): 'historia' | 'documento' | 'nombre' {
    return /^hc-?\d/i.test(t) ? 'historia' : /\d/.test(t) && !/\s/.test(t) ? 'documento' : 'nombre';
  }
  readonly candidatos = lista<Paciente>(() => (this.paciente() || this.busqueda().length < 2 ? null : { ruta: '/api/pacientes', query: { q: this.busqueda(), tipo: this.tipoBusqueda(this.busqueda()) } }), 5);
  readonly medicos = lista<Medico>(() => (this.especialidad() ? { ruta: '/api/medicos', query: { especialidad: this.especialidad() } } : null), 50);
  readonly medicoNombre = computed(() => this.medicos.items().find((m) => m.id === this.medicoId())?.nombre ?? '—');
  readonly slots = recurso<Disponibilidad[]>((api, signal) => {
    if (!this.medicoId()) return null;
    const r = rangoDelDia(this.dia());
    return api.pagina<Disponibilidad>('/api/citas/disponibilidad', { query: { medicoId: this.medicoId(), ...r }, limite: 100, signal }).then((p) => p.items);
  });
  readonly tarifas = recurso<Tarifa[]>((api, signal) => api.todas<Tarifa>('/api/facturacion/tarifas', { signal }).then((r) => r.items).catch(() => []));
  readonly tarifa = computed(() => this.tarifas.datos()?.find((t) => t.especialidad === this.especialidad() && t.estado === 'VIGENTE'));
  readonly listo = computed(() => !!this.paciente() && !!this.medicoId() && !!this.hora() && !!this.especialidad());
  private ultimoEnvio = '';

  constructor() {
    void this.catalogo.especialidades().then((e) => this.especialidades.set(e)).catch(() => undefined);
    // Llegada desde la agenda (medico y hora ya elegidos): se resuelve su especialidad y se preselecciona el horario.
    void (async () => {
      await Promise.resolve();
      const m = this.medicoParam();
      if (!m) return;
      const med = (await this.catalogo.medicos().catch(() => new Map<string, Medico>())).get(m);
      if (!med) return;
      this.especialidad.set(med.especialidad.codigo);
      this.medicoId.set(med.id);
      const h = this.horaParam();
      if (h) {
        this.dia.set(fechaLocal(h));
        this.hora.set(h);
      }
    })();
  }

  ini = iniciales;
  et = etiquetaDia;
  hh = (iso: string) => formatoHora(iso);
  elegir(p: Paciente) { this.seleccionado.set(p); this.q.set(''); }
  cambiarPaciente() { this.seleccionado.set(undefined); }
  elegirEspecialidad(c: string) { this.especialidad.set(c); this.medicoId.set(''); this.hora.set(''); }
  elegirMedico(id: string) { this.medicoId.set(id); this.hora.set(''); }
  elegirDia(d: string) { this.dia.set(d); this.hora.set(''); }

  readonly crear = accion(async (api, cuerpo: { pacienteId: string; medicoId: string; especialidad: string; fechaHora: string }) => {
    const json = JSON.stringify(cuerpo);
    if (this.ultimoEnvio && json !== this.ultimoEnvio) this.clave.set(this.intencion.renovar()); // otro envio, otra clave
    this.ultimoEnvio = json;
    return api.post<{ citaId: string }>('/api/citas', cuerpo, { clave: this.clave() });
  });

  async confirmar() {
    const p = this.paciente();
    if (!p || !this.listo()) return;
    const r = await this.crear.ejecutar({ pacienteId: p.id, medicoId: this.medicoId(), especialidad: this.especialidad(), fechaHora: this.hora() });
    if (r) await this.router.navigate(['/cita'], { queryParams: { id: r.citaId } });
    else this.slots.recargar(); // por si el horario se ocupo (409): se refresca la disponibilidad
  }
}

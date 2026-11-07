import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { ESTADOS_FINALES, chipPaso, estadoCita, nombreEspecialidad, type Cita, type Factura, type HistorialCita, type Paciente } from '../api/tipos';
import { ContextStore } from '../context';

@Component({
  selector: 'app-cita-detalle',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  @if (cita.error(); as e) { <sigec-error [error]="e" (reintentar)="cita.recargar()" /> }
  @else if (cita.datos(); as c) {
  <div class="ph">
    <div><h1 class="h1">Cita de {{ paciente()?.nombre ?? 'paciente' }}</h1><p class="sub">{{ esp(c.especialidad) }} · {{ c.fechaHora | fecha }} · {{ c.fechaHora | hora }} · {{ medico() }}</p></div>
    <span [class]="'chip ' + est(c.estado).tono" data-testid="estado-cita">{{ est(c.estado).texto }}</span><span class="sp"></span>
    @if (c.estado === 'CONFIRMADA') { <a class="btn" [attr.href]="'#/cita/reprogramar?id=' + c.citaId">Reprogramar</a><a class="btn dng" [attr.href]="'#/cita/cancelar?id=' + c.citaId">Cancelar cita</a> }
  </div>
  @if (!final(c.estado)) { <div class="banner warn" role="status"><div><b>Confirmando la cita…</b><span>La SAGA está reservando el horario, generando el cargo y avisando al paciente. Esta pantalla se actualiza sola.</span></div></div> }
  @if (c.estado === 'CANCELADA') { <div class="banner err" role="alert"><div><b>La cita no pudo confirmarse</b><span>{{ c.motivoFallo ?? 'Uno de los pasos falló.' }} <a [attr.href]="'#/cita/compensacion?id=' + c.citaId">Ver qué pasó en la SAGA</a></span></div></div> }
  @if (c.estado === 'CONFIRMADA' || c.estado === 'EN_SALA') {
    <div class="card fx wrap" style="gap:10px"><span class="ct">Asistencia</span><span class="sp"></span>
      @if (c.estado === 'CONFIRMADA') { <button type="button" class="btn" [disabled]="marcar.enCurso()" (click)="registrar('LLEGO')">Registrar llegada</button> }
      <button type="button" class="btn pri" [disabled]="marcar.enCurso()" (click)="registrar('ATENDIDA')">Marcar atendida</button>
      @if (c.estado === 'CONFIRMADA' && pasada(c.fechaHora)) { <button type="button" class="btn dng" [disabled]="marcar.enCurso()" (click)="registrar('NO_ASISTIO')">No asistió</button> }
    </div>
    @if (marcar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
  }
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Confirmación por SAGA</div><span class="sp"></span><span class="muted sm">Orquestada por MS3</span></div>
      @if (hist.datos(); as h) {
      <div class="tl">
        @for (p of h.pasos; track p.orden) {
          <div class="tli" data-testid="paso"><span [class]="'dot ' + paso(p.estado).punto"></span><div style="flex:1"><div class="fx"><span class="b">{{ p.orden }} · {{ p.servicio }} · {{ p.nombre }}</span><span class="sp"></span><span [class]="'chip ' + paso(p.estado).tono">{{ paso(p.estado).texto }}</span></div>@if (p.detalle) {<div class="ink2">{{ p.detalle }}</div>}<div class="sm muted">{{ p.en ? (p.en | hora) + ' · ' : '' }}Si falla: {{ p.siFalla }}</div></div></div>
        }
      </div>
      } @else { <sigec-cargando [filas]="3" /> }
      <hr class="hr" style="margin:16px 0">
      <div class="sm muted">Cada paso tiene 30 segundos de límite y 3 reintentos con espera creciente. La reserva temporal dura 10 minutos.</div>
    </div>
    <div class="col" style="gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Historial de estados</div></div>
        <div class="tl">
          @for (t of historia(); track t.en + t.evento) {
            <div class="tli"><span class="dot"></span><div><div class="b">{{ t.evento }}</div><div class="sm muted">{{ t.en | fechaHora }}{{ t.detalle ? ' · ' + t.detalle : '' }}</div></div></div>
          } @empty { <p class="muted">Sin movimientos todavía.</p> }
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Datos de la cita</div></div>
        <div class="fg" style="grid-template-columns:1fr 1fr;row-gap:12px">
          <div><div class="sm muted">Paciente</div><div class="b">@if (paciente(); as p) {<a [attr.href]="'#/pacientes/ficha?id=' + p.id">{{ p.nombre }}</a>} @else {—}</div></div>
          <div><div class="sm muted">Cargo</div><div class="b">@if (factura(); as f) { {{ f.monto | dinero: f.moneda : true }} · {{ f.estado === 'PAGADA' ? 'pagado' : f.estado === 'ANULADA' ? 'anulado' : 'pendiente de cobro' }} } @else {—}</div></div>
          <div><div class="sm muted">Identificador</div><div class="mono">{{ c.citaId.slice(0, 8) }}…</div></div>
          <div><div class="sm muted">Aviso al paciente</div><div class="b">{{ c.notificacion === 'ENVIADA' ? 'Enviado' : c.notificacion === 'PENDIENTE' ? 'Pendiente' : c.notificacion ?? '—' }}</div></div>
        </div>
      </div>
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" etiqueta="Cargando la cita…" /> }
</div>`,
})
export class CitaDetalle {
  private readonly catalogo = inject(CatalogoService);
  readonly ctx = inject(ContextStore);
  readonly id = parametro('id');
  readonly cita = recurso<Cita>((api, signal) => (this.id() ? api.get<Cita>(`/api/citas/${this.id()}`, { signal }) : null));
  readonly hist = recurso<HistorialCita>((api, signal) => (this.id() ? api.get<HistorialCita>(`/api/citas/${this.id()}/historial`, { signal }) : null));
  readonly historia = computed(() => [...(this.hist.datos()?.transiciones ?? [])].reverse());
  readonly paciente = signal<Paciente | undefined>(undefined);
  readonly medico = signal('');
  readonly factura = signal<Factura | undefined>(undefined);

  constructor() {
    // Mientras la SAGA no termina, la pantalla se refresca sola cada segundo.
    effect((onCleanup) => {
      const c = this.cita.datos();
      if (c && !ESTADOS_FINALES.includes(c.estado)) {
        const t = setTimeout(() => untracked(() => { this.cita.recargar(); this.hist.recargar(); }), 1000);
        onCleanup(() => clearTimeout(t));
      }
    });
    // Datos de apoyo: paciente, medico y cargo (si el rol puede verlos).
    effect(() => {
      const c = this.cita.datos();
      untracked(() => {
        if (!c) return;
        void this.apoyo.ejecutar(c);
      });
    });
  }

  private readonly apoyo = accion(async (api, c: Cita) => {
    this.paciente.set(await api.get<Paciente>(`/api/pacientes/${c.pacienteId}`).catch(() => undefined));
    this.medico.set(await this.catalogo.nombreMedico(c.medicoId));
    this.factura.set(c.facturaId ? await api.get<Factura>(`/api/facturacion/facturas/${c.facturaId}`).catch(() => undefined) : undefined);
  });

  readonly marcar = accion((api, accionAsistencia: string) => api.post(`/api/citas/${this.id()}/asistencia`, { accion: accionAsistencia }));
  async registrar(a: 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO') {
    await this.marcar.ejecutar(a);
    this.cita.recargar();
    this.hist.recargar();
  }

  est = estadoCita;
  paso = chipPaso;
  esp = nombreEspecialidad;
  final = (e: string) => ESTADOS_FINALES.includes(e);
  pasada = (iso: string) => Date.parse(iso) <= Date.now();
}

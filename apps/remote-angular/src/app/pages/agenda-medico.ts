import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { fechaLocal, formatoDiaLargo, iniciales, sumarDias } from '@sigec/api-client';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { recurso } from '../api/recurso';
import { accion } from '../api/recurso';
import type { Celda, Paciente } from '../api/tipos';
import { ContextStore } from '../context';

interface MiAgenda { fecha: string; medicoId: string; nombre: string; especialidadNombre: string; consultorio: string | null; celdas: Celda[]; resumen: { citas: number; atendidas: number; enSala: number; libres: number; reservasTemporales: number } }
interface Pag<T> { items: T[]; siguiente: string | null }
interface Antecedente { tipo: string; descripcion: string; activo: boolean }
interface EstudioHist { imagenId: string; estudio: string; validacion: string; validadoEn: string }

const CHIP: Record<string, [string, string]> = { CONFIRMADA: ['Confirmada', 'ok'], EN_SALA: ['En sala de espera', 'pri'], ATENDIDA: ['Atendida', ''], NO_ASISTIO: ['No asistió', 'err'], RESERVA_TEMPORAL: ['Reserva temporal', 'warn'] };

@Component({
  selector: 'app-agenda-medico',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Mi agenda</h1><p class="sub" style="text-transform:capitalize">{{ titulo() }}@if (a.datos(); as d) { · {{ d.nombre }}{{ d.consultorio ? ' · Consultorio ' + d.consultorio : '' }} }</p></div><span class="sp"></span>
    <div class="fx"><button type="button" class="btn" aria-label="Día anterior" (click)="mover(-1)">‹</button><button type="button" class="btn" (click)="fecha.set(hoy)">Hoy</button><button type="button" class="btn" aria-label="Día siguiente" (click)="mover(1)">›</button></div></div>
  @if (a.error(); as e) { <sigec-error [error]="e" (reintentar)="a.recargar()" /> }
  @else if (a.cargando() && !a.datos()) { <sigec-cargando [filas]="4" etiqueta="Cargando su agenda…" /> }
  @else if (a.datos(); as d) {
  <div class="g3">
    <div class="card kpi"><span class="v">{{ d.resumen.citas }}</span><span class="l">Citas del día</span></div>
    <div class="card kpi"><span class="v">{{ d.resumen.atendidas }}</span><span class="l">Atendidas</span></div>
    <div class="card kpi"><span class="v">{{ d.resumen.enSala }}</span><span class="l">Pacientes en sala de espera</span></div>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="card flush" style="flex:999 1 560px;min-width:0">
      <div class="ch"><div class="ct">Pacientes del día</div></div>
      <div class="scroll"><table class="tbl">
        <thead><tr><th>Hora</th><th>Paciente</th><th>N.° historia</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (c of citas(); track c.citaId) {
            <tr [class.sel]="c.citaId === siguiente()?.citaId" data-testid="fila-cita">
              <td class="mono">{{ c.hora }}</td><td class="b">{{ c.paciente?.nombre ?? 'Paciente' }}</td><td class="mono ink2">{{ c.paciente?.numeroHistoria ?? '—' }}</td>
              <td><span [class]="'chip ' + chip(c.estado)[1]">{{ chip(c.estado)[0] }}</span></td>
              <td class="tr">
                @if (c.estado === 'EN_SALA' || c.estado === 'CONFIRMADA') {<a class="btn s pri" [attr.href]="'#/consulta?cita=' + c.citaId + '&paciente=' + c.paciente?.id">Iniciar consulta</a>}
                @else if (c.paciente) {<a class="btn s" [attr.href]="'#/historia?paciente=' + c.paciente.id">Historia</a>} @else {<span class="muted">—</span>}
              </td>
            </tr>
          } @empty { <tr><td colspan="5" class="muted" style="text-align:center;padding:28px" data-testid="vacio">No tiene citas este día.</td></tr> }
        </tbody>
      </table></div>
    </div>
    <div class="col" style="flex:1 1 300px;max-width:380px;gap:16px">
      @if (siguiente(); as s) {
      <div class="card col" style="gap:10px">
        <div class="ct">Siguiente paciente</div>
        <div class="fx"><div class="av" aria-hidden="true">{{ ini(s.paciente?.nombre) }}</div><div><div class="b">{{ s.paciente?.nombre }}</div><div class="sm muted">@if (pac(); as p) {{{ p.edad }} años · }<span class="mono">{{ s.paciente?.numeroHistoria }}</span></div></div></div>
        @for (al of alergias(); track al) { <div class="banner warn"><div><b>Alergia registrada</b><span>{{ al }}</span></div></div> }
        <a class="btn pri" [attr.href]="'#/consulta?cita=' + s.citaId + '&paciente=' + s.paciente?.id">Iniciar consulta</a>
      </div>
      @if (estudio(); as e) {
      <div class="card col" style="gap:10px">
        <div class="ct">Estudio previo del paciente</div>
        <div><div class="b">{{ e.estudio }}</div><div class="sm muted">{{ e.validadoEn | fecha }} · informe validado</div></div>
        <a class="btn" [attr.href]="'#/resultado?id=' + e.imagenId">Ver informe</a>
      </div>
      }
      }
    </div>
  </div>
  }
</div>`,
})
export class AgendaMedico {
  readonly ctx = inject(ContextStore);
  readonly hoy = fechaLocal();
  readonly fecha = signal(this.hoy);
  readonly titulo = computed(() => formatoDiaLargo(`${this.fecha()}T12:00:00-04:00`));
  readonly a = recurso<MiAgenda>((api, signal) => api.get<MiAgenda>('/api/citas/agenda/medico/me', { query: { fecha: this.fecha() }, signal }));
  readonly citas = computed(() => (this.a.datos()?.celdas ?? []).filter((c) => c.citaId && CHIP[c.estado]));
  /** En sala primero; si no, la proxima confirmada. */
  readonly siguiente = computed(() => this.citas().find((c) => c.estado === 'EN_SALA') ?? this.citas().find((c) => c.estado === 'CONFIRMADA'));
  readonly pac = signal<Paciente | undefined>(undefined);
  readonly alergias = signal<string[]>([]);
  readonly estudio = signal<EstudioHist | undefined>(undefined);

  private readonly cargarContexto = accion(async (api, id: string) => {
    this.pac.set(await api.get<Paciente>(`/api/pacientes/${id}`).catch(() => undefined));
    // El contexto clinico es del medico: si MS4 aun no tiene historia o niega el acceso, simplemente no se muestra.
    try {
      const h = await api.get<{ id: string }>(`/api/historias/paciente/${id}`);
      this.alergias.set((await api.get<Antecedente[]>(`/api/historias/${h.id}/antecedentes`)).filter((x) => x.tipo === 'ALERGIA' && x.activo).map((x) => x.descripcion));
      this.estudio.set((await api.get<EstudioHist[]>(`/api/historias/${h.id}/estudios`)).find((e) => e.validacion === 'VALIDADO'));
    } catch {
      this.alergias.set([]);
      this.estudio.set(undefined);
    }
  });
  private ultimo = '';

  constructor() {
    // Al cambiar el «siguiente paciente» se cargan sus alergias y su ultimo estudio validado.
    effect(() => {
      const id = this.siguiente()?.paciente?.id;
      untracked(() => {
        if (id && id !== this.ultimo) {
          this.ultimo = id;
          void this.cargarContexto.ejecutar(id);
        }
      });
    });
  }

  mover(d: number) { this.fecha.update((f) => sumarDias(f, d)); }
  chip = (e: string): [string, string] => CHIP[e] ?? [e, ''];
  ini = iniciales;
}

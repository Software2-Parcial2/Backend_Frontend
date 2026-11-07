import { Component, inject, signal } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { chipPaso, estadoCita, nombreEspecialidad, type Cita, type HistorialCita, type Paciente } from '../api/tipos';

@Component({
  selector: 'app-cita-compensacion',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  @if (cita.error(); as e) { <sigec-error [error]="e" (reintentar)="cita.recargar()" /> }
  @else if (cita.datos(); as c) {
  <div class="ph"><div><h1 class="h1">Cita de {{ paciente()?.nombre ?? 'paciente' }}</h1><p class="sub">{{ esp(c.especialidad) }} · {{ c.fechaHora | fecha }} · {{ c.fechaHora | hora }} · {{ medico() }}</p></div><span [class]="'chip ' + est(c.estado).tono">{{ c.estado === 'CANCELADA' ? 'No confirmada' : est(c.estado).texto }}</span><span class="sp"></span><a class="btn pri" [attr.href]="'#/reservar?paciente=' + c.pacienteId">Elegir otro horario</a></div>
  @if (c.estado === 'CANCELADA') { <div class="banner err" role="alert"><div><b>La cita no pudo confirmarse</b><span>{{ c.motivoFallo ?? 'Uno de los pasos falló.' }} Se liberó el horario y no quedó ningún cargo activo.</span></div></div> }
  @else { <div class="banner"><div><b>Esta cita no tuvo compensación</b><span>Su estado es «{{ est(c.estado).texto }}». <a [attr.href]="'#/cita?id=' + c.citaId">Volver al detalle</a></span></div></div> }
  <div class="g2" style="align-items:start">
    <div class="card">
      <div class="ch"><div class="ct">Qué pasó en la SAGA</div></div>
      @if (hist.datos(); as h) {
      <div class="tl">
        @for (p of h.pasos; track p.orden) {
          <div class="tli" data-testid="paso"><span [class]="'dot ' + paso(p.estado).punto"></span><div style="flex:1"><div class="fx"><span class="b">{{ p.orden }} · {{ p.servicio }} · {{ p.nombre }}</span><span class="sp"></span><span [class]="'chip ' + paso(p.estado).tono">{{ paso(p.estado).texto }}</span></div><div class="ink2">{{ p.detalle ?? (p.estado === 'NO_EJECUTADO' ? 'No se llegó a este paso' : '') }}{{ p.en ? ' · ' + (p.en | hora) : '' }}</div></div></div>
        }
        @if (h.compensacion) {
          <div class="tli"><span class="dot warn"></span><div style="flex:1"><div class="fx"><span class="b">Compensación</span><span class="sp"></span><span class="chip ok">Ejecutada</span></div><div class="ink2">{{ (h.compensacion.pasos ?? []).join(' → ') || 'Se deshicieron los pasos ya hechos' }}</div></div></div>
        }
      </div>
      } @else { <sigec-cargando [filas]="3" /> }
    </div>
    <div class="col" style="gap:16px">
      <div class="card col" style="gap:8px">
        <div class="ct">Reglas aplicadas</div>
        <div class="li" style="padding:8px 0"><div><div class="b">Falla una operación crítica</div><div class="sm muted">Se anula el cargo provisional y se libera la reserva.</div></div></div>
        <div class="li" style="padding:8px 0"><div><div class="b">Falla solo el aviso</div><div class="sm muted">Se reintenta sin cancelar una cita válida.</div></div></div>
        <div class="li" style="padding:8px 0"><div><div class="b">Trazabilidad</div><div class="sm muted">El cargo anulado conserva su registro.</div></div></div>
      </div>
      <div class="sm muted">Reserva temporal de 10 minutos, 30 segundos por paso y 3 reintentos.</div>
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" /> }
</div>`,
})
export class CitaCompensacion {
  private readonly catalogo = inject(CatalogoService);
  readonly id = parametro('id');
  readonly cita = recurso<Cita>((api, signal) => (this.id() ? api.get<Cita>(`/api/citas/${this.id()}`, { signal }) : null));
  readonly hist = recurso<HistorialCita>((api, signal) => (this.id() ? api.get<HistorialCita>(`/api/citas/${this.id()}/historial`, { signal }) : null));
  readonly paciente = signal<Paciente | undefined>(undefined);
  readonly medico = signal('');
  est = estadoCita;
  paso = chipPaso;
  esp = nombreEspecialidad;

  constructor() {
    recurso<null>((api) => {
      const c = this.cita.datos();
      if (!c) return null;
      return (async () => {
        this.paciente.set(await api.get<Paciente>(`/api/pacientes/${c.pacienteId}`).catch(() => undefined));
        this.medico.set(await this.catalogo.nombreMedico(c.medicoId));
        return null;
      })();
    });
  }
}

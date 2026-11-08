import { Component, computed, inject, signal } from '@angular/core';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { HistoriaCabecera } from '../api/historia-cabecera';
import { HistoriaService } from '../api/historia.service';
import { lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { AccesoAuditoria } from '../api/tipos';

const FILTROS = [{ t: 'Todo', v: '' }, { t: 'Lecturas', v: 'LEER' }, { t: 'Creaciones', v: 'CREAR' }, { t: 'Modificaciones', v: 'MODIFICAR' }, { t: 'Exportaciones', v: 'EXPORTAR' }];

@Component({
  selector: 'app-auditoria',
  imports: [Cargando, ErrorApi, Vacio, HistoriaCabecera, ...FORMATOS],
  template: `
<div class="page">
  @if (!pacienteId() && !hid()) { <sigec-vacio texto="Elija un paciente para ver su bitácora."><a class="btn pri" href="#/pacientes">Buscar paciente</a></sigec-vacio> }
  @else if (hid()) {
  @if (historia.datos(); as h) { <sigec-historia-cabecera [historia]="h" activa="auditoria"><span class="sp"></span><span class="chip pri">Registro inmutable</span></sigec-historia-cabecera> }
  @else { <div class="ph"><div><h1 class="h1">Bitácora de auditoría</h1><p class="sub">Accesos a la historia clínica</p></div><span class="sp"></span><span class="chip pri">Registro inmutable</span></div> }
  <div class="fx wrap">
    <div class="seg">@for (f of filtros; track f.v) {<button type="button" [class.on]="filtro() === f.v" (click)="filtro.set(f.v)">{{ f.t }}</button>}</div>
    <span class="sp"></span><span class="sm muted">Cada acceso se guarda con fecha, rol y usuario.</span>
  </div>
  @if (accesos.error(); as e) { <sigec-error [error]="e" (reintentar)="accesos.recargar()" /> }
  @else if (accesos.cargando()) { <sigec-cargando [filas]="3" /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Elemento</th></tr></thead>
    <tbody>
      @for (r of accesos.items(); track r.id) {
        <tr data-testid="acceso"><td class="mono">{{ r.ocurridoEn | fechaHora }}</td><td class="mono">{{ r.usuarioId.slice(0, 8) }}…</td><td>{{ r.rol }}</td>
          <td><span class="chip" [class.info]="r.accion !== 'LEER'">{{ r.accion }}</span></td><td>{{ r.recurso }}</td></tr>
      } @empty { <tr><td colspan="5" class="muted">Sin registros para este filtro.</td></tr> }
    </tbody>
  </table></div></div>
  @if (accesos.hayMas()) { <button type="button" class="btn" [disabled]="accesos.cargandoMas()" (click)="accesos.cargarMas()">Cargar más</button> }
  }
  } @else if (historia.error(); as e) { <sigec-error [error]="e" (reintentar)="historia.recargar()" /> }
  @else { <sigec-cargando [filas]="3" /> }
</div>`,
})
export class Auditoria {
  private readonly svc = inject(HistoriaService);
  readonly filtros = FILTROS;
  readonly filtro = signal('');
  readonly pacienteId = parametro('paciente');
  readonly h = parametro('h');
  /** El administrador no puede leer la historia (solo su bitácora): llega con el id en la URL. Los demás roles la resuelven por paciente. */
  readonly historia = recurso((api, signal) => (this.pacienteId() && !this.h() ? this.svc.porPaciente(this.pacienteId()!, signal) : null));
  readonly hid = computed(() => this.h() ?? this.historia.datos()?.id ?? null);
  readonly accesos = lista<AccesoAuditoria>(() => (this.hid() ? { ruta: `/api/historias/${this.hid()}/auditoria`, query: { tipo: this.filtro() || undefined } } : null), 25);
}

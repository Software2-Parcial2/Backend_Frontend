import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { nombreEspecialidad, type Cita, type Factura, type Paciente } from '../api/tipos';

const MOTIVOS = ['Pedido del paciente', 'Médico no disponible', 'Error de registro', 'Otro'];

@Component({
  selector: 'app-cita-cancelar',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="t-can">
  <div class="card">
    @if (cita.error(); as e) { <sigec-error [error]="e" (reintentar)="cita.recargar()" /> }
    @else if (cita.datos(); as c) {
    <div><h2 id="t-can" style="font-size:20px;font-weight:650">Cancelar cita</h2><p class="ink2" style="margin-top:4px">{{ paciente()?.nombre ?? 'Paciente' }} · {{ esp(c.especialidad) }} · {{ c.fechaHora | fecha }}, {{ c.fechaHora | hora }}</p></div>
    <div class="field"><label for="m">Motivo</label><select class="in" id="m" [value]="motivo()" (change)="motivo.set($any($event.target).value)">@for (m of motivos; track m) {<option>{{ m }}</option>}</select></div>
    @if (motivo() === 'Otro') { <div class="field"><label for="mo">Detalle</label><input class="in" id="mo" type="text" maxlength="180" [value]="detalle()" (input)="detalle.set($any($event.target).value)"></div> }
    @if (factura(); as f) { <div class="banner warn"><div><b>Se anulará el cargo provisional</b><span>{{ f.monto | dinero: f.moneda : true }}. El registro del cargo se conserva con su trazabilidad.</span></div></div> }
    @if (cancelar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
    <div class="fx" style="justify-content:flex-end"><a class="btn" [attr.href]="'#/cita?id=' + c.citaId">Mantener cita</a><button type="button" class="btn dng" [disabled]="cancelar.enCurso() || (motivo() === 'Otro' && !detalle().trim())" (click)="confirmar()">{{ cancelar.enCurso() ? 'Cancelando…' : 'Cancelar cita' }}</button></div>
    } @else { <sigec-cargando [filas]="2" /> }
  </div>
</div>`,
})
export class CitaCancelar {
  private readonly router = inject(Router);
  readonly id = parametro('id');
  readonly motivos = MOTIVOS;
  readonly motivo = signal(MOTIVOS[0]!);
  readonly detalle = signal('');
  readonly paciente = signal<Paciente | undefined>(undefined);
  readonly factura = signal<Factura | undefined>(undefined);
  readonly cita = recurso<Cita>((api, signal) => (this.id() ? api.get<Cita>(`/api/citas/${this.id()}`, { signal }).then(async (c) => {
    this.paciente.set(await api.get<Paciente>(`/api/pacientes/${c.pacienteId}`).catch(() => undefined));
    this.factura.set(c.facturaId ? await api.get<Factura>(`/api/facturacion/facturas/${c.facturaId}`).catch(() => undefined) : undefined);
    return c;
  }) : null));
  readonly cancelar = accion((api, motivo: string) => api.post(`/api/citas/${this.id()}/cancelar`, { motivo }));
  esp = nombreEspecialidad;
  async confirmar() {
    const id = this.id();
    await this.cancelar.ejecutar(this.motivo() === 'Otro' ? this.detalle().trim() : this.motivo());
    if (!this.cancelar.error() && id) await this.router.navigate(['/cita'], { queryParams: { id } });
  }
}

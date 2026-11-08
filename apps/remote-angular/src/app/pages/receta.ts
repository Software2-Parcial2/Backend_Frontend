import { Component, inject } from '@angular/core';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { RecetaImprimible } from '../api/tipos';

@Component({
  selector: 'app-receta',
  imports: [Cargando, ErrorApi, Vacio, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Receta médica</h1><p class="sub">Vista previa para imprimir o exportar en PDF</p></div><span class="sp"></span><button type="button" class="btn" (click)="volver()">Volver</button><button type="button" class="btn pri" (click)="imprimir()" [disabled]="!receta.datos()">Imprimir</button></div>
  @if (!id()) { <sigec-vacio texto="Abra la receta desde una consulta firmada." /> }
  @else if (receta.error(); as e) { <sigec-error [error]="e" (reintentar)="receta.recargar()" /> }
  @else if (receta.datos(); as r) {
  <div class="card col" style="gap:14px;max-width:760px;padding:32px">
    <div class="fx"><div><div class="b" style="font-size:18px">Clínica Médica Santa Cruz</div><div class="sm muted">Santa Cruz de la Sierra</div></div><span class="sp"></span><div class="sm muted" style="text-align:right">{{ r.firmadaEn | fecha }}<br>Receta {{ r.consultaId.slice(0, 8) }}</div></div>
    <div class="li"><span class="muted">Paciente</span><span class="sp"></span><span class="b" data-testid="receta-paciente">{{ r.pacienteNombre }} · {{ r.numeroHistoria }}</span></div>
    <div class="b">Indicaciones</div>
    <div data-testid="receta-items">
      @for (i of r.items; track $index) { <div>{{ $index + 1 }}. {{ i.medicamento }}{{ i.dosis ? ' · ' + i.dosis : '' }}{{ i.frecuencia ? ' · ' + i.frecuencia : '' }}{{ i.duracion ? ' · ' + i.duracion : '' }}</div> }
      @if (r.indicaciones) { <div style="white-space:pre-line;margin-top:8px">{{ r.indicaciones }}</div> }
      @if (!r.items.length && !r.indicaciones) { <span class="muted">Sin indicaciones.</span> }
    </div>
    <div class="fx" style="margin-top:24px"><span class="sp"></span><div style="text-align:center"><div style="width:220px;border-top:1px solid var(--bd)"></div><div class="sm muted">{{ medico }} · firmada {{ r.firmadaEn | fechaHora }}</div></div></div>
  </div>
  } @else { <sigec-cargando [filas]="4" /> }
</div>`,
})
export class Receta {
  private readonly catalogo = inject(CatalogoService);
  readonly id = parametro('id');
  medico = 'Médico tratante';
  readonly receta = recurso<RecetaImprimible>((api, signal) =>
    this.id() ? api.get<RecetaImprimible>(`/api/historias/consultas/${this.id()}/receta`, { signal }).then(async (r) => { this.medico = await this.catalogo.nombreMedico(r.medicoId); return r; }) : null);
  imprimir() { window.print(); }
  volver() { history.back(); }
}

import { Component, computed, inject } from '@angular/core';
import { Cargando, ErrorApi } from '../api/estado';
import { HistoriaService } from '../api/historia.service';
import { recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import type { Consulta } from '../api/tipos';

@Component({
  selector: 'app-consulta-conflicto',
  imports: [Cargando, ErrorApi],
  template: `
<div class="page">
  @if (vigente.error(); as e) { <sigec-error [error]="e" (reintentar)="vigente.recargar()" /> }
  @else if (vigente.datos(); as v) {
  <div class="card" style="max-width:720px" role="alertdialog" aria-labelledby="t-con">
    <div><h2 id="t-con" style="font-size:20px;font-weight:650">Otro profesional modificó este registro</h2><p class="ink2" style="margin-top:4px">Para no sobrescribir su trabajo, los cambios no se guardaron.</p></div>
    @if (mio(); as m) {
    <div class="g2" style="gap:12px;grid-template-columns:1fr 1fr;margin-top:12px">
      <div class="card col" style="gap:6px;padding:14px"><span class="chip">Su versión</span>
        @for (c of campos(); track c.k) { <div class="sm muted">{{ c.t }}</div><div data-testid="mio">{{ c.mio || '—' }}</div> }</div>
      <div class="card col" style="gap:6px;padding:14px;background:var(--warn-t)"><span class="chip warn" data-testid="version-vigente">Versión vigente · v{{ v.version }}</span>
        @for (c of campos(); track c.k) { <div class="sm muted">{{ c.t }}</div><div data-testid="vigente">{{ c.vigente || '—' }}</div> }</div>
    </div>
    } @else { <p class="ink2" style="margin-top:12px">No hay cambios locales guardados para comparar. La versión vigente es la v{{ v.version }}.</p> }
    <div class="sm muted" style="margin:12px 0">Revise la versión vigente y vuelva a aplicar sus cambios. Las ediciones contradictorias no se sincronizan automáticamente.</div>
    <div class="fx" style="justify-content:flex-end">
      <a class="btn dng" data-testid="descartar" [attr.href]="'#/consulta?id=' + v.id" (click)="descartar()">Descartar mis cambios</a>
      <a class="btn pri" data-testid="reaplicar" [attr.href]="'#/consulta?id=' + v.id">Revisar y reaplicar</a>
    </div>
  </div>
  } @else { <sigec-cargando [filas]="3" /> }
</div>`,
})
export class ConsultaConflicto {
  private readonly svc = inject(HistoriaService);
  readonly id = parametro('id');
  readonly vigente = recurso<Consulta>((api, signal) => (this.id() ? api.get<Consulta>(`/api/historias/consultas/${this.id()}`, { signal }) : null));
  readonly mio = computed(() => (this.svc.enConflicto()?.consultaId === this.id() ? this.svc.enConflicto() : null));
  readonly campos = computed(() => {
    const m = this.mio(), v = this.vigente.datos();
    if (!m || !v) return [];
    const rec = (r: { medicamento: string; dosis?: string | null; frecuencia?: string | null }[]) => r.filter((x) => x.medicamento).map((x) => `${x.medicamento} ${x.dosis ?? ''}`.trim()).join('; ');
    return [
      { k: 'motivo', t: 'Motivo', mio: m.motivo, vigente: v.motivo },
      { k: 'diagnostico', t: 'Diagnóstico', mio: m.diagnostico, vigente: v.diagnostico },
      { k: 'tratamiento', t: 'Tratamiento', mio: m.tratamiento, vigente: v.tratamiento },
      { k: 'indicaciones', t: 'Indicaciones', mio: m.indicaciones, vigente: v.indicaciones },
      { k: 'receta', t: 'Receta', mio: rec(m.receta), vigente: rec(v.receta ?? []) },
    ];
  });
  descartar() { this.svc.enConflicto.set(null); }
}

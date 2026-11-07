import { Component } from '@angular/core';

@Component({
  selector: 'app-consulta-conflicto',
  template: `
<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="t-con">
  <div class="card" style="max-width:640px">
    <div><h2 id="t-con" style="font-size:20px;font-weight:650">Otro profesional modificó este registro</h2><p class="ink2" style="margin-top:4px">Para no sobrescribir su trabajo, los cambios no se guardaron.</p></div>
    <div class="g2" style="gap:12px;grid-template-columns:1fr 1fr">
      <div class="card col" style="gap:6px;padding:14px"><span class="chip">Su versión · v3</span><div class="sm muted">Indicaciones</div><div>Reposo relativo y evitar esfuerzos intensos</div></div>
      <div class="card col" style="gap:6px;padding:14px;background:var(--warn-t);border-color:#F0D3A5"><span class="chip warn">Versión vigente · v4</span><div class="sm" style="color:var(--warn)">Dr. Marcelo Suárez · 10:04</div><div>Reposo relativo. Se agrega: evitar frío intenso</div></div>
    </div>
    <div class="sm muted">Revise la versión vigente y vuelva a aplicar sus cambios. Las ediciones contradictorias no se sincronizan automáticamente.</div>
    <div class="fx" style="justify-content:flex-end"><a class="btn dng" href="#/historia">Descartar mis cambios</a><a class="btn pri" href="#/consulta">Revisar y reaplicar</a></div>
  </div>
</div>`,
})
export class ConsultaConflicto {}

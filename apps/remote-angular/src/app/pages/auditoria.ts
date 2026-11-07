import { Component, signal, computed } from '@angular/core';

interface Reg { cuando: string; quien: string; area: string; tipo: 'Lectura' | 'Escritura' | 'Confirmación'; elem: string; firma: string }

@Component({
  selector: 'app-auditoria',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Bitácora de auditoría</h1><p class="sub">Carla Rojas Vaca · <span class="mono">HC-004218</span></p></div><span class="sp"></span><span class="chip pri">Registro inmutable</span></div>
  <div class="tabs"><a class="tab" href="#/historia">Consultas</a><a class="tab" href="#/historia/detalle">Antecedentes</a><a class="tab" href="#/historia/detalle">Estudios</a><a class="tab" href="#/historia/detalle">Indicaciones</a><span class="tab on">Auditoría</span></div>
  <div class="fx wrap">
    <div class="seg">
      @for (f of filtros; track f) {<button type="button" [class.on]="filtro() === f" (click)="filtro.set(f)">{{ f }}</button>}
    </div>
    <span class="sp"></span>
    <span class="sm muted">Cada lectura y escritura se guarda con fecha, usuario y firma digital del profesional.</span>
  </div>
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Fecha y hora</th><th>Profesional</th><th>Acción</th><th>Elemento</th><th>Firma</th></tr></thead>
    <tbody>
      @for (r of visibles(); track r.firma) {
        <tr>
          <td class="mono">{{ r.cuando }}</td><td><div class="b">{{ r.quien }}</div><div class="sm muted">{{ r.area }}</div></td>
          <td><span class="chip" [class.info]="r.tipo === 'Escritura'" [class.ok]="r.tipo === 'Confirmación'">{{ r.tipo }}</span></td>
          <td>{{ r.elem }}</td><td class="mono">{{ r.firma }}</td>
        </tr>
      }
    </tbody>
  </table></div></div>
</div>`,
})
export class Auditoria {
  readonly filtros = ['Todo', 'Lecturas', 'Escrituras', 'Confirmaciones'];
  readonly filtro = signal('Todo');
  private readonly regs: Reg[] = [
    { cuando: '03 nov 10:02:15', quien: 'Dra. Valeria Antelo', area: 'Cardiología', tipo: 'Escritura', elem: 'Consulta borrador, versión 3', firma: 'a91f…c20d' },
    { cuando: '03 nov 09:58:40', quien: 'Dra. Valeria Antelo', area: 'Cardiología', tipo: 'Lectura', elem: 'Historia clínica completa', firma: '7be3…14aa' },
    { cuando: '03 nov 08:36:09', quien: 'Dr. Marcelo Suárez', area: 'Neumología', tipo: 'Lectura', elem: 'Informe validado de radiografía', firma: 'd002…9e51' },
    { cuando: '12 sep 17:21:33', quien: 'Dr. Rodrigo Egüez', area: 'Medicina general', tipo: 'Confirmación', elem: 'Consulta del 12 sep cerrada y firmada', firma: '3c48…b7f2' },
    { cuando: '12 sep 16:48:02', quien: 'Dr. Rodrigo Egüez', area: 'Medicina general', tipo: 'Escritura', elem: 'Diagnóstico J20.9 y solicitud de estudio', firma: 'f5a0…6d19' },
  ];
  readonly visibles = computed(() => {
    const f = this.filtro();
    const tipo = f === 'Lecturas' ? 'Lectura' : f === 'Escrituras' ? 'Escritura' : f === 'Confirmaciones' ? 'Confirmación' : null;
    return tipo ? this.regs.filter((r) => r.tipo === tipo) : this.regs;
  });
}

import { Component } from '@angular/core';

@Component({
  selector: 'app-estudios',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Estudios radiológicos</h1><p class="sub">Radiografías de tórax cargadas, con el análisis de apoyo de IA</p></div><span class="sp"></span><a class="btn pri" href="#/estudios/cargar">Cargar radiografía</a></div>
  <div class="fx wrap">
    <label class="search"><span class="muted">Buscar</span><input type="text" placeholder="Paciente o N.° de historia" aria-label="Buscar estudio"></label>
    <div class="seg"><button type="button" class="on">Todos</button><button type="button">Por validar</button><button type="button">Validados</button></div>
  </div>
  <div class="card flush">
    <div class="scroll">
      <table class="tbl">
        <thead><tr><th>Fecha</th><th>Paciente</th><th>Estudio</th><th>Cargado por</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          @for (e of filas; track e.fecha + e.paciente) {
            <tr [class.sel]="e.sel">
              <td class="mono">{{ e.fecha }}</td><td class="b">{{ e.paciente }}</td><td>{{ e.estudio }}</td><td>{{ e.por }}</td>
              <td><span [class]="'chip ' + e.tono">{{ e.estado }}</span></td>
              <td class="tr">@if (e.accion) {<a [class]="e.pri ? 'btn s pri' : 'btn s'" [attr.href]="e.accion === 'Volver a cargar' ? '#/estudios/cargar' : '#/resultado'">{{ e.accion }}</a>} @else {<span class="muted">—</span>}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="sm muted">Los resultados de la IA son de apoyo. Ningún resultado pasa a la historia clínica sin la validación de un médico.</div>
</div>`,
})
export class Estudios {
  readonly filas = [
    { fecha: '03 nov 08:34', paciente: 'Pedro Cuéllar', estudio: 'Radiografía de tórax · PNG', por: 'Téc. Ximena Arce', estado: 'Resultado por validar', tono: 'warn', accion: 'Revisar', pri: true, sel: true },
    { fecha: '03 nov 08:10', paciente: 'Gladys Parada', estudio: 'Radiografía de tórax · JPEG', por: 'Téc. Ximena Arce', estado: 'Procesando', tono: 'info', accion: '', pri: false, sel: false },
    { fecha: '02 nov 17:45', paciente: 'Elsa Montaño', estudio: 'Archivo cargado · PNG', por: 'Recepción', estado: 'Imagen no válida', tono: 'err', accion: 'Volver a cargar', pri: false, sel: false },
    { fecha: '18 sep 10:12', paciente: 'Carla Rojas Vaca', estudio: 'Radiografía de tórax · DICOM', por: 'Téc. Ximena Arce', estado: 'Informe validado', tono: 'ok', accion: 'Ver informe', pri: false, sel: false },
    { fecha: '14 sep 15:20', paciente: 'Iván Salvatierra', estudio: 'Radiografía de tórax · PNG', por: 'Téc. Ximena Arce', estado: 'Informe validado', tono: 'ok', accion: 'Ver informe', pri: false, sel: false },
  ];
}

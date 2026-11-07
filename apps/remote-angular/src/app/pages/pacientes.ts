import { Component } from '@angular/core';

@Component({
  selector: 'app-pacientes',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Pacientes</h1><p class="sub">Busque por nombre, documento de identidad o número de historia</p></div><span class="sp"></span><a class="btn" href="#/pacientes/solicitudes">Solicitudes</a><a class="btn pri" href="#/pacientes/nuevo">Registrar paciente</a></div>

  <div class="card col" style="gap:14px">
    <div class="fx wrap">
      <label class="search" style="flex:2 1 360px"><span class="muted">Buscar</span><input type="text" value="Rohas Carla" aria-label="Buscar paciente"></label>
      <div class="seg"><button type="button" class="on">Nombre (fonética)</button><button type="button">Documento</button><button type="button">N.° de historia</button></div>
      <button type="button" class="btn">Buscar</button>
    </div>
    <div class="sm muted">La búsqueda fonética encuentra «Rojas» aunque se escriba «Rohas».</div>
  </div>

  <div class="card flush">
    <div class="ch"><div class="ct">{{ filas.length }} resultados</div></div>
    <div class="scroll">
      <table class="tbl">
        <thead><tr><th>N.° historia</th><th>Paciente</th><th>Documento</th><th>Edad</th><th>Teléfono</th><th>Última cita</th><th></th></tr></thead>
        <tbody>
          @for (f of filas; track f.hc) {
            <tr>
              <td class="mono">{{ f.hc }}</td>
              <td><div class="b">{{ f.nombre }}</div>@if (f.fonetica) {<span class="chip pri">Coincidencia fonética</span>}@if (f.nota) {<div class="sm muted">{{ f.nota }}</div>}</td>
              <td class="mono">{{ f.doc }}</td><td>{{ f.edad }}</td><td>{{ f.tel }}</td><td>{{ f.ultima }}</td>
              <td class="tr"><a class="btn s" href="#/pacientes/ficha">Abrir ficha</a></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  </div>
</div>`,
})
export class Pacientes {
  readonly filas = [
    { hc: 'HC-004218', nombre: 'Carla Rojas Vaca', doc: '7845123 SC', edad: 34, tel: '7612-3045', ultima: '12 sep 2026', fonetica: true, nota: '' },
    { hc: 'HC-001977', nombre: 'Carla Rojas Antelo', doc: '5120987 SC', edad: 51, tel: '7701-8820', ultima: '30 jun 2026', fonetica: false, nota: '' },
    { hc: 'HC-006340', nombre: 'Carlota Rojas Vaca', doc: '9034411 SC', edad: 19, tel: '6890-1177', ultima: 'Sin citas', fonetica: false, nota: '' },
    { hc: 'HC-005102', nombre: 'Mateo Arias Rojas', doc: '12044518 SC', edad: 8, tel: '7612-3045', ultima: '21 oct 2026', fonetica: false, nota: 'Menor · tutor: Carla Rojas Vaca' },
  ];
}

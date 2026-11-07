import { Component } from '@angular/core';

@Component({
  selector: 'app-historial',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Historial de envíos</h1><p class="sub">Avisos de citas por correo y Telegram, con su estado de entrega</p></div><span class="sp"></span><button type="button" class="btn">Plantillas</button></div>
  <div class="g4">
    <div class="card kpi"><span class="v">214</span><span class="l">Enviados hoy</span></div>
    <div class="card kpi"><span class="v">98 %</span><span class="l">Entregados</span></div>
    <div class="card kpi"><span class="v">3</span><span class="l">En reintento</span></div>
    <div class="card kpi"><span class="v">1</span><span class="l">Fallidos</span></div>
  </div>
  <div class="fx wrap">
    <div class="seg"><button type="button" class="on">Todos</button><button type="button">Correo</button><button type="button">Telegram</button></div>
    <div class="seg"><button type="button" class="on">Cualquier estado</button><button type="button">Reintentando</button><button type="button">Fallidos</button></div>
  </div>
  <div class="card flush">
    <div class="scroll">
      <table class="tbl">
        <thead><tr><th>Fecha</th><th>Destinatario</th><th>Tipo</th><th>Canal</th><th>Estado</th><th>Clave anti-duplicado</th></tr></thead>
        <tbody>
          @for (e of filas; track e.fecha + e.dest + e.canal) {
            <tr><td class="mono">{{ e.fecha }}</td><td class="b">{{ e.dest }}</td><td>{{ e.tipo }}</td><td>{{ e.canal }}</td><td><span [class]="'chip ' + e.tono">{{ e.estado }}</span></td><td class="mono">{{ e.clave }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="sm muted">Un proveedor externo puede aceptar un mensaje antes de devolver un error, por eso la entrega exactamente una vez no puede garantizarse en todos los casos. En la demostración el correo sale por Mailtrap.</div>
</div>`,
})
export class Historial {
  readonly filas = [
    { fecha: '03 nov 08:52', dest: 'Carla Rojas Vaca', tipo: 'Confirmación', canal: 'Correo', estado: 'Entregado', tono: 'ok', clave: 'a4d1…confirm' },
    { fecha: '03 nov 08:52', dest: 'Carla Rojas Vaca', tipo: 'Confirmación', canal: 'Telegram', estado: 'Entregado', tono: 'ok', clave: 'a4d1…confirm' },
    { fecha: '03 nov 08:00', dest: 'Mario Vargas', tipo: 'Recordatorio', canal: 'Telegram', estado: 'Entregado', tono: 'ok', clave: '91c7…remind' },
    { fecha: '03 nov 07:00', dest: 'Wilma Justiniano', tipo: 'Recordatorio', canal: 'Correo', estado: 'Reintentando 2 de 3', tono: 'warn', clave: '5be2…remind' },
    { fecha: '02 nov 18:00', dest: 'Sofía Landívar', tipo: 'Cancelación', canal: 'Correo', estado: 'Fallido · buzón no existe', tono: 'err', clave: 'c03f…cancel' },
  ];
}

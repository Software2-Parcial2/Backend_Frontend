import { Component } from '@angular/core';

@Component({
  selector: 'app-paciente-ficha',
  template: `
<div class="page">
  <div class="card fx wrap" style="gap:18px">
    <div class="av" style="width:64px;height:64px;font-size:22px" aria-hidden="true">CR</div>
    <div><h1 class="h1">Carla Rojas Vaca</h1><div class="ink2">34 años · Femenino · <span class="mono">7845123 SC</span></div></div>
    <span class="chip pri">HC-004218</span>
    <span class="sp"></span>
    <a class="btn" href="#/pacientes/nuevo">Editar datos</a>
    <a class="btn pri" href="#/reservar">Reservar cita</a>
  </div>

  <div class="tabs" role="tablist"><span class="tab on">Datos</span><span class="tab">Contactos</span><span class="tab">Citas</span><a class="tab" href="#/historia">Historia clínica</a></div>

  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Datos personales y de contacto</div><span class="sp"></span><span class="chip ok">Actualizado hace 2 días</span></div>
      <div class="fg" style="grid-template-columns:1fr 1fr;row-gap:14px">
        <div><div class="sm muted">Fecha de nacimiento</div><div class="b">12 abr 1992</div></div>
        <div><div class="sm muted">Sexo</div><div class="b">Femenino</div></div>
        <div><div class="sm muted">Teléfono</div><div class="b">7612-3045</div></div>
        <div><div class="sm muted">Correo</div><div class="b">carla.rojas&#64;correo.com</div></div>
        <div style="grid-column:1/-1"><div class="sm muted">Dirección</div><div class="b">Av. Banzer, 3.er anillo, Santa Cruz de la Sierra</div></div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Contactos de emergencia</div><span class="sp"></span><button type="button" class="btn s gh">Agregar</button></div>
      @for (c of contactos; track c.nombre) {
        <div class="li"><div class="av" aria-hidden="true">{{ c.ini }}</div><div><div class="b">{{ c.nombre }}</div><div class="sm muted">{{ c.rel }}</div></div><span class="sp"></span><span class="mono">{{ c.tel }}</span></div>
      }
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Citas</div><span class="sp"></span><a class="btn s gh" href="#/agenda">Ver en agenda</a></div>
      @for (c of citas; track c.fecha) {
        <div class="li"><div style="min-width:74px"><div class="b">{{ c.fecha }}</div><div class="sm muted">{{ c.hora }}</div></div><div><div class="b">{{ c.detalle }}</div></div><span class="sp"></span><span class="chip" [class]="'chip ' + c.tono">{{ c.estado }}</span></div>
      }
    </div>
    <div class="card col">
      <div class="ch" style="margin-bottom:0"><div class="ct">Vinculación con historia clínica</div></div>
      <p class="ink2">Recepción solo ve el vínculo. El contenido clínico lo consulta el personal médico, con registro de auditoría.</p>
      <div class="fx"><span class="chip pri">HC-004218</span><span class="muted sm">3 consultas · 1 estudio radiológico</span></div>
      <hr class="hr">
      <div class="sm muted">Cada creación o cambio en este módulo publica un evento de dominio hacia RabbitMQ.</div>
    </div>
  </div>
</div>`,
})
export class PacienteFicha {
  readonly contactos = [
    { ini: 'MR', nombre: 'Marcelo Rojas Vaca', rel: 'Hermano', tel: '7098-5521' },
    { ini: 'HV', nombre: 'Hilda Vaca de Rojas', rel: 'Madre', tel: '7144-2309' },
  ];
  readonly citas = [
    { fecha: '03 nov', hora: '10:00', detalle: 'Cardiología · Dra. Valeria Antelo', estado: 'Confirmada', tono: 'ok' },
    { fecha: '12 sep', hora: '16:30', detalle: 'Medicina general · Dr. Rodrigo Egüez', estado: 'Atendida', tono: '' },
    { fecha: '04 may', hora: '09:00', detalle: 'Neumología · Dr. Marcelo Suárez', estado: 'Cancelada', tono: 'err' },
  ];
}

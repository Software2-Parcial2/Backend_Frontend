import { Component } from '@angular/core';

@Component({
  selector: 'app-paciente-nuevo',
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Registrar paciente</h1><p class="sub">Datos administrativos del paciente</p></div></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Datos personales</div></div>
        <div class="fg">
          <div class="field"><label for="n">Nombres</label><input class="in" id="n" type="text" value="Daniela Andrea"></div>
          <div class="field"><label for="ap">Apellido paterno</label><input class="in" id="ap" type="text" value="Flores"></div>
          <div class="field"><label for="am">Apellido materno</label><input class="in" id="am" type="text" value="Gutiérrez"></div>
          <div class="field"><label for="doc">Documento de identidad</label><input class="in" id="doc" type="text" value="8123456 SC"><span class="hint" style="color:var(--ok)">No existe otro paciente con este documento</span></div>
          <div class="field"><label for="fn">Fecha de nacimiento</label><input class="in" id="fn" type="text" value="09/06/1998"></div>
          <div class="field"><label for="sx">Sexo</label><select class="in" id="sx"><option>Femenino</option><option>Masculino</option></select></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Datos de contacto</div></div>
        <div class="fg">
          <div class="field"><label for="tel">Teléfono</label><input class="in" id="tel" type="text" value="7455-1290"></div>
          <div class="field"><label for="co">Correo electrónico</label><input class="in" id="co" type="email" value="daniela.flores&#64;correo.com"></div>
          <div class="field" style="grid-column:1/-1"><label for="di">Dirección</label><input class="in" id="di" type="text" value="Calle Los Pinos 215, Equipetrol, Santa Cruz de la Sierra"></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Contacto de emergencia</div><span class="sp"></span><button type="button" class="btn s gh">Agregar otro</button></div>
        <div class="fg">
          <div class="field"><label for="ce">Nombre completo</label><input class="in" id="ce" type="text" value="Patricia Gutiérrez"></div>
          <div class="field"><label for="pa">Parentesco</label><select class="in" id="pa"><option>Madre</option><option>Padre</option><option>Hermano/a</option></select></div>
          <div class="field"><label for="ct">Teléfono</label><input class="in" id="ct" type="text" value="7211-8830"></div>
        </div>
      </div>
    </div>
    <div class="col" style="flex:1 1 300px;max-width:360px;gap:16px">
      <div class="card col">
        <div class="ct">Envío seguro</div>
        <p class="ink2">Si la conexión falla y el registro se reenvía, no se crea un segundo paciente.</p>
        <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px;word-break:break-all">7c1e9b52-4a0d-4f6e-b3a8-2d90e1f5c6a4</div></div>
        <hr class="hr">
        <a class="btn pri" href="#/pacientes/guardado" style="height:46px">Guardar paciente</a>
        <a class="btn" href="#/pacientes">Cancelar</a>
      </div>
      <div class="banner"><div><b>Eventos de dominio</b><span>Al guardar se publica el evento «paciente registrado» mediante Outbox hacia RabbitMQ.</span></div></div>
    </div>
  </div>
</div>`,
})
export class PacienteNuevo {}

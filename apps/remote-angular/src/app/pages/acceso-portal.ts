import { Component, OnInit, input, signal } from '@angular/core';
import { esProhibido } from '@sigec/api-client';
import { Cargando, ErrorApi } from '../api/estado';
import { accion, recurso } from '../api/recurso';

/** Estado del acceso del paciente a la web y la app (MS1 -> Keycloak). */
export interface AccesoPaciente {
  pacienteId: string;
  estado: 'SIN_CUENTA' | 'INVITACION_PENDIENTE' | 'ACTIVA' | 'DESHABILITADA';
  usuarioId: string | null;
  username: string | null;
  email: string | null;
}
export interface InvitacionPaciente extends AccesoPaciente {
  creada: boolean;
  enviada: boolean;
  detalle: string | null;
}

/**
 * Tarjeta "Acceso al portal": muestra si el paciente ya puede entrar y permite enviarle (o reenviarle) el correo de activacion,
 * desde el que define su propia contrasena. Con `autoInvitar` la invitacion se envia al mostrarse (tras registrar al paciente).
 */
@Component({
  selector: 'sigec-acceso-portal',
  imports: [Cargando, ErrorApi],
  template: `
<div class="card col" style="gap:12px" data-testid="acceso-portal">
  <div class="ch" style="margin-bottom:0"><div class="ct">Acceso a la web y la app</div><span class="sp"></span>
    @if (acceso.datos(); as a) { <span [class]="'chip ' + chip(a.estado).tono" data-testid="acceso-estado">{{ chip(a.estado).texto }}</span> }
  </div>
  @if (acceso.error(); as e) {
    @if (prohibido(e)) { <p class="ink2">Solo recepción o administración gestionan el acceso del paciente.</p> }
    @else { <sigec-error [error]="e" (reintentar)="acceso.recargar()" /> }
  } @else if (acceso.datos(); as a) {
    @switch (a.estado) {
      @case ('SIN_CUENTA') {
        <p class="ink2">El paciente aún no tiene cuenta. Le enviaremos un correo para que cree su contraseña y pueda ver sus citas desde la web o el celular.</p>
      }
      @case ('INVITACION_PENDIENTE') {
        <p class="ink2">Se envió la invitación a <b>{{ a.email }}</b>. El paciente debe abrir el enlace del correo y crear su contraseña (vence en 72 horas).</p>
      }
      @case ('ACTIVA') {
        <p class="ink2">El paciente ya entra con <b>{{ a.email }}</b>. Si olvida su contraseña, puede usar «¿Olvidaste tu contraseña?» en la pantalla de inicio de sesión.</p>
      }
      @case ('DESHABILITADA') {
        <p class="ink2">La cuenta está deshabilitada. Un administrador puede habilitarla en Usuarios.</p>
      }
    }
    @if (resultado(); as r) {
      @if (r.enviada) { <div class="banner ok" role="status" data-testid="invitacion-ok"><div><b>Invitación enviada</b><span>Revise con el paciente la bandeja de {{ r.email }} (también la carpeta de spam).</span></div></div> }
      @else { <div class="banner warn" role="status" data-testid="invitacion-no-enviada"><div><b>La cuenta se creó, pero el correo no salió</b><span>{{ r.detalle }}. Pida a un administrador revisar el correo de Keycloak y reenvíe la invitación.</span></div></div> }
    }
    @if (invitar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
    @if (a.estado === 'SIN_CUENTA' || a.estado === 'INVITACION_PENDIENTE') {
      @if (email()) {
        <button type="button" class="btn" [class.pri]="a.estado === 'SIN_CUENTA'" [disabled]="invitar.enCurso()" (click)="enviar()" data-testid="invitar">
          {{ invitar.enCurso() ? 'Enviando…' : (a.estado === 'SIN_CUENTA' ? 'Enviar invitación a ' + email() : 'Reenviar invitación') }}
        </button>
      } @else {
        <div class="banner warn"><div><b>Falta el correo</b><span>Agregue un correo en «Editar datos» para poder invitar al paciente.</span></div></div>
      }
    }
  } @else { <sigec-cargando [filas]="1" etiqueta="Consultando el acceso…" /> }
</div>`,
})
export class AccesoPortal implements OnInit {
  readonly pacienteId = input.required<string>();
  readonly email = input<string | null | undefined>(null);
  /** Envia la invitacion en cuanto se muestra (una sola vez). */
  readonly autoInvitar = input(false);
  readonly resultado = signal<InvitacionPaciente | null>(null);

  readonly acceso = recurso<AccesoPaciente>((api, signal) => api.get<AccesoPaciente>(`/api/identidad/pacientes/${this.pacienteId()}/acceso`, { signal }));
  readonly invitar = accion((api) => api.post<InvitacionPaciente>(`/api/identidad/pacientes/${this.pacienteId()}/acceso`, {}, { clave: false }));

  ngOnInit(): void {
    if (this.autoInvitar() && this.email()) void this.enviar();
  }

  async enviar(): Promise<void> {
    const r = await this.invitar.ejecutar();
    if (!r) return;
    this.resultado.set(r);
    this.acceso.recargar();
  }

  prohibido = (e: unknown) => esProhibido(e);
  chip(estado: AccesoPaciente['estado']): { texto: string; tono: string } {
    switch (estado) {
      case 'ACTIVA': return { texto: 'Cuenta activa', tono: 'ok' };
      case 'INVITACION_PENDIENTE': return { texto: 'Invitación pendiente', tono: 'warn' };
      case 'DESHABILITADA': return { texto: 'Deshabilitada', tono: 'err' };
      default: return { texto: 'Sin cuenta', tono: 'pri' };
    }
  }
}

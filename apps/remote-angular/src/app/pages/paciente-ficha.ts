import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { iniciales } from '@sigec/api-client';
import { Cargando, ErrorApi } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { accion, lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { estadoCita, nombreEspecialidad, type Cita, type Contacto, type Paciente } from '../api/tipos';
import { inject } from '@angular/core';

const SEXO = { F: 'Femenino', M: 'Masculino', OTRO: 'Otro' } as const;

@Component({
  selector: 'app-paciente-ficha',
  imports: [FormsModule, Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  @if (p.error(); as e) { <sigec-error [error]="e" (reintentar)="p.recargar()" /> }
  @else if (p.datos(); as d) {
  <div class="card fx wrap" style="gap:18px">
    <div class="av" style="width:64px;height:64px;font-size:22px" aria-hidden="true">{{ ini(d.nombre) }}</div>
    <div><h1 class="h1">{{ d.nombre }}</h1><div class="ink2">{{ d.edad }} años · {{ sexo(d.sexo) }} · <span class="mono">{{ d.documento }}</span></div></div>
    <span class="chip pri">{{ d.numeroHistoria }}</span>
    <span class="sp"></span>
    <a class="btn" [attr.href]="'#/pacientes/nuevo?id=' + d.id">Editar datos</a>
    <a class="btn pri" [attr.href]="'#/reservar?paciente=' + d.id">Reservar cita</a>
  </div>

  <div class="tabs" role="tablist"><span class="tab on">Datos</span><a class="tab" [attr.href]="'#/historia?paciente=' + d.id">Historia clínica</a></div>

  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Datos personales y de contacto</div><span class="sp"></span><span class="chip ok">Actualizado {{ d.updatedAt | hace }}</span></div>
      <div class="fg" style="grid-template-columns:1fr 1fr;row-gap:14px">
        <div><div class="sm muted">Fecha de nacimiento</div><div class="b">{{ d.fechaNacimiento | fecha }}</div></div>
        <div><div class="sm muted">Sexo</div><div class="b">{{ sexo(d.sexo) }}</div></div>
        <div><div class="sm muted">Teléfono</div><div class="b">{{ d.telefono || '—' }}</div></div>
        <div><div class="sm muted">Correo</div><div class="b">{{ d.email || '—' }}</div></div>
        <div style="grid-column:1/-1"><div class="sm muted">Dirección</div><div class="b">{{ d.direccion || '—' }}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Contactos de emergencia</div><span class="sp"></span><button type="button" class="btn s gh" (click)="agregando.set(!agregando())">{{ agregando() ? 'Cerrar' : 'Agregar' }}</button></div>
      @if (contactos.error(); as e) { <sigec-error [error]="e" (reintentar)="contactos.recargar()" /> }
      @for (c of contactos.items(); track c.id) {
        <div class="li" data-testid="contacto"><div class="av" aria-hidden="true">{{ ini(c.nombre) }}</div><div><div class="b">{{ c.nombre }}</div><div class="sm muted">{{ c.parentesco }}</div></div><span class="sp"></span><span class="mono">{{ c.telefono }}</span><button type="button" class="btn s gh" [attr.aria-label]="'Quitar a ' + c.nombre" (click)="quitar(c)">Quitar</button></div>
      } @empty { @if (!contactos.cargando() && !contactos.error()) { <p class="muted" data-testid="vacio" style="padding:8px 0">Sin contactos de emergencia registrados.</p> } }
      @if (agregando()) {
        <form class="fg" style="grid-template-columns:1fr 1fr 1fr auto;align-items:end;margin-top:12px" (ngSubmit)="agregar()">
          <div class="field"><label for="cn">Nombre</label><input class="in" id="cn" name="cn" [(ngModel)]="nuevo.nombre" required></div>
          <div class="field"><label for="cp">Parentesco</label><input class="in" id="cp" name="cp" [(ngModel)]="nuevo.parentesco" required></div>
          <div class="field"><label for="ct">Teléfono</label><input class="in" id="ct" name="ct" [(ngModel)]="nuevo.telefono" required></div>
          <button type="submit" class="btn pri" [disabled]="guardarContacto.enCurso()">Guardar</button>
        </form>
        @if (guardarContacto.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
      }
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Citas</div><span class="sp"></span><a class="btn s gh" href="#/agenda">Ver en agenda</a></div>
      @if (citas.error(); as e) { <sigec-error [error]="e" (reintentar)="citas.recargar()" /> }
      @else if (citas.cargando()) { <sigec-cargando [filas]="2" etiqueta="Cargando citas…" /> }
      @for (c of citas.items(); track c.citaId) {
        <div class="li" data-testid="cita-paciente"><div style="min-width:74px"><div class="b">{{ c.fechaHora | fecha }}</div><div class="sm muted">{{ c.fechaHora | hora }}</div></div><div><div class="b">{{ nombreEsp(c.especialidad) }} · {{ medico(c.medicoId) }}</div></div><span class="sp"></span><a class="chip" [class]="'chip ' + estado(c.estado).tono" [attr.href]="'#/cita?id=' + c.citaId">{{ estado(c.estado).texto }}</a></div>
      } @empty { @if (!citas.cargando() && !citas.error()) { <p class="muted" data-testid="vacio" style="padding:8px 0">Este paciente no tiene citas.</p> } }
    </div>
    <div class="card col">
      <div class="ch" style="margin-bottom:0"><div class="ct">Vinculación con historia clínica</div></div>
      <p class="ink2">Recepción solo ve el vínculo. El contenido clínico lo consulta el personal médico, con registro de auditoría.</p>
      <div class="fx"><span class="chip pri">{{ d.numeroHistoria }}</span></div>
      <hr class="hr">
      <div class="sm muted">Cada creación o cambio en este módulo publica un evento de dominio hacia RabbitMQ.</div>
    </div>
  </div>
  } @else { <sigec-cargando [filas]="4" etiqueta="Cargando la ficha…" /> }
</div>`,
})
export class PacienteFicha {
  private readonly catalogo = inject(CatalogoService);
  readonly id = parametro('id');
  readonly p = recurso<Paciente>((api, signal) => (this.id() ? api.get<Paciente>(`/api/pacientes/${this.id()}`, { signal }) : null));
  readonly contactos = lista<Contacto>(() => (this.id() ? { ruta: `/api/pacientes/${this.id()}/contactos` } : null), 50);
  readonly citas = lista<Cita>(() => (this.id() ? { ruta: '/api/citas', query: { pacienteId: this.id() } } : null), 10);
  private readonly medicos = signal(new Map<string, string>());
  readonly agregando = signal(false);
  nuevo = { nombre: '', parentesco: '', telefono: '' };

  constructor() {
    void this.catalogo.medicos().then((m) => this.medicos.set(new Map([...m].map(([k, v]) => [k, v.nombre])))).catch(() => undefined);
  }

  ini = iniciales;
  sexo = (s: Paciente['sexo']) => (s ? SEXO[s] : '—');
  estado = estadoCita;
  nombreEsp = nombreEspecialidad;
  medico = (id: string) => this.medicos().get(id) ?? 'Médico';

  readonly guardarContacto = accion((api, c: { nombre: string; parentesco: string; telefono: string }) =>
    api.post<Contacto>(`/api/pacientes/${this.id()}/contactos`, c));
  readonly borrar = accion((api, id: string) => api.delete(`/api/pacientes/${this.id()}/contactos/${id}`));

  async agregar() {
    if (!this.nuevo.nombre.trim() || !this.nuevo.parentesco.trim() || !this.nuevo.telefono.trim()) return;
    if (await this.guardarContacto.ejecutar({ ...this.nuevo })) {
      this.nuevo = { nombre: '', parentesco: '', telefono: '' };
      this.agregando.set(false);
      this.contactos.recargar();
    }
  }
  async quitar(c: Contacto) {
    await this.borrar.ejecutar(c.id);
    this.contactos.recargar();
  }
}

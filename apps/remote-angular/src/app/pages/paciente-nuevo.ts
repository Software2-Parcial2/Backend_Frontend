import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { nuevaIntencion } from '@sigec/api-client';
import { accion, conRetraso, recurso } from '../api/recurso';
import { Cargando, ErrorApi } from '../api/estado';
import { parametro } from '../api/ruta';
import type { Contacto, Paciente } from '../api/tipos';

@Component({
  selector: 'app-paciente-nuevo',
  imports: [ReactiveFormsModule, Cargando, ErrorApi],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">{{ editando() ? 'Editar paciente' : 'Registrar paciente' }}</h1><p class="sub">Datos administrativos del paciente</p></div></div>
  @if (existente.error(); as e) { <sigec-error [error]="e" (reintentar)="existente.recargar()" /> }
  @else if (editando() && existente.cargando() && !existente.datos()) { <sigec-cargando [filas]="4" etiqueta="Cargando el paciente…" /> }
  @else {
  <form [formGroup]="f" (ngSubmit)="guardar()" style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start" novalidate>
    <div class="col" style="flex:999 1 560px;min-width:0;gap:16px">
      <div class="card">
        <div class="ch"><div class="ct">Datos personales</div></div>
        <div class="fg">
          <div class="field" style="grid-column:1/-1"><label for="nom">Nombre completo</label><input class="in" id="nom" type="text" formControlName="nombre" [attr.aria-invalid]="invalido('nombre')" autocomplete="off">@if (msg('nombre'); as m) {<span class="hint" style="color:var(--err)" role="alert">{{ m }}</span>}</div>
          <div class="field"><label for="doc">Documento de identidad</label><input class="in" id="doc" type="text" formControlName="documento" [attr.aria-invalid]="invalido('documento')" autocomplete="off">
            @if (msg('documento'); as m) {<span class="hint" style="color:var(--err)" role="alert">{{ m }}</span>}
            @else if (duplicado()) {<span class="hint" style="color:var(--err)">Ya existe un paciente con este documento: {{ duplicado() }}</span>}
            @else if (!editando() && f.controls.documento.value.length > 3) {<span class="hint" style="color:var(--ok)">No existe otro paciente con este documento</span>}</div>
          <div class="field"><label for="fn">Fecha de nacimiento</label><input class="in" id="fn" type="date" formControlName="fechaNacimiento" [attr.aria-invalid]="invalido('fechaNacimiento')">@if (msg('fechaNacimiento'); as m) {<span class="hint" style="color:var(--err)" role="alert">{{ m }}</span>}</div>
          <div class="field"><label for="sx">Sexo</label><select class="in" id="sx" formControlName="sexo"><option value="">Sin indicar</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="OTRO">Otro</option></select></div>
          <div class="field"><label for="seg">Seguro</label><select class="in" id="seg" formControlName="tipoSeguro"><option value="NINGUNO">Sin seguro</option><option value="PUBLICO">Seguro público</option><option value="PRIVADO">Seguro privado</option></select></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Datos de contacto</div></div>
        <div class="fg">
          <div class="field"><label for="tel">Teléfono</label><input class="in" id="tel" type="text" formControlName="telefono" [attr.aria-invalid]="invalido('telefono')">@if (msg('telefono'); as m) {<span class="hint" style="color:var(--err)" role="alert">{{ m }}</span>}</div>
          <div class="field"><label for="co">Correo electrónico</label><input class="in" id="co" type="email" formControlName="email" [attr.aria-invalid]="invalido('email')">@if (msg('email'); as m) {<span class="hint" style="color:var(--err)" role="alert">{{ m }}</span>}</div>
          <div class="field" style="grid-column:1/-1"><label for="di">Dirección</label><input class="in" id="di" type="text" formControlName="direccion"></div>
        </div>
      </div>
      @if (!editando()) {
      <div class="card">
        <div class="ch"><div class="ct">Contacto de emergencia (opcional)</div></div>
        <div class="fg">
          <div class="field"><label for="ce">Nombre completo</label><input class="in" id="ce" type="text" formControlName="contactoNombre"></div>
          <div class="field"><label for="pa">Parentesco</label><select class="in" id="pa" formControlName="contactoParentesco"><option>Madre</option><option>Padre</option><option>Hermano/a</option><option>Cónyuge</option><option>Otro</option></select></div>
          <div class="field"><label for="ct">Teléfono</label><input class="in" id="ct" type="text" formControlName="contactoTelefono"></div>
        </div>
      </div>
      }
    </div>
    <div class="col" style="flex:1 1 300px;max-width:360px;gap:16px">
      <div class="card col">
        <div class="ct">Envío seguro</div>
        <p class="ink2">Si la conexión falla y el registro se reenvía, no se crea un segundo paciente.</p>
        @if (!editando()) { <div class="field"><label>Idempotency-Key</label><div class="mono" style="padding:10px 12px;background:var(--line2);border-radius:8px;word-break:break-all" data-testid="clave">{{ clave() }}</div></div> }
        <hr class="hr">
        @if (guardando.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
        @if (aviso()) { <div class="banner warn" role="status"><div><span>{{ aviso() }}</span></div></div> }
        <button type="submit" class="btn pri" style="height:46px" [disabled]="guardando.enCurso()">{{ guardando.enCurso() ? 'Guardando…' : (editando() ? 'Guardar cambios' : 'Guardar paciente') }}</button>
        <a class="btn" [attr.href]="editando() ? '#/pacientes/ficha?id=' + id() : '#/pacientes'">Cancelar</a>
      </div>
      <div class="banner"><div><b>Eventos de dominio</b><span>Al guardar se publica el evento «paciente registrado» mediante Outbox hacia RabbitMQ.</span></div></div>
    </div>
  </form>
  }
</div>`,
})
export class PacienteNuevo {
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly id = parametro('id');
  readonly editando = computed(() => this.id() !== null);
  readonly intencion = nuevaIntencion();
  readonly clave = signal(this.intencion.clave);
  readonly aviso = signal('');
  private ultimoCuerpo = '';

  readonly f = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(200)]],
    documento: ['', [Validators.required, Validators.maxLength(30)]],
    fechaNacimiento: ['', Validators.required],
    sexo: [''],
    tipoSeguro: ['NINGUNO'],
    telefono: ['', Validators.maxLength(30)],
    email: ['', [Validators.email, Validators.maxLength(200)]],
    direccion: ['', Validators.maxLength(300)],
    contactoNombre: [''],
    contactoParentesco: ['Madre'],
    contactoTelefono: [''],
  });

  readonly existente = recurso<{ p: Paciente; version: string | null }>((api, signal) =>
    this.id() === null ? null : api.leer<Paciente>(`/api/pacientes/${this.id()}`, { signal }).then((r) => {
      const p = r.datos;
      this.f.patchValue({ nombre: p.nombre, documento: p.documento, fechaNacimiento: p.fechaNacimiento, sexo: p.sexo ?? '', tipoSeguro: p.tipoSeguro ?? 'NINGUNO', telefono: p.telefono ?? '', email: p.email ?? '', direccion: p.direccion ?? '' });
      this.f.controls.documento.disable();
      return { p, version: r.etag };
    }),
  );

  private readonly docEscrito = signal('');
  private readonly docRetraso = conRetraso(this.docEscrito, 400);
  readonly duplicado = signal('');

  constructor() {
    this.f.controls.documento.valueChanges.subscribe((v) => {
      this.docEscrito.set(v.trim());
      this.duplicado.set('');
    });
    // Aviso de documento repetido mientras se escribe (la regla real la impone el servidor con 409 PACIENTE_DUPLICADO).
    const comprobar = accion(async (api, doc: string) => {
      const r = await api.pagina<Paciente>('/api/pacientes', { query: { q: doc, tipo: 'documento' }, limite: 5 });
      const hit = r.items.find((p) => p.documento.toLowerCase() === doc.toLowerCase());
      this.duplicado.set(hit ? `${hit.nombre} (${hit.numeroHistoria})` : '');
    });
    effect(() => {
      const d = this.docRetraso();
      untracked(() => {
        if (!this.editando() && d.length > 3) void comprobar.ejecutar(d);
      });
    });
  }

  readonly guardando = accion(async (api, cuerpo: Record<string, unknown>, contacto: Record<string, string> | null) => {
    const json = JSON.stringify([cuerpo, contacto]);
    // Si el usuario cambio algo despues de un intento fallido, ya no es el mismo envio: clave nueva.
    if (this.ultimoCuerpo && json !== this.ultimoCuerpo) this.clave.set(this.intencion.renovar());
    this.ultimoCuerpo = json;
    if (this.editando()) {
      const r = await api.enviar<Paciente>('PUT', `/api/pacientes/${this.id()}`, cuerpo, { ifMatch: this.existente.datos()?.version ?? undefined });
      return { paciente: r.datos, repetida: false, nuevo: false };
    }
    const r = await api.enviar<Paciente>('POST', '/api/pacientes', cuerpo, { clave: this.clave() });
    if (contacto) {
      try {
        await api.post<Contacto>(`/api/pacientes/${r.datos.id}/contactos`, contacto);
      } catch {
        this.aviso.set('El paciente se guardó, pero no se pudo registrar el contacto de emergencia. Agréguelo desde la ficha.');
      }
    }
    return { paciente: r.datos, repetida: r.repetida, nuevo: true };
  });

  invalido(c: 'nombre' | 'documento' | 'fechaNacimiento' | 'telefono' | 'email'): boolean {
    const ctl = this.f.controls[c];
    return ctl.invalid && (ctl.touched || this.intentado());
  }
  private readonly intentado = signal(false);
  msg(c: 'nombre' | 'documento' | 'fechaNacimiento' | 'telefono' | 'email'): string | null {
    const ctl = this.f.controls[c];
    const servidor = this.guardando.error()?.mensajeDe(c);
    if (servidor) return servidor;
    if (!this.invalido(c)) return null;
    if (ctl.hasError('required')) return 'Este dato es obligatorio';
    if (ctl.hasError('email')) return 'Escriba un correo válido';
    if (ctl.hasError('maxlength')) return 'Es demasiado largo';
    return 'Dato no válido';
  }

  async guardar() {
    this.intentado.set(true);
    this.f.markAllAsTouched();
    if (this.f.invalid) return;
    const v = this.f.getRawValue();
    const cuerpo: Record<string, unknown> = {
      nombre: v.nombre.trim(),
      documento: v.documento.trim(),
      fechaNacimiento: v.fechaNacimiento,
      sexo: v.sexo || undefined,
      telefono: v.telefono.trim() || undefined,
      email: v.email.trim() || undefined,
      direccion: v.direccion.trim() || undefined,
      tipoSeguro: v.tipoSeguro,
    };
    const contacto = !this.editando() && v.contactoNombre.trim() && v.contactoTelefono.trim()
      ? { nombre: v.contactoNombre.trim(), parentesco: v.contactoParentesco, telefono: v.contactoTelefono.trim() }
      : null;
    const r = await this.guardando.ejecutar(cuerpo, contacto);
    if (!r) return;
    if (r.nuevo) await this.router.navigate(['/pacientes/guardado'], { queryParams: { id: r.paciente.id }, state: { clave: this.clave(), repetida: r.repetida } });
    else await this.router.navigate(['/pacientes/ficha'], { queryParams: { id: r.paciente.id } });
  }
}

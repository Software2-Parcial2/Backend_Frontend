import { Component, signal } from '@angular/core';
import { FORMATOS } from '../api/formato';
import { Cargando, ErrorApi } from '../api/estado';
import { conRetraso, lista } from '../api/recurso';
import type { Paciente } from '../api/tipos';

type Tipo = 'nombre' | 'documento' | 'historia';

@Component({
  selector: 'app-pacientes',
  imports: [Cargando, ErrorApi, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Pacientes</h1><p class="sub">Busque por nombre, documento de identidad o número de historia</p></div><span class="sp"></span><a class="btn" href="#/pacientes/solicitudes">Solicitudes</a><a class="btn pri" href="#/pacientes/nuevo">Registrar paciente</a></div>

  <div class="card col" style="gap:14px">
    <div class="fx wrap">
      <label class="search" style="flex:2 1 360px"><span class="muted">Buscar</span><input type="text" [value]="q()" (input)="q.set($any($event.target).value)" aria-label="Buscar paciente" placeholder="Rojas, 7845123 o HC-004218"></label>
      <div class="seg">
        <button type="button" [class.on]="tipo() === 'nombre'" (click)="tipo.set('nombre')">Nombre (fonética)</button>
        <button type="button" [class.on]="tipo() === 'documento'" (click)="tipo.set('documento')">Documento</button>
        <button type="button" [class.on]="tipo() === 'historia'" (click)="tipo.set('historia')">N.° de historia</button>
      </div>
    </div>
    <div class="sm muted">La búsqueda fonética encuentra «Rojas» aunque se escriba «Rohas».</div>
  </div>

  @if (pacientes.error(); as e) {
    <sigec-error [error]="e" (reintentar)="pacientes.recargar()" />
  } @else if (pacientes.cargando()) {
    <sigec-cargando [filas]="4" etiqueta="Buscando pacientes…" />
  } @else if (pacientes.items().length === 0) {
  <div class="card col" style="align-items:center;text-align:center;gap:10px;padding:56px 24px" data-testid="vacio">
    <div class="b" style="font-size:18px">{{ busqueda() ? 'No encontramos pacientes con «' + busqueda() + '»' : 'Aún no hay pacientes registrados' }}</div>
    <div class="ink2" style="max-width:420px">Revise la ortografía o busque por documento. Si es un paciente nuevo, puede registrarlo.</div>
    <a class="btn pri" href="#/pacientes/nuevo" style="height:46px">Registrar paciente</a>
  </div>
  } @else {
  <div class="card flush">
    <div class="ch"><div class="ct">{{ pacientes.items().length }}{{ pacientes.hayMas() ? '+' : '' }} resultados</div></div>
    <div class="scroll">
      <table class="tbl">
        <thead><tr><th>N.° historia</th><th>Paciente</th><th>Documento</th><th>Edad</th><th>Teléfono</th><th>Alta</th><th></th></tr></thead>
        <tbody>
          @for (f of pacientes.items(); track f.id) {
            <tr data-testid="fila-paciente">
              <td class="mono">{{ f.numeroHistoria }}</td>
              <td><div class="b">{{ f.nombre }}</div>@if (f.edad < 18) {<div class="sm muted">Menor de edad</div>}</td>
              <td class="mono">{{ f.documento }}</td><td>{{ f.edad }}</td><td>{{ f.telefono || '—' }}</td><td>{{ f.createdAt | fecha }}</td>
              <td class="tr"><a class="btn s" [attr.href]="'#/pacientes/ficha?id=' + f.id">Abrir ficha</a></td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (pacientes.hayMas()) {
      <div class="ch" style="justify-content:center"><button type="button" class="btn s" [disabled]="pacientes.cargandoMas()" (click)="pacientes.cargarMas()">{{ pacientes.cargandoMas() ? 'Cargando…' : 'Cargar más' }}</button></div>
    }
  </div>
  }
</div>`,
})
export class Pacientes {
  readonly q = signal('');
  readonly tipo = signal<Tipo>('nombre');
  readonly busqueda = conRetraso(this.q, 300);
  readonly pacientes = lista<Paciente>(() => ({ ruta: '/api/pacientes', query: { q: this.busqueda().trim() || undefined, tipo: this.tipo() } }));
}

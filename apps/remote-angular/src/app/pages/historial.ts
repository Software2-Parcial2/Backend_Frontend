import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { accion, conRetraso, lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { textoTipoAviso, type Notificacion, type Paciente, type ResumenNotificaciones } from '../api/tipos';

@Component({
  selector: 'app-historial',
  imports: [Cargando, ErrorApi, Vacio, FormsModule, ...FORMATOS],
  template: `
<div class="page">
  <div class="ph"><div><h1 class="h1">Historial de envíos</h1><p class="sub">Avisos de citas por correo y Telegram, con su estado de entrega</p></div><span class="sp"></span><a class="btn" href="#/historial/plantillas">Plantillas</a></div>
  @if (resumen.datos(); as r) {
  <div class="g4">
    <div class="card kpi"><span class="v" data-testid="kpi-total">{{ r.total }}</span><span class="l">Avisos de hoy</span></div>
    <div class="card kpi"><span class="v">{{ (r.tasaEntrega * 100).toFixed(0) }} %</span><span class="l">Entregados</span></div>
    <div class="card kpi"><span class="v">{{ r.pendientes }}</span><span class="l">En reintento</span></div>
    <div class="card kpi"><span class="v">{{ r.fallidas }}</span><span class="l">Fallidos</span></div>
  </div>
  } @else if (resumen.error(); as e) { <sigec-error [error]="e" (reintentar)="resumen.recargar()" /> }
  <div class="card col" style="gap:10px">
    <div class="ct">Paciente</div>
    @if (paciente.datos(); as p) { <div class="fx"><span class="b" data-testid="paciente-historial">{{ p.nombre }} · {{ p.numeroHistoria }}</span><span class="sp"></span><button type="button" class="btn s" (click)="quitar()">Cambiar</button></div> }
    @else {
      <input class="in" aria-label="Buscar paciente" placeholder="Nombre, documento o N.° de historia" [ngModel]="busca()" (ngModelChange)="busca.set($event)" autocomplete="off">
      @for (p of candidatos.datos() ?? []; track p.id) { <button type="button" class="btn s" style="justify-content:flex-start" data-testid="candidato" (click)="elegir(p)">{{ p.nombre }} · {{ p.numeroHistoria }}</button> }
      <span class="sm muted">El historial se consulta por paciente.</span>
    }
  </div>
  @if (pacienteId()) {
  <div class="fx wrap">
    <div class="seg">@for (c of canales; track c.v) {<button type="button" [class.on]="canal() === c.v" (click)="canal.set(c.v)">{{ c.t }}</button>}</div>
    <div class="seg">@for (e of estados; track e.v) {<button type="button" [class.on]="estado() === e.v" (click)="estado.set(e.v)">{{ e.t }}</button>}</div>
  </div>
  @if (avisos.error(); as e) { <sigec-error [error]="e" (reintentar)="avisos.recargar()" /> }
  @else if (avisos.cargando()) { <sigec-cargando [filas]="3" /> }
  @else if (!avisos.items().length) { <sigec-vacio texto="Este paciente no tiene avisos con ese filtro." /> }
  @else {
  <div class="card flush"><div class="scroll"><table class="tbl">
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Canal</th><th>Estado</th><th>Intentos</th><th></th></tr></thead>
    <tbody>
      @for (n of avisos.items(); track n.id) {
        <tr data-testid="aviso"><td class="mono">{{ n.creadaEn | fechaHora }}</td><td>{{ tipo(n.tipo) }}</td><td>{{ n.canales.join(', ') }}</td>
          <td><span [class]="'chip ' + (n.estado === 'ENVIADA' ? 'ok' : n.estado === 'FALLIDA' ? 'err' : 'warn')">{{ n.estado === 'ENVIADA' ? 'Entregado' : n.estado === 'FALLIDA' ? 'Fallido' : 'Reintentando' }}</span>@if (n.ultimoError) {<div class="sm muted">{{ n.ultimoError }}</div>}</td>
          <td>{{ n.intentos }}</td>
          <td class="tr">@if (n.estado === 'FALLIDA') {<button type="button" class="btn s" data-testid="reenviar" [disabled]="reenviar.enCurso()" (click)="reenviarAviso(n)">Reenviar</button>}</td></tr>
      }
    </tbody>
  </table></div></div>
  @if (reenviar.error(); as e) { <sigec-error [error]="e" [reintentable]="false" /> }
  @if (avisos.hayMas()) { <button type="button" class="btn" [disabled]="avisos.cargandoMas()" (click)="avisos.cargarMas()">Cargar más</button> }
  }
  }
  <div class="sm muted">Un proveedor externo puede aceptar un mensaje antes de devolver un error, por eso la entrega exactamente una vez no puede garantizarse en todos los casos.</div>
</div>`,
})
export class Historial {
  readonly canales = [{ t: 'Todos', v: '' }, { t: 'Correo', v: 'EMAIL' }, { t: 'Telegram', v: 'TELEGRAM' }];
  readonly estados = [{ t: 'Cualquier estado', v: '' }, { t: 'Reintentando', v: 'PENDIENTE' }, { t: 'Fallidos', v: 'FALLIDA' }];
  readonly canal = signal('');
  readonly estado = signal('');
  readonly elegido = signal<string | null>(null);
  private readonly deUrl = parametro('paciente');
  readonly pacienteId = computed(() => this.elegido() ?? this.deUrl());
  readonly busca = signal('');
  private readonly buscaRetraso = conRetraso(this.busca);
  readonly resumen = recurso<ResumenNotificaciones>((api, signal) => api.get<ResumenNotificaciones>('/api/notificaciones/resumen', { signal }));
  readonly paciente = recurso<Paciente>((api, signal) => (this.pacienteId() ? api.get<Paciente>(`/api/pacientes/${this.pacienteId()}`, { signal }) : null));
  readonly candidatos = recurso<Paciente[]>((api, signal) => {
    const q = this.buscaRetraso().trim();
    if (this.pacienteId() || q.length < 2) return null;
    return api.pagina<Paciente>('/api/pacientes', { query: { q, tipo: /^HC-/i.test(q) ? 'historia' : /^\d|SEED/i.test(q) ? 'documento' : 'nombre' }, limite: 5, signal }).then((p) => p.items);
  });
  readonly avisos = lista<Notificacion>(() => (this.pacienteId() ? { ruta: '/api/notificaciones', query: { pacienteId: this.pacienteId()!, canal: this.canal() || undefined, estado: this.estado() || undefined } } : null), 25);
  tipo = textoTipoAviso;
  elegir(p: Paciente) { this.elegido.set(p.id); }
  quitar() { this.elegido.set(null); this.busca.set(''); location.hash = '#/historial'; }
  readonly reenviar = accion((api, n: Notificacion) => api.post(`/api/notificaciones/${n.id}/reenviar`));
  async reenviarAviso(n: Notificacion) { await this.reenviar.ejecutar(n); this.avisos.recargar(); this.resumen.recargar(); }
}

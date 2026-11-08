import { Component, computed, inject } from '@angular/core';
import { Cargando, ErrorApi, Vacio } from '../api/estado';
import { FORMATOS } from '../api/formato';
import { CatalogoService } from '../api/catalogo.service';
import { HistoriaCabecera } from '../api/historia-cabecera';
import { HistoriaService } from '../api/historia.service';
import { lista, recurso } from '../api/recurso';
import { parametro } from '../api/ruta';
import { textoAntecedente, type Antecedente, type Consulta, type Medico, type Paciente } from '../api/tipos';
import { ContextStore } from '../context';

@Component({
  selector: 'app-historia',
  imports: [Cargando, ErrorApi, Vacio, HistoriaCabecera, ...FORMATOS],
  template: `
<div class="page">
  @if (!pacienteId()) { <sigec-vacio texto="Elija un paciente para ver su historia clínica."><a class="btn pri" href="#/pacientes">Buscar paciente</a></sigec-vacio> }
  @else if (historia.error(); as e) { <sigec-error [error]="e" (reintentar)="historia.recargar()" /> }
  @else if (historia.datos(); as h) {
    <sigec-historia-cabecera [historia]="h" activa="consultas">
      @if (paciente.datos(); as p) { <span class="sm muted">{{ p.edad }} años · {{ p.sexo === 'F' ? 'Femenino' : p.sexo === 'M' ? 'Masculino' : '—' }}</span> }
      <span class="sp"></span>
      @for (a of alergias(); track a.id) { <span class="chip warn" data-testid="alergia">Alergia: {{ a.descripcion }}</span> }
      @if (esMedico()) { <a class="btn pri" [attr.href]="'#/consulta?paciente=' + h.pacienteId" data-testid="nueva-consulta">Nueva consulta</a> }
    </sigec-historia-cabecera>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="card" style="flex:999 1 560px;min-width:0">
        <div class="ch"><div class="ct">Historial de atención</div><span class="sp"></span><span class="sm muted">Más reciente primero</span></div>
        @if (consultas.error(); as e) { <sigec-error [error]="e" (reintentar)="consultas.recargar()" /> }
        @else if (consultas.cargando()) { <sigec-cargando [filas]="3" /> }
        @else {
          <div class="tl">
            @for (c of consultas.items(); track c.id) {
              <div class="tli" data-testid="consulta"><span class="dot"></span><div style="flex:1">
                <div class="fx wrap"><span class="b">{{ c.fecha | fecha }} · {{ nombreMedico(c.medicoId) }}</span><span class="sp"></span>
                  <span [class]="'chip ' + (c.estado === 'FIRMADA' ? 'ok' : 'warn')">{{ c.estado === 'FIRMADA' ? 'Firmada' : 'Borrador' }}</span></div>
                <div class="ink2" style="margin-top:4px">{{ c.motivo }}</div>
                <div class="fx wrap" style="margin-top:8px;gap:8px">
                  @if (c.diagnostico) {<span class="tag">{{ c.diagnostico }}</span>}
                  <span class="sp"></span>
                  <a class="btn s" [attr.href]="'#/consulta?id=' + c.id">{{ c.estado === 'BORRADOR' && esMedico() ? 'Continuar' : 'Abrir' }}</a>
                  @if (c.estado === 'FIRMADA') { <a class="btn s" [attr.href]="'#/historia/receta?id=' + c.id">Receta</a> }
                </div>
              </div></div>
            } @empty { <sigec-vacio texto="Todavía no hay consultas registradas." /> }
          </div>
          @if (consultas.hayMas()) { <button type="button" class="btn" style="margin-top:12px" [disabled]="consultas.cargandoMas()" (click)="consultas.cargarMas()">Ver consultas anteriores</button> }
        }
      </div>
      <div class="col" style="flex:1 1 300px;max-width:380px;gap:16px">
        <div class="card">
          <div class="ch"><div class="ct">Antecedentes</div><span class="sp"></span><a class="btn s" [attr.href]="'#/historia/detalle?paciente=' + h.pacienteId">Gestionar</a></div>
          @for (a of antecedentes.datos() ?? []; track a.id) {
            <div class="li" style="padding:8px 0"><span class="muted" style="min-width:110px">{{ texto(a.tipo) }}</span><span [class.b]="a.tipo === 'ALERGIA'">{{ a.descripcion }}</span></div>
          } @empty { <p class="ink2">Sin antecedentes registrados.</p> }
        </div>
        <div class="banner"><div><b>Acceso registrado</b><span>Cada lectura de esta historia queda en la bitácora de auditoría.</span></div></div>
      </div>
    </div>
  } @else { <sigec-cargando [filas]="4" etiqueta="Cargando la historia clínica…" /> }
</div>`,
})
export class Historia {
  private readonly catalogo = inject(CatalogoService);
  private readonly svc = inject(HistoriaService);
  private readonly ctx = inject(ContextStore);
  readonly pacienteId = parametro('paciente');
  readonly historia = recurso((api, signal) => (this.pacienteId() ? this.svc.porPaciente(this.pacienteId()!, signal) : null));
  readonly paciente = recurso<Paciente | undefined>((api, signal) => (this.pacienteId() ? api.get<Paciente>(`/api/pacientes/${this.pacienteId()}`, { signal }).catch(() => undefined) : null));
  readonly consultas = lista<Consulta>(() => (this.historia.datos() ? { ruta: `/api/historias/${this.historia.datos()!.id}/consultas` } : null), 10);
  readonly antecedentes = recurso<Antecedente[]>((api, signal) =>
    this.historia.datos() ? api.get<{ items: Antecedente[] }>(`/api/historias/${this.historia.datos()!.id}/antecedentes`, { signal, query: { soloActivos: true } }).then((r) => r.items ?? (r as unknown as Antecedente[])) : null);
  readonly alergias = computed(() => (this.antecedentes.datos() ?? []).filter((a) => a.tipo === 'ALERGIA'));
  readonly esMedico = computed(() => (this.ctx.ctx()?.roles ?? []).includes('medico'));
  private medicos = new Map<string, Medico>();
  constructor() { void this.catalogo.medicos().then((m) => { this.medicos = m; this.consultas.recargar(); }).catch(() => undefined); }
  nombreMedico = (id: string) => this.medicos.get(id)?.nombre ?? 'Médico';
  texto = textoAntecedente;
}

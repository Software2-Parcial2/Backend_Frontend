import { Inject, Injectable, Logger } from '@nestjs/common';
import { GestionService } from '../gestion.service.js';
import type { Identidad } from '../../domain/gestion.js';
import { evaluar } from './agentes.js';
import { ALERTAS_REPO, AVISO_ALERTAS, TOKEN_SERVICIO, type AlertasRepository, type AvisoAlertasPort, type TokenServicioPort } from './ports.js';
import { AgenteInvalidoError, AGENTES, AlertaNoEncontradaError, AlertaYaAtendidaError, type Agente, type AgenteId, type Alerta, type FiltroAlertas, type PaginaAlertas } from './tipos.js';

export interface ResultadoEjecucion {
  agenteId: AgenteId;
  alertas: number;
  nuevas: number;
}

@Injectable()
export class AlertasService {
  private readonly log = new Logger('Alertas');
  /** Reloj (sustituible en pruebas). */
  ahora: () => number = () => Date.now();

  constructor(
    @Inject(ALERTAS_REPO) private readonly repo: AlertasRepository,
    @Inject(AVISO_ALERTAS) private readonly aviso: AvisoAlertasPort,
    @Inject(TOKEN_SERVICIO) private readonly tokens: TokenServicioPort,
    @Inject(GestionService) private readonly gestion: GestionService,
  ) {}

  listarAgentes(): Promise<Agente[]> {
    return this.repo.listarAgentes();
  }

  async actualizarAgente(id: string, cambios: { activo?: boolean; intervaloMin?: number; umbral?: number }): Promise<Agente> {
    const agenteId = this.agenteValido(id);
    if (cambios.intervaloMin !== undefined && (!Number.isInteger(cambios.intervaloMin) || cambios.intervaloMin < 5 || cambios.intervaloMin > 1440)) {
      throw new AgenteInvalidoError('intervaloMin debe estar entre 5 y 1440 minutos');
    }
    if (cambios.umbral !== undefined && !(cambios.umbral > 0 && cambios.umbral <= 1000)) throw new AgenteInvalidoError('umbral debe ser mayor que 0');
    const a = await this.repo.actualizarAgente(agenteId, cambios);
    if (!a) throw new AgenteInvalidoError(`No existe el agente ${id}`);
    return a;
  }

  listarAlertas(f: FiltroAlertas, limite: number, cursor?: string): Promise<PaginaAlertas> {
    return this.repo.listarAlertas(f, Math.min(Math.max(limite, 1), 100), cursor);
  }

  async obtenerAlerta(id: string): Promise<Alerta> {
    const a = await this.repo.obtenerAlerta(id);
    if (!a) throw new AlertaNoEncontradaError(`No existe la alerta ${id}`);
    return a;
  }

  async atender(id: string, usuario: string, nota?: string): Promise<Alerta> {
    const r = await this.repo.atender(id, usuario, nota?.trim() || null, new Date(this.ahora()));
    if (!r) throw new AlertaNoEncontradaError(`No existe la alerta ${id}`);
    if (r.ya) throw new AlertaYaAtendidaError('La alerta ya fue atendida');
    return r.alerta;
  }

  /** Corre un agente ahora con la identidad dada. Un fallo se anota en el agente y se propaga. */
  async ejecutar(id: string, identidad: Identidad): Promise<ResultadoEjecucion> {
    const agenteId = this.agenteValido(id);
    const agente = await this.repo.obtenerAgente(agenteId);
    if (!agente) throw new AgenteInvalidoError(`No existe el agente ${id}`);
    const inicio = new Date(this.ahora());
    try {
      const candidatas = await evaluar(agente, this.gestion, identidad, this.ahora());
      let nuevas = 0;
      for (const c of candidatas) {
        const { alerta, nueva } = await this.repo.guardarCandidata(agenteId, c);
        if (nueva) {
          nuevas++;
          await this.aviso.avisar(`${alerta.nivel}: ${alerta.titulo}`);
        }
      }
      await this.repo.registrarEjecucion(agenteId, inicio, 'OK', null, candidatas.length);
      return { agenteId, alertas: candidatas.length, nuevas };
    } catch (e) {
      await this.repo.registrarEjecucion(agenteId, inicio, 'ERROR', (e as Error).message.slice(0, 500), 0).catch(() => undefined);
      throw e;
    }
  }

  /** Lo llama el planificador: corre los agentes activos cuyo intervalo vencio, con la identidad de servicio. */
  async ejecutarVencidos(): Promise<ResultadoEjecucion[]> {
    const ahora = this.ahora();
    const vencidos = (await this.repo.listarAgentes()).filter((a) => a.activo && (!a.ultimaEjecucion || Date.parse(a.ultimaEjecucion) + a.intervaloMin * 60_000 <= ahora));
    if (vencidos.length === 0) return [];
    const identidad = await this.tokens.identidad();
    if (!identidad) return [];
    const out: ResultadoEjecucion[] = [];
    for (const a of vencidos) {
      try {
        out.push(await this.ejecutar(a.id, identidad));
      } catch (e) {
        this.log.warn(`agente ${a.id}: ${(e as Error).message}`);
      }
    }
    return out;
  }

  private agenteValido(id: string): AgenteId {
    if (!(AGENTES as string[]).includes(id)) throw new AgenteInvalidoError(`Agente desconocido: ${id}. Validos: ${AGENTES.join(', ')}`);
    return id as AgenteId;
  }
}

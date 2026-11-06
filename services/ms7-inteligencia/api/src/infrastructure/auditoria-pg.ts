import { Logger } from '@nestjs/common';
import type { AuditoriaPort, RegistroAuditoria } from '../application/agente/ports.js';
import { AuditoriaEnMemoria } from '../application/agente/auditoria.js';

/** Cliente minimo necesario (compatible con pg.Pool); permite probar sin base de datos. */
export interface Consultable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Auditoria persistente: lee de memoria (rapido, sincrono, el puerto no cambia) y escribe tambien en `agente_auditoria`
 * en segundo plano. Un fallo de la base **nunca** rompe una consulta del agente: se registra en el log y se sigue.
 */
export class AuditoriaPg implements AuditoriaPort {
  private readonly log = new Logger('AuditoriaPg');
  private avisado = false;

  constructor(
    private readonly db: () => Consultable,
    private readonly memoria: AuditoriaPort = new AuditoriaEnMemoria(),
  ) {}

  registrar(r: RegistroAuditoria): void {
    this.memoria.registrar(r);
    void this.escribir(r);
  }

  recientes(limite: number): RegistroAuditoria[] {
    return this.memoria.recientes(limite);
  }

  /** Visible para pruebas: espera la escritura. */
  async escribir(r: RegistroAuditoria): Promise<void> {
    try {
      await this.db().query(
        'INSERT INTO agente_auditoria (en, usuario, roles, herramienta, argumentos, estado, detalle, ms, bytes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [r.en, r.usuario, r.roles, r.herramienta, JSON.stringify(r.argumentos ?? null), r.estado, r.detalle ?? null, Math.round(r.ms), Math.round(r.bytes)],
      );
    } catch (e) {
      if (!this.avisado) {
        this.avisado = true;
        this.log.warn(`No se pudo persistir la auditoria (se sigue en memoria): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

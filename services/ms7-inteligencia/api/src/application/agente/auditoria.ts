import { Logger } from '@nestjs/common';
import type { AuditoriaPort, RegistroAuditoria } from './ports.js';

/** Auditoria de llamadas a herramientas: log estructurado + buffer circular en memoria (consultable por el administrador). */
export class AuditoriaEnMemoria implements AuditoriaPort {
  private readonly log = new Logger('AuditoriaAgente');
  private readonly buffer: RegistroAuditoria[] = [];
  constructor(private readonly capacidad = 500) {}

  registrar(r: RegistroAuditoria): void {
    this.buffer.push(r);
    if (this.buffer.length > this.capacidad) this.buffer.shift();
    this.log.log(JSON.stringify(r));
  }

  recientes(limite: number): RegistroAuditoria[] {
    return this.buffer.slice(-limite).reverse();
  }
}

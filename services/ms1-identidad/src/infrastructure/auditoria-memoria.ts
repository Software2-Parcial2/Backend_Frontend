import { Logger } from '@nestjs/common';
import type { AuditoriaPort } from '../application/ports.js';
import type { Auditoria } from '../domain/identidad.js';

/** Anillo en memoria + log estructurado. Keycloak guarda ademas sus propios eventos de administracion. */
export class AuditoriaEnMemoria implements AuditoriaPort {
  private readonly log = new Logger('AuditoriaIdentidad');
  private readonly items: Auditoria[] = [];

  constructor(private readonly capacidad = 500) {}

  registrar(a: Omit<Auditoria, 'en'>): void {
    const r: Auditoria = { en: new Date().toISOString(), ...a };
    this.items.push(r);
    if (this.items.length > this.capacidad) this.items.shift();
    this.log.log(JSON.stringify(r));
  }

  recientes(limite: number): Auditoria[] {
    return this.items.slice(-limite).reverse();
  }
}

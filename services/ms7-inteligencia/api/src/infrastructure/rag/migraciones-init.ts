import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { migrar } from './migraciones.js';
import { pool_ } from './pg.js';

/** Aplica las migraciones al arrancar (RAG_AUTO_MIGRATE=false lo desactiva). Si la BD no esta disponible, avisa y sigue: el RAG responde 503 hasta que lo este. */
@Injectable()
export class MigracionesInit implements OnModuleInit {
  private readonly log = new Logger('Migraciones');

  async onModuleInit(): Promise<void> {
    if (process.env.RAG_AUTO_MIGRATE === 'false') return;
    try {
      const aplicadas = await migrar(pool_());
      if (aplicadas.length) this.log.log(`Migraciones aplicadas: ${aplicadas.join(', ')}`);
    } catch (e) {
      this.log.warn(`No se pudieron aplicar las migraciones: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

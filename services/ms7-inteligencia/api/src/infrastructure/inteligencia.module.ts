import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { MessagingModule, queueSpec, RabbitConnection, RabbitConsumer } from '@sigec/messaging-nest';
import { AlertasService } from '../application/alertas/alertas.service.js';
import { ALERTAS_REPO, ASISTENCIA_REPO, AVISO_ALERTAS, TOKEN_SERVICIO, type AsistenciaRepository } from '../application/alertas/ports.js';
import { AvisoLog, AvisoN8n } from './alertas/aviso-n8n.js';
import { PgAlertasRepository, PgAsistenciaRepository } from './alertas/pg-alertas.repository.js';
import { TokenServicio } from './alertas/token-servicio.js';
import { AlertasController } from './http/alertas.controller.js';
import { AgenteService, OPCIONES_AGENTE, type OpcionesAgente } from '../application/agente/agente.service.js';
import { AuditoriaEnMemoria } from '../application/agente/auditoria.js';
import { AuditoriaPg } from './auditoria-pg.js';
import { pool_ } from './rag/pg.js';
import { AUDITORIA_PORT, LLM_PORT, POLITICAS_PORT } from '../application/agente/ports.js';
import { GestionService } from '../application/gestion.service.js';
import { ListarAnalisisUseCase } from '../application/listar-inteligencia.use-case.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY } from '../application/ports.js';
import { EMBEDDINGS_PORT, RAG_FUENTE, RAG_REPO } from '../application/rag/ports.js';
import { OPCIONES_RAG, RagService } from '../application/rag/rag.service.js';
import { TRANSCRIPCION_PORT } from '../application/voz/ports.js';
import { VozService } from '../application/voz/voz.service.js';
import { ReportesService } from '../application/reportes/reportes.service.js';
import { WhisperHttpClient } from './clients/whisper.client.js';
import { CitasHttpClient } from './clients/citas.client.js';
import { FacturacionHttpClient } from './clients/facturacion.client.js';
import { MlHttpClient } from './clients/ml.client.js';
import { GestionResolver } from './graphql/gestion.resolver.js';
import { RagController } from './http/rag.controller.js';
import { DocumentosEnDisco } from './rag/docs-fs.js';
import { EmbeddingsHttpClient } from './rag/embeddings.client.js';
import { MigracionesInit } from './rag/migraciones-init.js';
import { PgRagRepository } from './rag/pg-rag.repository.js';
import { AgenteController } from './http/agente.controller.js';
import { AnalisisController } from './http/inteligencia.controller.js';
import { crearLlm } from './llm/llm.factory.js';

/**
 * Consumidor de `cita.asistencia-registrada` (inasistencias reales para el modelo) y planificador de los agentes de monitoreo.
 * No arranca en pruebas (NODE_ENV=test) ni con MS7_WORKERS=off. La asistencia es un upsert por cita: la reentrega es inocua.
 */
@Injectable()
class MonitoreoWorkers implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Monitoreo');
  private consumer?: RabbitConsumer;
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    @Inject(AlertasService) private readonly alertas: AlertasService,
    @Inject(ASISTENCIA_REPO) private readonly asistencia: AsistenciaRepository,
    @Inject(RabbitConnection) private readonly connection: RabbitConnection,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.MS7_WORKERS === 'off') return;
    this.consumer = new RabbitConsumer(this.connection, {
      spec: queueSpec('ms7.eventos'),
      onLog: (m) => this.log.log(m),
      handler: async (env) => {
        if (env.type !== 'cita.asistencia-registrada') return;
        const p = env.payload;
        await this.asistencia.registrar({
          citaId: String(p.citaId),
          pacienteId: String(p.pacienteId),
          medicoId: p.medicoId ? String(p.medicoId) : null,
          fechaHora: String(p.fechaHora),
          asistencia: p.asistencia as 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO',
        });
      },
    });
    this.consumer.start().catch((e: Error) => this.log.warn(`consumidor: ${e.message}`));
    this.timer = setInterval(() => void this.barrer(), Number(process.env.AGENTES_SWEEP_MS ?? 60_000));
  }

  private async barrer() {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await this.alertas.ejecutarVencidos();
      for (const x of r) this.log.log(`agente ${x.agenteId}: ${x.alertas} alerta(s), ${x.nuevas} nueva(s)`);
    } catch (e) {
      this.log.warn(`planificador: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.consumer?.stop();
  }
}

const opcionesAgente = (): OpcionesAgente => ({
  maxIteraciones: Number(process.env.AGENTE_MAX_ITERACIONES ?? 5),
  timeoutMs: Number(process.env.AGENTE_TIMEOUT_MS ?? 30_000),
  maxLlamadasPorTurno: Number(process.env.AGENTE_MAX_LLAMADAS_TURNO ?? 4),
  maxConsultasPorHora: Number(process.env.AGENTE_MAX_CONSULTAS_HORA ?? 30),
});

@Module({
  imports: [MessagingModule.forRoot()],
  controllers: [AnalisisController, AgenteController, RagController, AlertasController],
  providers: [
    { provide: ListarAnalisisUseCase, useFactory: () => new ListarAnalisisUseCase() },
    { provide: CITAS_GATEWAY, useClass: CitasHttpClient },
    { provide: FACTURACION_GATEWAY, useClass: FacturacionHttpClient },
    { provide: ML_GATEWAY, useClass: MlHttpClient },
    { provide: LLM_PORT, useFactory: () => crearLlm() },
    { provide: AUDITORIA_PORT, useFactory: () => (process.env.AUDITORIA_PERSISTENTE === 'false' ? new AuditoriaEnMemoria() : new AuditoriaPg(pool_)) },
    { provide: EMBEDDINGS_PORT, useClass: EmbeddingsHttpClient },
    { provide: RAG_REPO, useClass: PgRagRepository },
    { provide: RAG_FUENTE, useClass: DocumentosEnDisco },
    { provide: OPCIONES_RAG, useFactory: () => ({ chunkChars: Number(process.env.RAG_CHUNK_CHARS ?? 480), solape: Number(process.env.RAG_SOLAPE ?? 80), scoreMinimo: Number(process.env.RAG_SCORE_MINIMO ?? 0.3) }) },
    RagService,
    MigracionesInit,
    { provide: POLITICAS_PORT, useExisting: RagService },
    { provide: OPCIONES_AGENTE, useFactory: opcionesAgente },
    { provide: ALERTAS_REPO, useFactory: () => new PgAlertasRepository(pool_) },
    { provide: ASISTENCIA_REPO, useFactory: () => new PgAsistenciaRepository(pool_) },
    { provide: AVISO_ALERTAS, useFactory: () => (process.env.AVISO_ALERTAS === 'off' ? new AvisoLog() : new AvisoN8n()) },
    { provide: TOKEN_SERVICIO, useFactory: () => new TokenServicio() },
    GestionService,
    AlertasService,
    MonitoreoWorkers,
    ReportesService,
    AgenteService,
    { provide: TRANSCRIPCION_PORT, useClass: WhisperHttpClient },
    VozService,
    GestionResolver,
  ],
  exports: [GestionService, ReportesService, AgenteService, AlertasService],
})
export class AnalisisModule {}

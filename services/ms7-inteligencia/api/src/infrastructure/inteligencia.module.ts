import { Module } from '@nestjs/common';
import { AgenteService, OPCIONES_AGENTE, type OpcionesAgente } from '../application/agente/agente.service.js';
import { AuditoriaEnMemoria } from '../application/agente/auditoria.js';
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

const opcionesAgente = (): OpcionesAgente => ({
  maxIteraciones: Number(process.env.AGENTE_MAX_ITERACIONES ?? 5),
  timeoutMs: Number(process.env.AGENTE_TIMEOUT_MS ?? 30_000),
  maxLlamadasPorTurno: Number(process.env.AGENTE_MAX_LLAMADAS_TURNO ?? 4),
  maxConsultasPorHora: Number(process.env.AGENTE_MAX_CONSULTAS_HORA ?? 30),
});

@Module({
  controllers: [AnalisisController, AgenteController, RagController],
  providers: [
    { provide: ListarAnalisisUseCase, useFactory: () => new ListarAnalisisUseCase() },
    { provide: CITAS_GATEWAY, useClass: CitasHttpClient },
    { provide: FACTURACION_GATEWAY, useClass: FacturacionHttpClient },
    { provide: ML_GATEWAY, useClass: MlHttpClient },
    { provide: LLM_PORT, useFactory: () => crearLlm() },
    { provide: AUDITORIA_PORT, useFactory: () => new AuditoriaEnMemoria() },
    { provide: EMBEDDINGS_PORT, useClass: EmbeddingsHttpClient },
    { provide: RAG_REPO, useClass: PgRagRepository },
    { provide: RAG_FUENTE, useClass: DocumentosEnDisco },
    { provide: OPCIONES_RAG, useFactory: () => ({ chunkChars: Number(process.env.RAG_CHUNK_CHARS ?? 480), solape: Number(process.env.RAG_SOLAPE ?? 80), scoreMinimo: Number(process.env.RAG_SCORE_MINIMO ?? 0.3) }) },
    RagService,
    MigracionesInit,
    { provide: POLITICAS_PORT, useExisting: RagService },
    { provide: OPCIONES_AGENTE, useFactory: opcionesAgente },
    GestionService,
    ReportesService,
    AgenteService,
    { provide: TRANSCRIPCION_PORT, useClass: WhisperHttpClient },
    VozService,
    GestionResolver,
  ],
  exports: [GestionService, ReportesService, AgenteService],
})
export class AnalisisModule {}

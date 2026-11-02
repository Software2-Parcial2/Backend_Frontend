import { Module } from '@nestjs/common';
import { AgenteService, OPCIONES_AGENTE, type OpcionesAgente } from '../application/agente/agente.service.js';
import { AuditoriaEnMemoria } from '../application/agente/auditoria.js';
import { AUDITORIA_PORT, LLM_PORT, POLITICAS_PORT, type PoliticasPort } from '../application/agente/ports.js';
import { GestionService } from '../application/gestion.service.js';
import { ListarAnalisisUseCase } from '../application/listar-inteligencia.use-case.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY } from '../application/ports.js';
import { ReportesService } from '../application/reportes/reportes.service.js';
import { CitasHttpClient } from './clients/citas.client.js';
import { FacturacionHttpClient } from './clients/facturacion.client.js';
import { MlHttpClient } from './clients/ml.client.js';
import { GestionResolver } from './graphql/gestion.resolver.js';
import { AgenteController } from './http/agente.controller.js';
import { AnalisisController } from './http/inteligencia.controller.js';
import { crearLlm } from './llm/llm.factory.js';

/** Hasta que L4 incorpore el RAG, la busqueda de politicas responde que no hay informacion. */
const politicasNoDisponibles: PoliticasPort = { buscar: async () => [] };

const opcionesAgente = (): OpcionesAgente => ({
  maxIteraciones: Number(process.env.AGENTE_MAX_ITERACIONES ?? 5),
  timeoutMs: Number(process.env.AGENTE_TIMEOUT_MS ?? 30_000),
  maxLlamadasPorTurno: Number(process.env.AGENTE_MAX_LLAMADAS_TURNO ?? 4),
  maxConsultasPorHora: Number(process.env.AGENTE_MAX_CONSULTAS_HORA ?? 30),
});

@Module({
  controllers: [AnalisisController, AgenteController],
  providers: [
    { provide: ListarAnalisisUseCase, useFactory: () => new ListarAnalisisUseCase() },
    { provide: CITAS_GATEWAY, useClass: CitasHttpClient },
    { provide: FACTURACION_GATEWAY, useClass: FacturacionHttpClient },
    { provide: ML_GATEWAY, useClass: MlHttpClient },
    { provide: LLM_PORT, useFactory: () => crearLlm() },
    { provide: AUDITORIA_PORT, useFactory: () => new AuditoriaEnMemoria() },
    { provide: POLITICAS_PORT, useValue: politicasNoDisponibles },
    { provide: OPCIONES_AGENTE, useFactory: opcionesAgente },
    GestionService,
    ReportesService,
    AgenteService,
    GestionResolver,
  ],
  exports: [GestionService, ReportesService, AgenteService],
})
export class AnalisisModule {}

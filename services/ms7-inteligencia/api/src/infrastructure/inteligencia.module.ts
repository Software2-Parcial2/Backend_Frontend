import { Module } from '@nestjs/common';
import { GestionService } from '../application/gestion.service.js';
import { ListarAnalisisUseCase } from '../application/listar-inteligencia.use-case.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY } from '../application/ports.js';
import { CitasHttpClient } from './clients/citas.client.js';
import { FacturacionHttpClient } from './clients/facturacion.client.js';
import { MlHttpClient } from './clients/ml.client.js';
import { GestionResolver } from './graphql/gestion.resolver.js';
import { AnalisisController } from './http/inteligencia.controller.js';

@Module({
  controllers: [AnalisisController],
  providers: [
    { provide: ListarAnalisisUseCase, useFactory: () => new ListarAnalisisUseCase() },
    { provide: CITAS_GATEWAY, useClass: CitasHttpClient },
    { provide: FACTURACION_GATEWAY, useClass: FacturacionHttpClient },
    { provide: ML_GATEWAY, useClass: MlHttpClient },
    GestionService,
    GestionResolver,
  ],
  exports: [GestionService],
})
export class AnalisisModule {}

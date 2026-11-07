import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { verificarContratoOpenApi } from '@sigec/http-nest';
import { AppModule } from './../src/app.module.js';

/** El contrato REST versionado en contracts/openapi debe coincidir con el que genera el codigo (deriva = fallo). */
describe('contrato OpenAPI de ms8-notificaciones', () => {
  it('coincide con contracts/openapi/ms8-notificaciones.json', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const config = new DocumentBuilder().setTitle('ms8-notificaciones').setVersion('0.1.0').addBearerAuth().build();
    verificarContratoOpenApi(SwaggerModule.createDocument(app, config), 'ms8-notificaciones');
    await app.close();
  });
});

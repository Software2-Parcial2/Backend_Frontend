import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { verificarContratoOpenApi } from '@sigec/http-nest';
import { AppModule } from './../src/app.module.js';

/** El contrato REST versionado en contracts/openapi debe coincidir con el que genera el codigo (deriva = fallo). */
describe('contrato OpenAPI de ms5-api', () => {
  it('coincide con contracts/openapi/ms5-api.json', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const config = new DocumentBuilder().setTitle('ms5-api').setVersion('0.1.0').addBearerAuth().build();
    verificarContratoOpenApi(SwaggerModule.createDocument(app, config), 'ms5-api');
    await app.close();
  });
});

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { verificarContratoOpenApi } from '@sigec/http-nest';
import { AppModule } from './../src/app.module.js';

/** El contrato REST versionado en contracts/openapi debe coincidir con el que genera el codigo (deriva = fallo). */
describe('contrato OpenAPI de ms7-api', () => {
  it('coincide con contracts/openapi/ms7-api.json', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const config = new DocumentBuilder().setTitle('ms7-api').setVersion('0.1.0').addBearerAuth().build();
    verificarContratoOpenApi(SwaggerModule.createDocument(app, config), 'ms7-api');
    await app.close();
  });
});

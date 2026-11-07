import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { verificarContratoOpenApi } from '@sigec/http-nest';
import { AppModule } from './../src/app.module.js';

/** El contrato REST versionado en contracts/openapi debe coincidir con el que genera el codigo (deriva = fallo). */
describe('contrato OpenAPI de ms1-identidad', () => {
  it('coincide con contracts/openapi/ms1-identidad.json', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    const config = new DocumentBuilder().setTitle('ms1-identidad').setVersion('0.1.0').addBearerAuth().build();
    verificarContratoOpenApi(SwaggerModule.createDocument(app, config), 'ms1-identidad');
    await app.close();
  });
});

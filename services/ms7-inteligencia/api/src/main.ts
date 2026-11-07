import { aplicarConvenciones } from '@sigec/http-nest';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // El CORS se gestiona solo en el gateway.
  // Validacion estricta, errores problem+json y X-Correlation-Id (packages/http-nest).
  aplicarConvenciones(app);

  const config = new DocumentBuilder()
    .setTitle('ms7-api')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 3007);
}
await bootstrap();

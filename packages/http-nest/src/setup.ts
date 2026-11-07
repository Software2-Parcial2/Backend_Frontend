import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { correlationMiddleware } from './correlation.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

/**
 * Convenciones HTTP de SIGEC en un solo paso: correlacion, validacion estricta y errores problem+json.
 * Llamar en `main.ts` (y en los tests e2e) despues de `NestFactory.create`.
 */
export function aplicarConvenciones(app: INestApplication): void {
  app.use(correlationMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());
}

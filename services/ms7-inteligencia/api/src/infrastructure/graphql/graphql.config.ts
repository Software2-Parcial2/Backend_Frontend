import type { ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloDriver } from '@nestjs/apollo';
import { limitarConsulta } from './reglas-validacion.js';

/** Configuracion de GraphQL (una sola vez para la app y las pruebas). Introspeccion apagada en produccion. */
export function graphqlConfig(env: NodeJS.ProcessEnv = process.env): ApolloDriverConfig {
  return {
    driver: ApolloDriver,
    path: '/graphql',
    autoSchemaFile: true,
    sortSchema: true,
    introspection: env.NODE_ENV !== 'production',
    playground: false,
    csrfPrevention: true,
    includeStacktraceInErrorResponses: false,
    context: ({ req }: { req: unknown }) => ({ req }),
    validationRules: [
      limitarConsulta({ maxProfundidad: Number(env.GRAPHQL_MAX_DEPTH ?? 6), maxComplejidad: Number(env.GRAPHQL_MAX_COMPLEXITY ?? 120) }),
    ],
  };
}

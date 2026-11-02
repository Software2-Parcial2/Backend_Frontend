import type { ExecutionContext } from '@nestjs/common';

/**
 * Devuelve el objeto de peticion HTTP tanto en contexto HTTP como GraphQL (donde el 3.er argumento del resolver es el
 * contexto de Apollo y debe exponer `req`). Sin importar @nestjs/graphql para no acoplar el paquete.
 */
export function requestOf<T = unknown>(context: ExecutionContext): T {
  if (context.getType<string>() === 'graphql') {
    const gqlContext = context.getArgs()[2] as { req?: T } | undefined;
    if (!gqlContext?.req) throw new Error('El contexto GraphQL no expone `req`');
    return gqlContext.req;
  }
  return context.switchToHttp().getRequest<T>();
}

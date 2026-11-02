import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.constants.js';
import { requestOf } from './request.js';

/** Marca una ruta (o controlador) como abierta: no exige JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige que el usuario tenga al menos uno de los roles indicados. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/** Inyecta el usuario autenticado (AuthUser) en el parametro del handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    requestOf<{ user?: AuthUser }>(ctx).user,
);

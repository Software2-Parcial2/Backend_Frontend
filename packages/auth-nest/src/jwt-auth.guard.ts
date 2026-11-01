import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthOptions, AuthUser } from './auth-user.js';
import { AUTH_OPTIONS, IS_PUBLIC_KEY } from './auth.constants.js';

interface HttpRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
}

/**
 * Guard global: valida firma (JWKS de Keycloak), issuer y expiracion del JWT, y deja
 * el usuario con sus roles en request.user. Las rutas con @Public() se omiten.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions,
  ) {
    // No hace red hasta la primera verificacion; jose cachea y refresca las claves.
    this.jwks = createRemoteJWKSet(new URL(options.jwksUri));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const [scheme, token] = value?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Falta el token Bearer');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.options.issuer,
      });
      const realmAccess = payload['realm_access'] as { roles?: string[] } | undefined;
      request.user = {
        sub: String(payload.sub),
        username: payload['preferred_username'] as string | undefined,
        email: payload['email'] as string | undefined,
        roles: realmAccess?.roles ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
  }
}

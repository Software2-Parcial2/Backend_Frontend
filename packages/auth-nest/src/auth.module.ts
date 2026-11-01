import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthOptions, DEFAULT_ISSUER } from './auth-user.js';
import { AUTH_OPTIONS } from './auth.constants.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Module({})
export class AuthModule {
  /**
   * Registra JwtAuthGuard y RolesGuard como guards globales (en ese orden).
   * Sin opciones, usa KEYCLOAK_ISSUER / KEYCLOAK_JWKS_URL del entorno.
   */
  static forRoot(options: Partial<AuthOptions> = {}): DynamicModule {
    const issuer = options.issuer ?? process.env.KEYCLOAK_ISSUER ?? DEFAULT_ISSUER;
    const jwksUri =
      options.jwksUri ??
      process.env.KEYCLOAK_JWKS_URL ??
      `${issuer}/protocol/openid-connect/certs`;

    return {
      module: AuthModule,
      providers: [
        { provide: AUTH_OPTIONS, useValue: { issuer, jwksUri } satisfies AuthOptions },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    };
  }
}

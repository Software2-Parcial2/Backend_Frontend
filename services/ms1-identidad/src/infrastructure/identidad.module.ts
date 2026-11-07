import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SONDA_PORT, SaludService } from '../application/salud.service.js';
import { AUDITORIA, KEYCLOAK_ADMIN, SONDAS } from '../application/ports.js';
import { UsuariosService } from '../application/usuarios.service.js';
import { AuditoriaEnMemoria } from './auditoria-memoria.js';
import { IdentidadController } from './http/identidad.controller.js';
import { SaludController } from './http/salud.controller.js';
import { KeycloakAdminClient } from './keycloak/keycloak-admin.client.js';
import { SondaHttp, sondasPorDefecto } from './sonda-http.js';

@Module({
  imports: [TerminusModule],
  controllers: [IdentidadController, SaludController],
  providers: [
    {
      provide: KEYCLOAK_ADMIN,
      // El cliente no abre nada hasta la primera operacion: el servicio arranca (y /health responde) aunque Keycloak este caido.
      useFactory: () =>
        new KeycloakAdminClient({
          url: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
          realm: process.env.KEYCLOAK_REALM ?? 'sigec',
          clientId: process.env.MS1_CLIENT_ID ?? 'sigec-identidad',
          clientSecret: process.env.MS1_CLIENT_SECRET ?? '',
          timeoutMs: Number(process.env.KEYCLOAK_TIMEOUT_MS ?? 8000),
        }),
    },
    { provide: AUDITORIA, useFactory: () => new AuditoriaEnMemoria() },
    { provide: SONDAS, useFactory: () => sondasPorDefecto() },
    { provide: SONDA_PORT, useFactory: () => new SondaHttp() },
    { provide: SaludService, useFactory: (sondas, sonda) => new SaludService(sondas, sonda), inject: [SONDAS, SONDA_PORT] },
    UsuariosService,
  ],
})
export class IdentidadModule {}

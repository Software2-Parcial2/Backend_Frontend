import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SONDA_PORT, SaludService } from '../application/salud.service.js';
import { AccesoPacientesService } from '../application/acceso-pacientes.service.js';
import { AUDITORIA, KEYCLOAK_ADMIN, PACIENTES, SONDAS } from '../application/ports.js';
import { UsuariosService } from '../application/usuarios.service.js';
import { AuditoriaEnMemoria } from './auditoria-memoria.js';
import { AccesoPacientesController } from './http/acceso-pacientes.controller.js';
import { IdentidadController } from './http/identidad.controller.js';
import { SaludController } from './http/salud.controller.js';
import { KeycloakAdminClient } from './keycloak/keycloak-admin.client.js';
import { PacientesHttp } from './ms2/pacientes-http.js';
import { SondaHttp, sondasPorDefecto } from './sonda-http.js';

@Module({
  imports: [TerminusModule],
  controllers: [IdentidadController, AccesoPacientesController, SaludController],
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
          // El enlace del correo de activacion devuelve al paciente a la PWA.
          invitacion: {
            clientId: process.env.PWA_CLIENT_ID ?? 'sigec-pwa',
            redirectUri: process.env.PWA_URL ?? 'http://localhost:5174/',
            vidaSegundos: Number(process.env.INVITACION_VIDA_SEGUNDOS ?? 259_200),
          },
        }),
    },
    { provide: PACIENTES, useFactory: () => new PacientesHttp({ url: process.env.MS2_URL ?? 'http://localhost:8082', timeoutMs: Number(process.env.MS2_TIMEOUT_MS ?? 5000) }) },
    { provide: AUDITORIA, useFactory: () => new AuditoriaEnMemoria() },
    { provide: SONDAS, useFactory: () => sondasPorDefecto() },
    { provide: SONDA_PORT, useFactory: () => new SondaHttp() },
    { provide: SaludService, useFactory: (sondas, sonda) => new SaludService(sondas, sonda), inject: [SONDAS, SONDA_PORT] },
    UsuariosService,
    AccesoPacientesService,
  ],
})
export class IdentidadModule {}

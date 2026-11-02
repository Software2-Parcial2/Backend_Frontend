import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule } from '@sigec/auth-nest';
import { graphqlConfig } from './infrastructure/graphql/graphql.config.js';
import { HealthController } from './infrastructure/http/health.controller.js';
import { AnalisisModule } from './infrastructure/inteligencia.module.js';

@Module({
  // GraphQL solo en este servicio; CORS solo en el gateway.
  imports: [TerminusModule, AuthModule.forRoot(), GraphQLModule.forRoot(graphqlConfig()), AnalisisModule],
  controllers: [HealthController],
})
export class AppModule {}

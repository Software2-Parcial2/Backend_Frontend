import { Inject } from '@nestjs/common';
import { Args, Context, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser, Roles, type AuthUser } from '@sigec/auth-nest';
import DataLoader from 'dataloader';
import { GestionService } from '../../application/gestion.service.js';
import type { CitaResumen, Identidad, RiesgoInasistencia } from '../../domain/gestion.js';
import { ROLES_GESTION, ROLES_INGRESOS } from '../../application/roles.js';
import { traducir } from '../errores.js';
import {
  CitaRiesgoType, CitaType, DemandaType, IngresoPeriodoType, IngresosArgs, PaginaArgs, PaginaCitasType, ResumenCitasArgs,
  ResumenCitasType, RiesgoArgs, RiesgoType,
} from './tipos.js';

interface ContextoGql {
  req: { headers: { authorization?: string } };
  loaderRiesgo?: DataLoader<CitaResumen, RiesgoInasistencia | null, string>;
}

export function identidadDe(ctx: ContextoGql, user: AuthUser | undefined): Identidad {
  const token = ctx.req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return { token, roles: user?.roles ?? [], usuario: user?.username ?? user?.sub ?? 'desconocido' };
}

@Resolver(() => CitaType)
export class GestionResolver {
  constructor(@Inject(GestionService) private readonly gestion: GestionService) {}

  @Roles(...ROLES_GESTION)
  @Query(() => ResumenCitasType, { description: 'Resumen de citas por periodo agrupado por especialidad, medico, estado o mes' })
  resumenCitas(@Args() a: ResumenCitasArgs, @Context() ctx: ContextoGql, @CurrentUser() u?: AuthUser) {
    return traducir(this.gestion.resumenCitas(identidadDe(ctx, u), a.desde, a.hasta, a.agruparPor));
  }

  @Roles(...ROLES_INGRESOS)
  @Query(() => [IngresoPeriodoType], { description: 'Ingresos por periodo (lee MS6)' })
  ingresos(@Args() a: IngresosArgs, @Context() ctx: ContextoGql, @CurrentUser() u?: AuthUser) {
    return traducir(this.gestion.ingresos(identidadDe(ctx, u), a.desde, a.hasta, a.agrupar));
  }

  @Roles(...ROLES_GESTION)
  @Query(() => DemandaType, { description: 'Demanda por especialidad (segmentos K-means)' })
  demandaEspecialidades() {
    return traducir(this.gestion.demanda());
  }

  @Roles(...ROLES_GESTION)
  @Query(() => [CitaRiesgoType], { description: 'Citas proximas ordenadas por riesgo de inasistencia (Random Forest)' })
  riesgoInasistencia(@Args() a: RiesgoArgs, @Context() ctx: ContextoGql, @CurrentUser() u?: AuthUser) {
    return traducir(this.gestion.riesgoProximasCitas(identidadDe(ctx, u), a.dias, a.limite));
  }

  @Roles(...ROLES_GESTION)
  @Query(() => PaginaCitasType, { description: 'Listado paginado por cursor; `riesgo` se calcula por lotes (DataLoader) solo si se solicita' })
  citas(@Args() a: PaginaArgs, @Context() ctx: ContextoGql, @CurrentUser() u?: AuthUser) {
    return traducir(this.gestion.listarCitas(identidadDe(ctx, u), a.limite, a.cursor));
  }

  /**
   * Evita el N+1: pedir `riesgo` en 100 citas produce UNA llamada al servicio de ML (el DataLoader agrupa las claves
   * resueltas en el mismo tick y se recrea por peticion, asi no se comparte cache entre usuarios).
   */
  @ResolveField(() => RiesgoType, { nullable: true })
  riesgo(@Parent() cita: CitaResumen & { riesgo?: RiesgoInasistencia | null }, @Context() ctx: ContextoGql) {
    if (cita.riesgo !== undefined) return cita.riesgo; // ya calculado por riesgoInasistencia
    ctx.loaderRiesgo ??= new DataLoader<CitaResumen, RiesgoInasistencia | null, string>(
      async (citas) => {
        try {
          return await this.gestion.riesgoDeCitas([...citas]);
        } catch {
          return citas.map(() => null); // el riesgo es accesorio: si ML cae, la lista de citas sigue funcionando
        }
      },
      { cacheKeyFn: (c) => c.citaId },
    );
    return ctx.loaderRiesgo.load(cita);
  }
}

import { ArgsType, Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export enum AgruparCitasPorGql { ESPECIALIDAD = 'ESPECIALIDAD', MEDICO = 'MEDICO', ESTADO = 'ESTADO', MES = 'MES' }
export enum AgruparIngresosGql { DIA = 'dia', MES = 'mes' }
export enum NivelRiesgoGql { BAJO = 'BAJO', MEDIO = 'MEDIO', ALTO = 'ALTO' }
registerEnumType(AgruparCitasPorGql, { name: 'AgruparCitasPor' });
registerEnumType(AgruparIngresosGql, { name: 'AgruparIngresos' });
registerEnumType(NivelRiesgoGql, { name: 'NivelRiesgo' });

@ObjectType('Riesgo')
export class RiesgoType {
  @Field(() => Float) probabilidad!: number;
  @Field(() => NivelRiesgoGql) riesgo!: NivelRiesgoGql;
  @Field() versionModelo!: string;
  @Field() sintetico!: boolean;
  @Field(() => [String], { description: 'Atributos que SIGEC aun no registra y se sustituyen por valores neutros' }) atributosEstimados!: string[];
}

@ObjectType('Cita')
export class CitaType {
  @Field() citaId!: string;
  @Field() estado!: string;
  @Field() pacienteId!: string;
  @Field() medicoId!: string;
  @Field() especialidad!: string;
  @Field() fechaHora!: string;
  @Field() creadaEn!: string;
  @Field() notificacion!: string;
  @Field(() => RiesgoType, { nullable: true, description: 'Riesgo de inasistencia (se calcula por lotes solo si se pide)' }) riesgo?: RiesgoType | null;
}

@ObjectType('PaginaCitas')
export class PaginaCitasType {
  @Field(() => [CitaType]) items!: CitaType[];
  @Field(() => String, { nullable: true, description: 'Cursor opaco de la pagina siguiente' }) siguiente!: string | null;
}

@ObjectType('GrupoCitas')
export class GrupoCitasType {
  @Field() clave!: string;
  @Field(() => Int) total!: number;
  @Field(() => Int) confirmadas!: number;
  @Field(() => Int) canceladas!: number;
}

@ObjectType('ResumenCitas')
export class ResumenCitasType {
  @Field() desde!: string;
  @Field() hasta!: string;
  @Field(() => AgruparCitasPorGql) agrupadoPor!: AgruparCitasPorGql;
  @Field(() => Int) total!: number;
  @Field(() => [GrupoCitasType]) grupos!: GrupoCitasType[];
  @Field({ description: 'true si el resumen es parcial por haber alcanzado el limite de citas leidas' }) truncado!: boolean;
}

@ObjectType('IngresoPeriodo')
export class IngresoPeriodoType {
  @Field() periodo!: string;
  @Field(() => Float) confirmado!: number;
  @Field(() => Float) provisional!: number;
  @Field(() => Int) facturas!: number;
}

@ObjectType('SegmentoDemanda')
export class SegmentoDemandaType {
  @Field(() => Int) id!: number;
  @Field() etiqueta!: string;
  @Field(() => Int) observaciones!: number;
  @Field(() => [String]) especialidades!: string[];
}

@ObjectType('DemandaEspecialidad')
export class DemandaEspecialidadType {
  @Field() especialidad!: string;
  @Field(() => Int) segmento!: number;
  @Field() etiqueta!: string;
  @Field(() => Float) citasPorSemana!: number;
  @Field(() => Int) citasTotal!: number;
}

@ObjectType('Demanda')
export class DemandaType {
  @Field(() => Int) k!: number;
  @Field(() => Float, { nullable: true }) silueta!: number | null;
  @Field() fuente!: string;
  @Field() sintetico!: boolean;
  @Field(() => [SegmentoDemandaType]) segmentos!: SegmentoDemandaType[];
  @Field(() => [DemandaEspecialidadType]) especialidades!: DemandaEspecialidadType[];
}

@ObjectType('CitaRiesgo')
export class CitaRiesgoType extends CitaType {}

const FECHA = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

@ArgsType()
export class RangoArgs {
  @Field({ description: 'AAAA-MM-DD o ISO 8601' }) @IsISO8601() @Matches(FECHA) desde!: string;
  @Field({ description: 'AAAA-MM-DD o ISO 8601 (maximo 366 dias de rango)' }) @IsISO8601() @Matches(FECHA) hasta!: string;
}

@ArgsType()
export class ResumenCitasArgs extends RangoArgs {
  @Field(() => AgruparCitasPorGql, { defaultValue: AgruparCitasPorGql.ESPECIALIDAD }) @IsEnum(AgruparCitasPorGql) agruparPor!: AgruparCitasPorGql;
}

@ArgsType()
export class IngresosArgs extends RangoArgs {
  @Field(() => AgruparIngresosGql, { defaultValue: AgruparIngresosGql.MES }) @IsEnum(AgruparIngresosGql) agrupar!: AgruparIngresosGql;
}

@ArgsType()
export class RiesgoArgs {
  @Field(() => Int, { defaultValue: 7 }) @IsInt() @Min(1) @Max(60) dias!: number;
  @Field(() => Int, { defaultValue: 50 }) @IsInt() @Min(1) @Max(200) limite!: number;
}

@ArgsType()
export class PaginaArgs {
  @Field(() => Int, { defaultValue: 20 }) @IsInt() @Min(1) @Max(100) limite!: number;
  @Field(() => String, { nullable: true }) @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
}


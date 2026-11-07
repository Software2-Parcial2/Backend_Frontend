import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class AgendaDto {
  /** Dia (hora local de la clinica), AAAA-MM-DD. */
  @Matches(FECHA, { message: 'fecha debe ser AAAA-MM-DD' }) fecha!: string;
  /** Codigo de especialidad (ej. cardiologia). */
  @IsOptional() @IsString() especialidad?: string;
  @IsOptional() @IsString() consultorio?: string;
}

export class MiAgendaDto {
  @Matches(FECHA, { message: 'fecha debe ser AAAA-MM-DD' }) fecha!: string;
}

export class ResumenDto {
  @IsDateString() desde!: string;
  @IsDateString() hasta!: string;
  @IsOptional() @IsIn(['especialidad', 'medico', 'estado', 'mes']) agruparPor?: 'especialidad' | 'medico' | 'estado' | 'mes';
}

export class DiaDto {
  /** 1 = lunes ... 7 = domingo. */
  @Type(() => Number) @IsInt() @Min(1) @Max(7) dia!: number;
  @IsBoolean() atiende!: boolean;
  @IsOptional() @IsString() @MaxLength(5) desde?: string;
  @IsOptional() @IsString() @MaxLength(5) hasta?: string;
  @IsOptional() @IsString() @MaxLength(30) consultorio?: string;
}

export class PlantillaDto {
  /** Minutos por consulta: 10, 15, 20, 30, 45 o 60. */
  @Type(() => Number) @IsInt() duracionMin!: number;
  @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => DiaDto) dias!: DiaDto[];
}

export class GenerarHorariosDto {
  @Matches(FECHA, { message: 'desde debe ser AAAA-MM-DD' }) desde!: string;
  @Matches(FECHA, { message: 'hasta debe ser AAAA-MM-DD' }) hasta!: string;
}

export class BloqueoDto {
  @IsDateString() desde!: string;
  @IsDateString() hasta!: string;
  @IsString() @MaxLength(200) motivo!: string;
}

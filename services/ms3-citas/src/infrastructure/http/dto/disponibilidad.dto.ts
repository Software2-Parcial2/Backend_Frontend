import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class DisponibilidadDto {
  @IsUUID() medicoId!: string;
  /** Rango de fechaHora (ISO 8601). */
  @IsDateString() desde!: string;
  @IsDateString() hasta!: string;
  /** Solo los horarios reservables hoy. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() soloLibres?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

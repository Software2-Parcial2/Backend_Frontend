import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class BuscarCitasDto {
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @IsUUID() medicoId?: string;
  /** Rango de la fecha de la cita (solo con medicoId). */
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class BuscarCitasDto {
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @IsUUID() medicoId?: string;
  /** Rango de la fecha de la cita (solo con medicoId). */
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
  /** Solo citas en este estado (ej. RESERVADA = reservas temporales por vencer). */
  @IsOptional() @IsIn(['PENDIENTE', 'RESERVADA', 'COBRO_PROVISIONAL', 'CONFIRMADA', 'CANCELADA', 'ANULADA', 'CANCELADA_USUARIO', 'EN_SALA', 'ATENDIDA', 'NO_ASISTIO']) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

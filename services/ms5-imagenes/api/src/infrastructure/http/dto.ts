import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class SubirImagenDto {
  /** Obligatorio para el personal; un paciente sube siempre a su nombre. */
  @IsOptional() @IsUUID()
  pacienteId?: string;

  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[\w .\-áéíóúñÁÉÍÓÚÑ]+$/)
  estudio?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  observaciones?: string;
}

export class ValidarImagenDto {
  @IsIn(['CONFIRMA', 'MODIFICA', 'DESCARTA'])
  decision!: 'CONFIRMA' | 'MODIFICA' | 'DESCARTA';

  /** Texto del informe: obligatorio al modificar (texto corregido) o descartar (motivo). */
  @IsOptional() @IsString() @MaxLength(4000)
  informe?: string;
}

export class ListarImagenesDto {
  @IsOptional() @IsUUID() pacienteId?: string;
  /** Validacion medica del informe. */
  @IsOptional() @IsIn(['PENDIENTE', 'VALIDADO', 'DESCARTADO']) validacion?: 'PENDIENTE' | 'VALIDADO' | 'DESCARTADO';
  /** Estado del analisis de la IA. */
  @IsOptional() @IsIn(['SUBIDA', 'ANALIZANDO', 'ANALIZADA', 'FALLIDA']) estado?: 'SUBIDA' | 'ANALIZANDO' | 'ANALIZADA' | 'FALLIDA';
  /** Texto libre: nombre del paciente, n.° de historia o estudio. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

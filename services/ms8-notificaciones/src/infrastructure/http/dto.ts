import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, ArrayNotEmpty, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PreferenciasDto {
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(['EMAIL', 'TELEGRAM'], { each: true })
  canales?: string[];

  /** Avisos opcionales que quiere recibir (confirmacion y cancelacion se envian siempre). */
  @IsOptional() @IsArray() @IsIn(['CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO'], { each: true })
  tiposAviso?: string[];

  /** Horas de antelacion del recordatorio: 2, 6, 12, 24 o 48. */
  @IsOptional() @IsInt() @Min(1) @Max(168)
  antelacionHoras?: number;
}

export class ListarNotificacionesDto {
  @IsOptional() @IsUUID() citaId?: string;
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @IsIn(['PENDIENTE', 'ENVIADA', 'FALLIDA']) estado?: 'PENDIENTE' | 'ENVIADA' | 'FALLIDA';
  @IsOptional() @IsIn(['CITA_CONFIRMADA', 'CITA_CANCELADA', 'CITA_REPROGRAMADA', 'RECORDATORIO', 'RECORDATORIO_REFUERZO', 'ESTUDIO_VALIDADO']) tipo?: string;
  @IsOptional() @IsIn(['EMAIL', 'TELEGRAM']) canal?: 'EMAIL' | 'TELEGRAM';
  /** Solo las creadas desde esta fecha (ISO-8601). */
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

export class ResumenDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha?: string;
}

export class LeidasDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(100) @IsUUID('all', { each: true })
  ids!: string[];
}

export class PlantillaDto {
  @IsIn(['EMAIL', 'TELEGRAM']) canal!: 'EMAIL' | 'TELEGRAM';
  @IsString() @IsNotEmpty() @MaxLength(150) asunto!: string;
  @IsString() @IsNotEmpty() @MaxLength(1500) cuerpo!: string;
}

export class VistaPreviaDto extends PlantillaDto {
  @IsOptional() @IsString() @MaxLength(100) nombre?: string;
  @IsOptional() @IsDateString() fechaHora?: string;
}

export class CanalQueryDto {
  @IsOptional() @IsIn(['EMAIL', 'TELEGRAM']) canal?: 'EMAIL' | 'TELEGRAM';
}

class AlertasPersonalDto {
  @IsBoolean() sagaCompensada!: boolean;
  @IsBoolean() notificacionFallida!: boolean;
  @IsBoolean() colaDeErrores!: boolean;
}

export class PreferenciasPersonalDto {
  @ValidateNested() @Type(() => AlertasPersonalDto)
  alertas!: AlertasPersonalDto;
}

export class VinculoDto {
  /** Solo personal; un paciente genera el codigo para si mismo. */
  @IsOptional() @IsUUID()
  pacienteId?: string;
}

export class VincularTelegramDto {
  @IsString() @IsNotEmpty() @Matches(/^[A-Za-z0-9]{4,32}$/)
  codigo!: string;

  @IsString() @Matches(/^-?\d{1,20}$/)
  chatId!: string;
}

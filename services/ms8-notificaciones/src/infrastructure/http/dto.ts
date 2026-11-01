import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, ArrayNotEmpty } from 'class-validator';

export class PreferenciasDto {
  @IsArray() @ArrayNotEmpty() @IsIn(['EMAIL', 'TELEGRAM'], { each: true })
  canales!: string[];
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

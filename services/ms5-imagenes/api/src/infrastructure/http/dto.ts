import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class SubirImagenDto {
  @IsUUID()
  pacienteId!: string;

  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[\w .\-áéíóúñÁÉÍÓÚÑ]+$/)
  estudio?: string;
}

export class ListarImagenesDto {
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

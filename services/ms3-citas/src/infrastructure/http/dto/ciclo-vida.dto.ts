import { IsDateString, IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelarCitaDto {
  /** Por ejemplo: «Pedido del paciente», «Medico no disponible». */
  @IsString() @IsNotEmpty() @MaxLength(200) motivo!: string;
}

export class ReprogramarCitaDto {
  /** Nuevo inicio en ISO 8601. */
  @IsDateString() fechaHora!: string;
}

export class AsistenciaDto {
  @IsIn(['LLEGO', 'ATENDIDA', 'NO_ASISTIO']) accion!: 'LLEGO' | 'ATENDIDA' | 'NO_ASISTIO';
}

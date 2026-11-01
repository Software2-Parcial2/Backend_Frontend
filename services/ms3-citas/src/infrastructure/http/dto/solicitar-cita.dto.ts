import { IsDateString, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class SolicitarCitaDto {
  @IsUUID()
  pacienteId!: string;

  @IsUUID()
  medicoId!: string;

  @IsString()
  @IsNotEmpty()
  especialidad!: string;

  /** Inicio del horario en ISO 8601. */
  @IsDateString()
  fechaHora!: string;
}

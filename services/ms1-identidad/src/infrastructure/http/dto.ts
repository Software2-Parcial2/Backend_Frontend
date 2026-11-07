import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ROLES } from '../../domain/identidad.js';

const bool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class ListarUsuariosDto {
  /** Busca en usuario, correo, nombre y apellido. */
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(ROLES as readonly string[]) rol?: (typeof ROLES)[number];
  @IsOptional() @Transform(bool) @IsBoolean() activo?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

export class CrearUsuarioDto {
  @IsString() @MinLength(3) @MaxLength(50) username!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(100) nombre!: string;
  @IsString() @MinLength(1) @MaxLength(100) apellido!: string;
  @IsArray() @ArrayNotEmpty() @IsIn(ROLES as readonly string[], { each: true }) roles!: (typeof ROLES)[number][];
  /** Obligatorio con el rol paciente: el paciente de MS2 al que se vincula (claim paciente_id). */
  @IsOptional() @IsUUID() pacienteId?: string;
  /** Medico del catalogo de MS2 (claim medico_id). */
  @IsOptional() @IsUUID() medicoId?: string;
  @IsOptional() @IsString() @MaxLength(100) especialidad?: string;
  @IsOptional() @IsString() @MaxLength(50) matricula?: string;
  /** Si se omite, el usuario recibe un correo para definir su contrasena. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) passwordTemporal?: string;
}

export class ActualizarUsuarioDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) nombre?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) apellido?: string;
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @IsUUID() medicoId?: string;
  @IsOptional() @IsString() @MaxLength(100) especialidad?: string;
  @IsOptional() @IsString() @MaxLength(50) matricula?: string;
}

export class RolesDto {
  @IsArray() @ArrayNotEmpty() @IsIn(ROLES as readonly string[], { each: true }) roles!: (typeof ROLES)[number][];
  /** Obligatorio al pasar a `paciente` si el usuario aun no esta vinculado. */
  @IsOptional() @IsUUID() pacienteId?: string;
  @IsOptional() @IsUUID() medicoId?: string;
  @IsOptional() @IsString() @MaxLength(100) especialidad?: string;
  @IsOptional() @IsString() @MaxLength(50) matricula?: string;
}

export class PaginaDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
  @IsOptional() @IsString() cursor?: string;
}

export class ListarEventosDto extends PaginaDto {
  /** Tipo de evento de Keycloak: LOGIN, LOGIN_ERROR, LOGOUT, UPDATE_PASSWORD... */
  @IsOptional() @IsString() @MaxLength(60) tipo?: string;
  @IsOptional() @IsUUID() usuarioId?: string;
  /** AAAA-MM-DD */
  @IsOptional() @IsString() @MaxLength(10) desde?: string;
  @IsOptional() @IsString() @MaxLength(10) hasta?: string;
}

export class AuditoriaDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limite?: number;
}

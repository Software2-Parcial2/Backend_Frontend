import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Pagina de resultados: `siguiente` es el cursor opaco de la pagina siguiente, o `null` si no hay mas. */
export interface Pagina<T> {
  items: T[];
  siguiente: string | null;
}

/** Parametros comunes `?limite&cursor` (por defecto 25, maximo 100). */
export class CursorDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export const LIMITE_POR_DEFECTO = 25;

/** Cursor opaco = JSON en base64url. */
export function codificarCursor(clave: unknown): string {
  return Buffer.from(JSON.stringify(clave), 'utf8').toString('base64url');
}

/** Devuelve la clave del cursor, o `undefined` si esta mal formado (el llamador responde 400 `CURSOR_INVALIDO`). */
export function decodificarCursor<T = unknown>(cursor: string | undefined): T | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

export function pagina<T>(items: T[], siguienteClave?: unknown): Pagina<T> {
  return { items, siguiente: siguienteClave ? codificarCursor(siguienteClave) : null };
}

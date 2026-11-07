import { Pipe, type PipeTransform } from '@angular/core';
import { dinero, formatoFecha, formatoFechaHora, formatoHora, hace } from '@sigec/api-client';

@Pipe({ name: 'dinero' })
export class DineroPipe implements PipeTransform {
  transform(v: string | number | null | undefined, moneda = 'BOB', sinCentavos = false): string {
    return dinero(v, moneda, { sinCentavos });
  }
}
@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return formatoFecha(v); }
}
@Pipe({ name: 'hora' })
export class HoraPipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return formatoHora(v); }
}
@Pipe({ name: 'fechaHora' })
export class FechaHoraPipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return formatoFechaHora(v); }
}
@Pipe({ name: 'hace' })
export class HacePipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return hace(v); }
}

export const FORMATOS = [DineroPipe, FechaPipe, HoraPipe, FechaHoraPipe, HacePipe] as const;

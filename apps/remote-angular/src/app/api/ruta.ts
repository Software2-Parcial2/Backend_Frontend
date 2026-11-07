import { inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

/** Parametro de la ruta con hash (`#/cita?id=...`) como signal; `null` si no viene. */
export function parametro(nombre: string): Signal<string | null> {
  const ruta = inject(ActivatedRoute);
  return toSignal(ruta.queryParamMap.pipe(map((p) => p.get(nombre))), { initialValue: ruta.snapshot.queryParamMap.get(nombre) }) as Signal<string | null>;
}

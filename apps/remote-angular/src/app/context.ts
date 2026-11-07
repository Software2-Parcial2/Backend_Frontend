import { Injectable, signal } from '@angular/core';

/** Contexto que entrega el shell (ver contracts/microfrontend-contract.md). */
export interface MfeContext {
  token: string;
  user: { sub: string; username?: string; email?: string; roles: string[] };
  roles: string[];
  /** Base del gateway entregada por el shell. */
  apiUrl: string;
}

/** Guarda el contexto del shell para que las pantallas y los guards lo lean. */
@Injectable({ providedIn: 'root' })
export class ContextStore {
  readonly ctx = signal<MfeContext | undefined>(undefined);
}

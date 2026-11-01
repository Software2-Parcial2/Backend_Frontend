import { Component, computed, input } from '@angular/core';

/** Contexto que entrega el shell (ver contracts/microfrontend-contract.md). */
export interface MfeContext {
  token: string;
  user: { sub: string; username?: string; email?: string; roles: string[] };
  roles: string[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Contexto del shell; en modo independiente (puerto 4201) no hay. */
  readonly ctx = input<MfeContext | undefined>(undefined);
  protected readonly username = computed(() => this.ctx()?.user.username ?? this.ctx()?.user.sub);
  protected readonly roles = computed(() => this.ctx()?.roles.join(', ') || '—');
}

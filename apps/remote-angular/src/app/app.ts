import { Component, ViewEncapsulation, effect, inject, input } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ContextStore, type MfeContext } from './context';

export type { MfeContext } from './context';

/**
 * Raiz del remoto de clinica. ViewEncapsulation.None + styleUrl: los estilos viajan en el JS del remoto
 * (los estilos globales de la compilacion no se cargan cuando lo monta el shell) y todo queda bajo `.sigec`.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: '../../../../packages/design-tokens/sigec.css',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  /** Contexto del shell; en modo independiente (puerto 4201) no hay. */
  readonly ctx = input<MfeContext | undefined>(undefined);
  private readonly store = inject(ContextStore);

  constructor() {
    effect(() => this.store.ctx.set(this.ctx()));
  }
}

import { ApplicationRef, ComponentRef, createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { App, MfeContext } from './app/app';
import { appConfig } from './app/app.config';

let appRef: ApplicationRef | null = null;
let componentRef: ComponentRef<App> | null = null;
let host: HTMLElement | null = null;
let target: HTMLElement | null = null;

function onTokenRefreshed(event: Event): void {
  const { token } = (event as CustomEvent<{ token: string }>).detail;
  const current = componentRef?.instance.ctx();
  if (componentRef && current) componentRef.setInput('ctx', { ...current, token });
}

/** Contrato SIGEC: monta la vista de clinica dentro de `el`. */
export async function mount(el: HTMLElement, ctx: MfeContext): Promise<void> {
  if (appRef) await unmount();
  host = el;
  appRef = await createApplication(appConfig);
  // Angular elimina su elemento anfitrion al destruirse: se monta en un hijo propio para no tocar `el`.
  target = document.createElement('div');
  el.appendChild(target);
  componentRef = createComponent(App, { environmentInjector: appRef.injector, hostElement: target });
  componentRef.setInput('ctx', ctx);
  appRef.attachView(componentRef.hostView);
  // Con createApplication + createComponent no hay bootstrap: la navegacion inicial (y la escucha de hashchange) se lanza a mano.
  await appRef.injector.get(Router).initialNavigation();
  el.addEventListener('sigec:token-refreshed', onTokenRefreshed);
}

/** Contrato SIGEC: destruye la app y los listeners; deja el elemento vacio. */
export function unmount(): void {
  host?.removeEventListener('sigec:token-refreshed', onTokenRefreshed);
  componentRef?.destroy();
  appRef?.destroy();
  target?.remove();
  target = null;
  componentRef = null;
  appRef = null;
  host = null;
}

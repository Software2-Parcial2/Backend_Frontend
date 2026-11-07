import { Injectable, inject } from '@angular/core';
import { crearCliente, type ClienteApi } from '@sigec/api-client';
import { ContextStore } from '../context';

/** Gateway por defecto para el modo independiente (ng serve en :4201). Lo normal es la `apiUrl` que entrega el shell en mount(). */
export const API_URL_POR_DEFECTO = 'http://localhost:8090';

/**
 * Cliente HTTP de la clinica. Lee el token y la URL del contexto del shell EN CADA PETICION (el shell renueva el token con el evento
 * `sigec:token-refreshed` y el store lo actualiza), nunca los copia. Ante un 401 espera unos segundos a que llegue un token nuevo.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly store = inject(ContextStore);

  readonly cliente: ClienteApi = crearCliente({
    baseUrl: () => this.store.ctx()?.apiUrl ?? API_URL_POR_DEFECTO,
    token: () => this.store.ctx()?.token,
    alNoAutenticado: async () => {
      const antes = this.store.ctx()?.token;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (this.store.ctx()?.token !== antes) return true;
      }
      return false;
    },
  });
}

import { crearCliente, type ClienteApi } from '@sigec/api-client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { API_URL } from './config';
import { useSesion } from './sesion';

const Contexto = createContext<ClienteApi | null>(null);

/** Cliente HTTP comun de los frontends (problem+json, Idempotency-Key, cursor...). El token se pide en cada peticion a la sesion. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const cliente = useMemo(
    () => crearCliente({ baseUrl: API_URL, token: () => sesion.token(), fetch: (u, i) => fetch(u, { ...i, cache: 'no-store' } as RequestInit) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return <Contexto.Provider value={cliente}>{children}</Contexto.Provider>;
}

export function useApi(): ClienteApi {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApi fuera de ApiProvider');
  return c;
}

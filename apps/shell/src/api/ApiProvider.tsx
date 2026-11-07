import { QueryClient, QueryClientProvider, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, crearCliente, esAbortado, esNoAutenticado, type ClienteApi, type Pagina } from '@sigec/api-client';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { API_URL } from '../auth/sigecUser';

const Contexto = createContext<ClienteApi | null>(null);

/** Errores que no se arreglan reintentando solos (4xx, sin red): solo se reintenta 1 vez un 5xx. */
function reintentar(intentos: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.estado === 0 || (error.estado >= 400 && error.estado < 500))) return false;
  return intentos < 1;
}

/**
 * Cliente HTTP del shell: el token se lee EN VIVO de la sesion OIDC (nunca se copia), y un 401 intenta renovar en silencio
 * y repite la peticion una vez. Tambien monta React Query para las pantallas con datos.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const authRef = useRef(auth);
  authRef.current = auth;

  const cliente = useMemo(
    () =>
      crearCliente({
        baseUrl: API_URL,
        token: () => authRef.current.user?.access_token,
        alNoAutenticado: async () => {
          try {
            return Boolean(await authRef.current.signinSilent());
          } catch {
            return false;
          }
        },
      }),
    [],
  );
  const consultas = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: reintentar, refetchOnWindowFocus: false, staleTime: 15_000 } } }),
    [],
  );
  return (
    <Contexto.Provider value={cliente}>
      <QueryClientProvider client={consultas}>{children}</QueryClientProvider>
    </Contexto.Provider>
  );
}

export function useApi(): ClienteApi {
  const c = useContext(Contexto);
  if (!c) throw new Error('useApi fuera de <ApiProvider>');
  return c;
}

type Query = Record<string, string | number | boolean | null | undefined>;

/** GET con cache, cancelacion al salir de la pantalla y reintento manual (`refetch`). `ruta = null` la deja en espera. */
export function useGet<T>(ruta: string | null, query?: Query, opciones: { refetchMs?: number; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<T, ApiError>({
    queryKey: ['get', ruta, query ?? null],
    queryFn: ({ signal }) => api.get<T>(ruta!, { query, signal }),
    enabled: ruta !== null && opciones.enabled !== false,
    refetchInterval: opciones.refetchMs,
  });
}

/** Lista con cursor y «Cargar mas». */
export function useLista<T>(ruta: string | null, query?: Query, opciones: { limite?: number; enabled?: boolean } = {}) {
  const api = useApi();
  const q = useInfiniteQuery<Pagina<T>, ApiError, { items: T[] }, unknown[], string | null>({
    queryKey: ['lista', ruta, query ?? null, opciones.limite ?? 25],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => api.pagina<T>(ruta!, { query, limite: opciones.limite ?? 25, cursor: pageParam, signal }),
    getNextPageParam: (ultima) => ultima.siguiente,
    select: (d) => ({ items: d.pages.flatMap((p) => p.items) }),
    enabled: ruta !== null && opciones.enabled !== false,
  });
  return { ...q, items: q.data?.items ?? [] };
}

/** Accion (POST/PUT/DELETE) que al terminar invalida las lecturas indicadas (por prefijo de ruta). */
export function useAccion<A, R>(fn: (api: ClienteApi, args: A) => Promise<R>, invalidar: string[] = []) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation<R, ApiError, A>({
    mutationFn: (args) => fn(api, args),
    onSuccess: () => {
      for (const prefijo of invalidar) {
        void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[1] === 'string' && (q.queryKey[1] as string).startsWith(prefijo) });
      }
    },
  });
}

export { ApiError, esAbortado, esNoAutenticado };

import { crearCliente, type ClienteApi } from '@sigec/api-client'
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'

/** Base del gateway (VITE_API_URL cambia el servidor al compilar). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8090'

const Contexto = createContext<ClienteApi | null>(null)

/** Cliente HTTP del portal: lee SIEMPRE el token vigente de la sesion y la renueva en silencio ante un 401. */
export function ApiProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const token = useRef<string | undefined>(undefined)
  token.current = auth.user?.access_token
  const renovar = useRef(auth.signinSilent)
  renovar.current = auth.signinSilent
  const cliente = useMemo(
    () =>
      crearCliente({
        baseUrl: API_URL,
        // Sin cache HTTP: lo que se ve sin conexion viene de la copia propia (con su aviso), no de una respuesta vieja del navegador.
        fetch: (u, i) => fetch(u, { ...i, cache: 'no-store' }),
        token: () => token.current,
        alNoAutenticado: async () => {
          try {
            const u = await renovar.current()
            if (u?.access_token) { token.current = u.access_token; return true }
          } catch { /* sesion vencida: el usuario debe volver a entrar */ }
          return false
        },
      }),
    [],
  )
  return <Contexto.Provider value={cliente}>{children}</Contexto.Provider>
}

export function useApi(): ClienteApi {
  const c = useContext(Contexto)
  if (!c) throw new Error('useApi fuera de ApiProvider')
  return c
}

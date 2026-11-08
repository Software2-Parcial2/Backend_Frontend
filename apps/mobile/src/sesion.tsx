import { authorize, logout, refresh, type AuthConfiguration } from 'react-native-app-auth';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OIDC } from './config';

const CLAVE_REFRESH = 'sigec.refresh';
const CONFIG: AuthConfiguration = { ...OIDC, scopes: [...OIDC.scopes] };

export interface Sesion {
  estado: 'cargando' | 'sin' | 'con';
  nombre: string;
  sub: string;
  error: string | null;
  entrar: () => Promise<void>;
  salir: () => Promise<void>;
  /** Token de acceso vigente (lo renueva con el refresh token guardado en SecureStore si esta por vencer). */
  token: () => Promise<string | undefined>;
}

const Contexto = createContext<Sesion | null>(null);

function claims(idToken?: string): { nombre: string; sub: string } {
  try {
    const p = JSON.parse(atob((idToken ?? '').split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { preferred_username?: string; sub?: string };
    return { nombre: p.preferred_username ?? '', sub: p.sub ?? '' };
  } catch {
    return { nombre: '', sub: '' };
  }
}

/** Login OIDC + PKCE con react-native-app-auth. Solo el refresh token se guarda (SecureStore); el access token vive en memoria. */
export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Sesion['estado']>('cargando');
  const [quien, setQuien] = useState({ nombre: '', sub: '' });
  const [error, setError] = useState<string | null>(null);
  const acceso = useRef<{ token: string; vence: number; idToken?: string } | null>(null);

  const guardar = useCallback(async (r: { accessToken: string; accessTokenExpirationDate: string; refreshToken?: string | null; idToken?: string }) => {
    acceso.current = { token: r.accessToken, vence: Date.parse(r.accessTokenExpirationDate), idToken: r.idToken };
    if (r.refreshToken) await SecureStore.setItemAsync(CLAVE_REFRESH, r.refreshToken);
    setQuien(claims(r.idToken ?? r.accessToken));
    setEstado('con');
  }, []);

  const renovar = useCallback(async (): Promise<boolean> => {
    const rt = await SecureStore.getItemAsync(CLAVE_REFRESH);
    if (!rt) return false;
    try {
      await guardar(await refresh(CONFIG, { refreshToken: rt }));
      return true;
    } catch {
      await SecureStore.deleteItemAsync(CLAVE_REFRESH);
      return false;
    }
  }, [guardar]);

  useEffect(() => {
    void renovar().then((ok) => { if (!ok) setEstado('sin'); }).catch(() => setEstado('sin'));
  }, [renovar]);

  const valor = useMemo<Sesion>(() => ({
    estado, nombre: quien.nombre, sub: quien.sub, error,
    entrar: async () => {
      setError(null);
      try { await guardar(await authorize(CONFIG)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión'); }
    },
    salir: async () => {
      const id = acceso.current?.idToken;
      acceso.current = null;
      await SecureStore.deleteItemAsync(CLAVE_REFRESH);
      setEstado('sin');
      try { if (id) await logout(CONFIG, { idToken: id, postLogoutRedirectUrl: OIDC.redirectUrl }); } catch { /* la sesion local ya se cerro */ }
    },
    token: async () => {
      const a = acceso.current;
      if (a && a.vence - Date.now() > 30_000) return a.token;
      return (await renovar()) ? acceso.current?.token : undefined;
    },
  }), [estado, quien, error, guardar, renovar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Sesion {
  const c = useContext(Contexto);
  if (!c) throw new Error('useSesion fuera de SesionProvider');
  return c;
}

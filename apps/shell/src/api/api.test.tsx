import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@sigec/api-client';
import { ErrorApi, mensajeDeError } from '../components/Estado';

// useAuth falso: la sesion la controla cada prueba.
const sesion = { user: { access_token: 'T1' } as { access_token: string } | null, signinSilent: vi.fn() };
vi.mock('react-oidc-context', () => ({ useAuth: () => sesion }));

import { ApiProvider, useGet } from './ApiProvider';

const respuesta = (status: number, cuerpo: unknown, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', ...h } });

function Lectura({ ruta }: { ruta: string }) {
  const q = useGet<{ n: number }>(ruta);
  if (q.isLoading) return <p>cargando</p>;
  if (q.isError) return <ErrorApi error={q.error} />;
  return <p data-testid="n">{q.data?.n}</p>;
}

describe('ApiProvider / useGet', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sesion.user = { access_token: 'T1' };
    sesion.signinSilent.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('usa el token VIVO de la sesion y la URL del gateway', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { n: 7 }));
    render(<ApiProvider><Lectura ruta="/api/algo" /></ApiProvider>);
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('7'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:8090/api/algo');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer T1');
  });

  it('un 401 renueva la sesion en silencio y repite con el token nuevo', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(401, { code: 'NO_AUTENTICADO' })).mockResolvedValueOnce(respuesta(200, { n: 3 }));
    sesion.signinSilent.mockImplementation(async () => {
      sesion.user = { access_token: 'T2' };
      return sesion.user;
    });
    render(<ApiProvider><Lectura ruta="/api/x" /></ApiProvider>);
    await waitFor(() => expect(screen.getByTestId('n').textContent).toBe('3'));
    expect((fetchMock.mock.calls[1]![1].headers as Record<string, string>).Authorization).toBe('Bearer T2');
    expect(sesion.signinSilent).toHaveBeenCalledTimes(1);
  });

  it('un 403 se muestra con su explicacion y el codigo de soporte, sin reintentar solo', async () => {
    fetchMock.mockResolvedValue(respuesta(403, { code: 'PROHIBIDO', correlationId: 'abc-123' }));
    render(<ApiProvider><Lectura ruta="/api/privado" /></ApiProvider>);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No tiene permiso'));
    expect(screen.getByTestId('correlation-id').textContent).toContain('abc-123');
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('mensajeDeError', () => {
  it('traduce cada familia de fallo a un texto util', () => {
    expect(mensajeDeError(new ApiError(0)).titulo).toMatch(/Sin conexión/);
    expect(mensajeDeError(new ApiError(404, { detail: 'No existe la factura' })).texto).toBe('No existe la factura');
    expect(mensajeDeError(new ApiError(409, { code: 'USUARIO_DUPLICADO', detail: 'Ya existe un usuario' })).texto).toBe('Ya existe un usuario');
    expect(mensajeDeError(new ApiError(503)).titulo).toMatch(/no está disponible/);
    expect(mensajeDeError(new ApiError(500)).titulo).toBe('Error del servidor');
    expect(mensajeDeError(new Error('boom')).texto).toBe('boom');
  });
});

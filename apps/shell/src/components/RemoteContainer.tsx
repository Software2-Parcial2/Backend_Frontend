import type { MfeModule } from '@sigec/mfe-contract';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import { toMfeContext } from '../auth/sigecUser';
import { loadMicrofrontend, type RemoteName } from '../remotes/loader';

// mount/unmount de un mismo remoto se serializan: StrictMode y la navegacion rapida
// pueden solapar un unmount con el mount siguiente, y los remotos guardan estado de modulo.
const queues = new Map<RemoteName, Promise<unknown>>();
function enqueue<T>(remote: RemoteName, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(remote) ?? Promise.resolve()).then(task, task);
  queues.set(remote, next.catch(() => undefined));
  return next;
}

interface Props {
  remote: RemoteName;
  title: string;
}

/** Monta un microfrontend dentro de un div siguiendo el contrato de contracts/microfrontend-contract.md. */
export function RemoteContainer({ remote, title }: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const userRef = useRef(auth.user);
  userRef.current = auth.user;
  const token = auth.user?.access_token;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    let mod: MfeModule | undefined;
    setStatus('loading');

    const onNavigate = (event: Event) => {
      const { path } = (event as CustomEvent<{ path: string }>).detail;
      navigate(path);
    };
    el.addEventListener('sigec:navigate', onNavigate);

    void enqueue(remote, async () => {
      if (cancelled) return;
      try {
        mod = await loadMicrofrontend(remote);
        if (cancelled || !userRef.current) return;
        await mod.mount(el, toMfeContext(userRef.current));
        if (cancelled) {
          await mod.unmount();
          mod = undefined;
          return;
        }
        setStatus('ready');
      } catch (e) {
        console.error(
          `[shell] no se pudo montar ${remote}: ${e instanceof Error ? e.message : String(e)}`,
        );
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      }
    });

    return () => {
      cancelled = true;
      el.removeEventListener('sigec:navigate', onNavigate);
      void enqueue(remote, async () => {
        await mod?.unmount();
        mod = undefined;
      });
    };
  }, [remote, attempt, navigate]);

  // Renovacion del token: se avisa al remoto sin remontarlo.
  const firstToken = useRef(token);
  useEffect(() => {
    if (token && token !== firstToken.current) {
      hostRef.current?.dispatchEvent(new CustomEvent('sigec:token-refreshed', { detail: { token } }));
      firstToken.current = token;
    }
  }, [token]);

  return (
    <section aria-label={title} className="sigec-remote">
      {status === 'loading' && (
        <div className="page">
          <p className="muted" role="status">Cargando {title}…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="page">
          <div className="banner err" role="alert">
            <div>
              <b>Servicio no disponible</b>
              <span>No se pudo cargar {title}: {error}</span>
            </div>
            <span className="sp" />
            <button type="button" className="btn s" onClick={() => setAttempt((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        </div>
      )}
      <div ref={hostRef} data-remote={remote} />
    </section>
  );
}

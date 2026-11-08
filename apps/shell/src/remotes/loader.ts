import { loadRemote } from '@module-federation/enhanced/runtime';
import type { MfeModule } from '@sigec/mfe-contract';

export type RemoteName = 'remoteVue' | 'remoteAngular';

/** Carga el modulo `./mount` del remoto con Module Federation 2 (contrato mount/unmount). Las URLs estan en rsbuild.config.ts. */
export async function loadMicrofrontend(remote: RemoteName): Promise<MfeModule> {
  const mod = await loadRemote<MfeModule>(`${remote}/mount`);
  if (!mod || typeof mod.mount !== 'function' || typeof mod.unmount !== 'function') {
    throw new Error(`El remoto ${remote} no cumple el contrato mount/unmount`);
  }
  return mod;
}

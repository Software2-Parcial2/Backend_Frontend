// Polyfill de import maps dinamicos: el orquestador de Native Federation lo usa en modo shim.
import './esms-init';
import 'es-module-shims';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { initFederation } from '@softarc/native-federation-orchestrator';
import { consoleLogger, useShimImportMap } from '@softarc/native-federation-orchestrator/options';
import type { MfeModule } from '@sigec/mfe-contract';

export type RemoteName = 'remoteVue' | 'remoteAngular';

const ANGULAR_ENTRY = 'http://localhost:4201/remoteEntry.json';

let nativeFederation: ReturnType<typeof initFederation> | null = null;

function nativeFederationRuntime() {
  nativeFederation ??= initFederation({ remoteAngular: ANGULAR_ENTRY }, { logLevel: 'error', logger: consoleLogger, ...useShimImportMap({ shimMode: true }) });
  return nativeFederation;
}

/** Carga el modulo `./mount` del remoto (contrato mount/unmount). */
export async function loadMicrofrontend(remote: RemoteName): Promise<MfeModule> {
  const mod =
    remote === 'remoteVue'
      ? await loadRemote<MfeModule>('remoteVue/mount')
      : await (await nativeFederationRuntime()).loadRemoteModule<MfeModule>('remoteAngular', './mount');
  if (!mod || typeof mod.mount !== 'function' || typeof mod.unmount !== 'function') {
    throw new Error(`El remoto ${remote} no cumple el contrato mount/unmount`);
  }
  return mod;
}

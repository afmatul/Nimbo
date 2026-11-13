import type { StorageApi } from './api';

/**
 * Lo mínimo que la barra lateral del Cliente pide a la API (accesos rápidos y contador de la Papelera) para las
 * pruebas de pantallas que la llevan pero no la ejercitan: sin nada fijado ni reciente y con la papelera sin responder.
 */
export function sidebarApiFake(overrides: Partial<StorageApi> = {}): StorageApi {
  return {
    quickAccess: () => Promise.resolve({ pinned: [], recent: [], hasMoreRecent: false }),
    trashSummary: () => new Promise(() => undefined),
    ...overrides,
  } as unknown as StorageApi;
}

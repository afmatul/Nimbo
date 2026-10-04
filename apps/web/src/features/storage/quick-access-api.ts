import {
  quickAccessItemSchema,
  quickAccessListSchema,
  type QuickAccessItem,
  type QuickAccessList,
  type QuickAccessNodePath,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/** Carpeta o archivo de la barra lateral: las rutas van por tipo (plan 006 §9.2). */
export type QuickAccessNodeType = QuickAccessItem['type'];

/** Accesos rápidos de la barra lateral (006 CA-27, CA-28): por cuenta, en el servidor. */
export interface QuickAccessApi {
  /** Fijados y recientes visibles, en el orden del servidor; `hasMoreRecent` pide «Ver más». */
  quickAccess(): Promise<QuickAccessList>;
  /** Idempotente. El sexto fijado responde `422 STORAGE_QUICK_ACCESS_LIMIT` con `details.maxPinned` (CA-28). */
  pin(type: QuickAccessNodeType, id: string): Promise<QuickAccessItem>;
  unpin(type: QuickAccessNodeType, id: string): Promise<void>;
  /** Abrir una carpeta o descargar un archivo (Q-3); sin cuerpo. */
  recordRecent(type: QuickAccessNodeType, id: string): Promise<void>;
}

const NODE_PATH: Readonly<Record<QuickAccessNodeType, QuickAccessNodePath>> = {
  file: 'files',
  folder: 'folders',
};

function nodePath(type: QuickAccessNodeType, id: string): string {
  return `${NODE_PATH[type]}/${encodeURIComponent(id)}`;
}

export function createQuickAccessApi(http: StorageHttp): QuickAccessApi {
  return {
    quickAccess: async () => parseResponse(await http.get('/quick-access'), quickAccessListSchema),
    pin: async (type, id) =>
      parseResponse(
        await http.put(`/quick-access/pins/${nodePath(type, id)}`),
        quickAccessItemSchema,
      ),
    unpin: async (type, id) => {
      await http.delete(`/quick-access/pins/${nodePath(type, id)}`);
    },
    recordRecent: async (type, id) => {
      await http.post(`/quick-access/recents/${nodePath(type, id)}`);
    },
  };
}

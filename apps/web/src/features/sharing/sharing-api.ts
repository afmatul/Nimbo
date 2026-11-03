import {
  accessEntrySchema,
  accessListSchema,
  receivedSharesSchema,
  type AccessEntry,
  type AccessList,
  type ReceivedShares,
  type ShareNodeType,
  type ShareRequest,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

/** Archivo o carpeta cuyos accesos se piden (012 CA-8). */
export interface ShareNodeRef {
  readonly nodeType: ShareNodeType;
  readonly nodeId: string;
}

/**
 * Compartición en la API (plan 012b §4). Un error HTTP llega como `StorageRequestError`. El correo viaja solo en el
 * cuerpo de `share`, nunca en la URL (spec §5).
 */
export interface SharingApi {
  /** `POST /shares`: comparte o cambia el nivel de un acceso directo (012 S-2). */
  share(body: ShareRequest): Promise<AccessEntry>;
  /** `GET /shares?nodeType&nodeId`: directos y heredados; solo el propietario (012 CA-9). */
  listAccess(node: ShareNodeRef): Promise<AccessList>;
  /** `DELETE /shares/:shareId` → `204`. */
  revoke(shareId: string): Promise<void>;
  /** `GET /shares/received`: accesos directos conmigo, más recientes primero (012 CA-22). */
  listReceived(): Promise<ReceivedShares>;
  /** `DELETE /shares/received/:shareId` → `204`; permitido en solo lectura (012 CA-23). */
  leave(shareId: string): Promise<void>;
}

const sharePath = (shareId: string): string => `/shares/${encodeURIComponent(shareId)}`;

export function createSharingApi(http: StorageHttp): SharingApi {
  return {
    share: async (body) => parseResponse(await http.post('/shares', body), accessEntrySchema),
    listAccess: async ({ nodeType, nodeId }) => {
      const query = new URLSearchParams({ nodeType, nodeId }).toString();
      return parseResponse(await http.get(`/shares?${query}`), accessListSchema);
    },
    revoke: async (shareId) => {
      await http.delete(sharePath(shareId));
    },
    listReceived: async () =>
      parseResponse(await http.get('/shares/received'), receivedSharesSchema),
    leave: async (shareId) => {
      await http.delete(`/shares/received/${encodeURIComponent(shareId)}`);
    },
  };
}

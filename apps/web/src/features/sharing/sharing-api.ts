import {
  accessEntrySchema,
  accessListSchema,
  createdPublicLinkSchema,
  currentPublicLinkSchema,
  receivedSharesSchema,
  type AccessEntry,
  type AccessList,
  type CreatedPublicLink,
  type CurrentPublicLink,
  type PublicLinkExpiryDays,
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

/** Lo que el propietario elige al generar un enlace público (013c CA-3); `password` vacía = sin contraseña. */
export interface PublicLinkInput {
  readonly fileId: string;
  readonly expiresInDays: PublicLinkExpiryDays;
  readonly password: string;
}

/** Cuerpo de `POST /public-links`: sin `password` si quedó vacía (013c CA-4). */
export interface PublicLinkBody {
  readonly fileId: string;
  readonly expiresInDays: PublicLinkExpiryDays;
  readonly password?: string;
}

/**
 * Arma el cuerpo de generar (plan 013c I-1). Lo usan el formulario, antes de validar con `createPublicLinkSchema`, y
 * `createPublicLink`, para que la regla de la contraseña vacía viva en un solo lugar.
 */
export function publicLinkBody({
  fileId,
  expiresInDays,
  password,
}: PublicLinkInput): PublicLinkBody {
  return password === '' ? { fileId, expiresInDays } : { fileId, expiresInDays, password };
}

/**
 * Compartición en la API (plan 012b §4; enlace público, plan 013c §4). Un error HTTP llega como `StorageRequestError`. El correo viaja solo en el
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
  /** `GET /public-links?fileId`: el enlace sin revocar del archivo, o `null` (013 CA-7). */
  currentPublicLink(fileId: string): Promise<CurrentPublicLink>;
  /** `POST /public-links`: genera o reemplaza el enlace; la URL con el token llega solo aquí (013 RN-3). */
  createPublicLink(input: PublicLinkInput): Promise<CreatedPublicLink>;
  /** `DELETE /public-links/:linkId` → `204`; permitido en solo lectura (013 CA-5). */
  revokePublicLink(linkId: string): Promise<void>;
}

const sharePath = (shareId: string): string => `/shares/${encodeURIComponent(shareId)}`;

function publicLinkMethods(
  http: StorageHttp,
): Pick<SharingApi, 'currentPublicLink' | 'createPublicLink' | 'revokePublicLink'> {
  return {
    currentPublicLink: async (fileId) => {
      const query = new URLSearchParams({ fileId }).toString();
      return parseResponse(await http.get(`/public-links?${query}`), currentPublicLinkSchema);
    },
    createPublicLink: async (input) =>
      parseResponse(
        await http.post('/public-links', publicLinkBody(input)),
        createdPublicLinkSchema,
      ),
    revokePublicLink: async (linkId) => {
      await http.delete(`/public-links/${encodeURIComponent(linkId)}`);
    },
  };
}

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
    ...publicLinkMethods(http),
  };
}

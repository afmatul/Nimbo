import {
  emptyTrashResponseSchema,
  listTrashResponseSchema,
  purgeResponseSchema,
  restoreResponseSchema,
  trashItemSchema,
  trashSummarySchema,
  type EmptyTrashResponse,
  type ListTrashResponse,
  type PurgeResponse,
  type RestoreResponse,
  type TrashItem,
  type TrashSummary,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from './storage-http';

/** Archivo o carpeta: las rutas de la papelera van por tipo (plan 006 §4). */
export type TrashNodeType = TrashItem['type'];

/** Papelera en la API (plan 006 §4). Desde aquí no hay descarga (CA-12). */
export interface TrashApi {
  /** `DELETE /files/:id` o `DELETE /folders/:id`: sale del explorador y queda en la papelera (CA-10, CA-11). */
  moveToTrash(type: TrashNodeType, id: string): Promise<TrashItem>;
  /** Primera página, de lo más reciente a lo más antiguo (CA-12). */
  listTrash(): Promise<ListTrashResponse>;
  trashSummary(): Promise<TrashSummary>;
  restore(type: TrashNodeType, id: string): Promise<RestoreResponse>;
  /** Síncrono: libera el espacio al responder (CA-18). */
  purge(type: TrashNodeType, id: string): Promise<PurgeResponse>;
  /** `202`: el espacio baja cuando termina el trabajo `trash-purge` (CA-18). */
  emptyTrash(): Promise<EmptyTrashResponse>;
}

const TREE_SEGMENT: Readonly<Record<TrashNodeType, string>> = { file: 'files', folder: 'folders' };

function nodePath(type: TrashNodeType, id: string): string {
  return `${TREE_SEGMENT[type]}/${encodeURIComponent(id)}`;
}

export function createTrashApi(http: StorageHttp): TrashApi {
  return {
    moveToTrash: async (type, id) =>
      parseResponse(await http.delete(`/${nodePath(type, id)}`), trashItemSchema),
    listTrash: async () => parseResponse(await http.get('/trash'), listTrashResponseSchema),
    trashSummary: async () => parseResponse(await http.get('/trash/summary'), trashSummarySchema),
    restore: async (type, id) =>
      parseResponse(await http.post(`/trash/${nodePath(type, id)}/restore`), restoreResponseSchema),
    purge: async (type, id) =>
      parseResponse(await http.delete(`/trash/${nodePath(type, id)}`), purgeResponseSchema),
    emptyTrash: async () => parseResponse(await http.delete('/trash'), emptyTrashResponseSchema),
  };
}

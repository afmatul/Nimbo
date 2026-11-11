import type { ClientTrashResponse, RestoreResponse, TrashItem } from '@nimbo/contracts';

import { LAURA } from './test-client-files';

/** Raíces de la papelera de Laura en los mockups de `backoffice/soporte`: una carpeta, un `.xlsx` y un `.pdf`. */
export const TRASH_FOLDER: TrashItem = {
  id: '6d7e8f9a-0b1c-4d2e-9f3a-4b5c6d7e8f9a',
  type: 'folder',
  name: 'Contratos 2026',
  sizeBytes: 48_000_000,
  originalFolder: { id: '7e8f9a0b-1c2d-4e3f-8a4b-5c6d7e8f9a0b', name: 'Alpha' },
  deletedAt: '2026-10-02T12:00:00.000Z',
  purgeAt: '2026-12-01T12:00:00.000Z',
};

export const TRASH_SHEET: TrashItem = {
  id: '8f9a0b1c-2d3e-4f4a-9b5c-6d7e8f9a0b1c',
  type: 'file',
  name: 'Presupuesto_Q4_borrador.xlsx',
  kind: 'xlsx',
  sizeBytes: 1_300_000,
  originalFolder: { id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', name: 'Finanzas' },
  deletedAt: '2026-10-12T12:00:00.000Z',
  purgeAt: '2026-12-11T12:00:00.000Z',
};

/** Estaba en la raíz de «Mis archivos»: no tiene carpeta original. */
export const TRASH_PDF: TrashItem = {
  id: '0b1c2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e',
  type: 'file',
  name: 'Contrato_servicios_Alpha.pdf',
  kind: 'pdf',
  sizeBytes: 412_000,
  originalFolder: null,
  deletedAt: '2026-10-20T12:00:00.000Z',
  purgeAt: '2026-12-19T12:00:00.000Z',
};

/** Una página de `GET /backoffice/client-trash` de Laura. */
export function clientTrashPage(
  items: readonly TrashItem[],
  nextCursor: string | null = null,
): ClientTrashResponse {
  return { client: LAURA, items: [...items], nextCursor };
}

/** `POST …/restore` de un archivo: el nodo que volvió y cómo (006 CA-13 a CA-15). */
export function restored(
  item: TrashItem,
  outcome: RestoreResponse['outcome'] = 'restored',
  name: string = item.name,
): RestoreResponse {
  return {
    outcome,
    originalName: item.name,
    item: {
      type: 'file',
      id: item.id,
      name,
      sizeBytes: item.sizeBytes,
      kind: item.kind ?? 'otro',
      folderId: item.originalFolder?.id ?? null,
      createdAt: item.deletedAt,
      updatedAt: item.deletedAt,
    },
  };
}

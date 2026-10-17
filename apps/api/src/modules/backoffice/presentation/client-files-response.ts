import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';
import type { ClientFileMetadata, ClientFilesResponse } from '@nimbo/contracts';

import type { FileMetadata } from '../../storage';
import type { ClientFilesView } from '../application/support.service';

/** Lista blanca (011 CA-13, RN-1): solo estos campos salen; bytes como texto decimal (ADR-0016). */
const toClientFile = (file: FileMetadata): ClientFileMetadata => ({
  id: file.id,
  name: file.name,
  kind: file.kind,
  sizeBytes: file.sizeBytes.toString(),
  createdAt: file.createdAt.toISOString(),
  updatedAt: file.updatedAt.toISOString(),
  trashedAt: file.trashedAt?.toISOString() ?? null,
});

/** `GET /backoffice/client-files`: el cliente (id, nombre y correo) y la página de sus metadatos. */
export function toClientFilesResponse(view: ClientFilesView): ClientFilesResponse {
  const { client } = view;
  return {
    client: { id: client.id, fullName: client.fullName, email: client.email },
    items: view.items.map(toClientFile),
    page: view.page,
    pageSize: BACKOFFICE_PAGE_SIZE,
    total: view.total,
  };
}

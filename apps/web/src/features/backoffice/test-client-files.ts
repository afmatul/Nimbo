import {
  BACKOFFICE_PAGE_SIZE,
  type ClientFileMetadata,
  type ClientFilesResponse,
} from '@nimbo/contracts';

/** Clienta de los mockups de `backoffice/soporte` (la ficha con «Ver metadatos de archivos»). */
export const LAURA = {
  id: '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  fullName: 'Laura Barrios',
  email: 'laura.barrios@alpha.gt',
} as const;

/** Metadatos de un archivo del contrato; mediodía UTC: el mismo día en cualquier zona de América. */
export function clientFile(overrides: Partial<ClientFileMetadata> = {}): ClientFileMetadata {
  return {
    id: '4b5c6d7e-8f9a-4b0c-9d1e-2f3a4b5c6d7e',
    name: 'Propuesta_Nimbo_v3.docx',
    kind: 'docx',
    sizeBytes: '2400000',
    createdAt: '2026-09-14T12:02:00.000Z',
    updatedAt: '2026-10-03T12:11:00.000Z',
    trashedAt: null,
    ...overrides,
  };
}

export const TRASHED_PDF = clientFile({
  id: '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f',
  name: 'Contrato_servicios_Alpha.pdf',
  kind: 'pdf',
  sizeBytes: '412000',
  trashedAt: '2026-10-01T12:00:00.000Z',
});

/** Una página de `GET /backoffice/client-files` de Laura. */
export function clientFilesPage(
  items: readonly ClientFileMetadata[],
  { page = 1, total = items.length }: { readonly page?: number; readonly total?: number } = {},
): ClientFilesResponse {
  return { client: { ...LAURA }, items: [...items], page, pageSize: BACKOFFICE_PAGE_SIZE, total };
}

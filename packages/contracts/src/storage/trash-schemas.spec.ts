import { FILES_PAGE_MAX } from './parameters';
import {
  emptyTrashResponseSchema,
  listTrashQuerySchema,
  listTrashResponseSchema,
  purgeResponseSchema,
  restoreResponseSchema,
  trashItemSchema,
  trashSummarySchema,
} from './trash-schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = '2026-09-30T10:00:00.000Z';
const LATER = '2026-10-30T10:00:00.000Z';

const fileItem = {
  id: ID,
  type: 'file',
  name: 'informe.docx',
  kind: 'docx',
  sizeBytes: 1024,
  originalFolder: { id: ID, name: 'Fotos' },
  deletedAt: AT,
  purgeAt: LATER,
};
const folderItem = {
  id: ID,
  type: 'folder',
  name: 'Fotos',
  sizeBytes: 0,
  originalFolder: null,
  deletedAt: AT,
  purgeAt: LATER,
};

describe('trashItemSchema', () => {
  it('CA-12: un archivo lleva tipo, ubicación original, tamaño y fechas', () => {
    expect(trashItemSchema.parse(fileItem)).toEqual(fileItem);
  });

  it('CA-11: una carpeta no lleva `kind` y su tamaño puede ser 0 (vacía)', () => {
    expect(trashItemSchema.parse(folderItem)).toEqual(folderItem);
  });

  it('CA-12: no lleva URL de descarga ni clave de objeto', () => {
    expect(trashItemSchema.safeParse({ ...fileItem, url: 'https://x' }).success).toBe(false);
  });
});

describe('listado y resumen de la papelera', () => {
  it('CA-12: el listado es paginado `{ items, nextCursor }` y `limit` se acota', () => {
    expect(listTrashQuerySchema.parse({ limit: '1000' }).limit).toBe(FILES_PAGE_MAX);
    expect(
      listTrashResponseSchema.parse({ items: [fileItem], nextCursor: null }).items,
    ).toHaveLength(1);
  });

  it('CA-12: el resumen da conteo, bytes totales y retención del plan', () => {
    const summary = { itemCount: 2, totalBytes: 2048, retentionDays: 30 };

    expect(trashSummarySchema.parse(summary)).toEqual(summary);
  });
});

describe('restaurar, eliminar definitivamente y vaciar', () => {
  it.each(['restored', 'renamed', 'moved_to_root'])(
    'CA-13, CA-14, CA-15: restaurar informa el resultado `%s` y el nombre original',
    (outcome) => {
      const item = {
        type: 'folder',
        id: ID,
        name: 'Fotos (1)',
        parentId: null,
        createdAt: AT,
        updatedAt: AT,
      };
      const response = { item, outcome, originalName: 'Fotos' };

      expect(restoreResponseSchema.parse(response)).toEqual(response);
    },
  );

  it('CA-18: eliminar definitivamente responde los bytes liberados', () => {
    expect(purgeResponseSchema.parse({ freedBytes: 1024 })).toEqual({ freedBytes: 1024 });
  });

  it('CA-18: vaciar responde lo programado (202)', () => {
    const response = { scheduledItems: 3, pendingBytes: 4096 };

    expect(emptyTrashResponseSchema.parse(response)).toEqual(response);
  });
});

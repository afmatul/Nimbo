import {
  batchDownloadResponseSchema,
  batchMoveRequestSchema,
  batchNodesRequestSchema,
} from './batch-schemas';

const ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const items = [{ type: 'file', id: ID }];

describe('lotes de storage', () => {
  it('mover lleva los elementos y la carpeta destino (`null` es la raíz)', () => {
    expect(batchMoveRequestSchema.parse({ items, targetFolderId: null })).toEqual({
      items,
      targetFolderId: null,
    });
    expect(batchMoveRequestSchema.safeParse({ items, targetFolderId: ID }).success).toBe(true);
    expect(batchMoveRequestSchema.safeParse({ items }).success).toBe(false);
    expect(batchMoveRequestSchema.safeParse({ items, targetFolderId: 'x' }).success).toBe(false);
  });

  it('papelera y descarga llevan solo los elementos, sin campos extra', () => {
    expect(batchNodesRequestSchema.parse({ items })).toEqual({ items });
    expect(batchNodesRequestSchema.safeParse({ items, force: true }).success).toBe(false);
  });

  it('la descarga responde una URL por archivo y los elementos que fallaron', () => {
    const response = {
      downloads: [{ id: ID, name: 'informe.pdf', url: 'https://objetos.nimbo.test/a?firma=1' }],
      failed: [{ type: 'folder', id: ID, code: 'STORAGE_BATCH_TOO_LARGE' }],
    };

    expect(batchDownloadResponseSchema.parse(response)).toEqual(response);
    expect(batchDownloadResponseSchema.safeParse({ downloads: [] }).success).toBe(false);
  });
});

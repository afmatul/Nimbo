import { createBatchApi } from './batch-api';
import type { StorageHttp } from './storage-http';

const FILE = { type: 'file' as const, id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d' };
const FOLDER = { type: 'folder' as const, id: '1b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d' };
const RESULT = { succeeded: [FILE], failed: [{ ...FOLDER, code: 'STORAGE_NODE_NOT_FOUND' }] };

function httpReturning(body: unknown): StorageHttp & { post: jest.Mock } {
  const post = jest.fn(() => Promise.resolve(body));
  const unused = jest.fn();
  return { get: unused, post, patch: unused, put: unused, delete: unused };
}

describe('batch-api: lotes del explorador', () => {
  it('mover: POST /nodes/batch/move con los elementos y el destino; devuelve los parciales', async () => {
    const http = httpReturning(RESULT);

    await expect(createBatchApi(http).move([FILE, FOLDER], null)).resolves.toEqual(RESULT);
    expect(http.post).toHaveBeenCalledWith('/nodes/batch/move', {
      items: [FILE, FOLDER],
      targetFolderId: null,
    });
  });

  it('eliminar: POST /nodes/batch/delete', async () => {
    const http = httpReturning(RESULT);

    await createBatchApi(http).trash([FILE]);
    expect(http.post).toHaveBeenCalledWith('/nodes/batch/delete', { items: [FILE] });
  });

  it('descargar: POST /nodes/batch/download devuelve una URL por archivo', async () => {
    const downloads = [{ id: FILE.id, name: 'a.pdf', url: 'https://minio.test/a' }];
    const http = httpReturning({ downloads, failed: [] });

    await expect(createBatchApi(http).download([FILE])).resolves.toEqual({ downloads, failed: [] });
    expect(http.post).toHaveBeenCalledWith('/nodes/batch/download', { items: [FILE] });
  });

  it('compartir: POST /shares/batch con correo y nivel', async () => {
    const http = httpReturning(RESULT);

    await createBatchApi(http).share({ items: [FILE], email: 'ana@ejemplo.com', level: 'VIEWER' });
    expect(http.post).toHaveBeenCalledWith('/shares/batch', {
      items: [FILE],
      email: 'ana@ejemplo.com',
      level: 'VIEWER',
    });
  });

  it('una respuesta fuera del contrato se rechaza', async () => {
    await expect(createBatchApi(httpReturning({ ok: true })).trash([FILE])).rejects.toThrow();
  });
});

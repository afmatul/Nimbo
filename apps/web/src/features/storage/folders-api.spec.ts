import { STORAGE_ERROR_CODES, folderContentsResponseSchema } from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createStorageApi } from './api';
import { StorageRequestError } from './storage-request-error';

const API = 'http://localhost/api/v1';
const AT = '2026-09-30T10:00:00.000Z';
const ALPHA = { id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d', name: 'Proyecto Alpha' };
const FOLDER = { type: 'folder', ...ALPHA, parentId: null, createdAt: AT, updatedAt: AT };
const FILE = {
  type: 'file',
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'informe.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: ALPHA.id,
  createdAt: AT,
  updatedAt: AT,
};

describe('api de carpetas', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createStorageApi(
    API,
    createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
  );

  function lastCall(): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), init: call?.[1] ?? {} };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-5: la raíz se lista con GET /folders/contents sin folderId', async () => {
    const root = { folder: null, breadcrumbs: [], items: [FOLDER], nextCursor: null };
    fetchMock.mockResolvedValue(jsonResponse(root));

    await expect(api.folderContents(null)).resolves.toEqual(root);
    expect(lastCall()).toMatchObject({ url: `${API}/folders/contents`, init: { method: 'GET' } });
  });

  it('CA-5: una carpeta se lista con su folderId y trae migas e ítems de ambos tipos', async () => {
    const contents = { folder: ALPHA, breadcrumbs: [ALPHA], items: [FILE], nextCursor: null };
    fetchMock.mockResolvedValue(jsonResponse(contents));

    await expect(api.folderContents(ALPHA.id)).resolves.toEqual(contents);
    expect(lastCall().url).toBe(`${API}/folders/contents?folderId=${ALPHA.id}`);
  });

  it('007 CA-10: envía el orden pedido (sort y dir) y valida updatedAt en cada elemento', async () => {
    const contents = {
      folder: ALPHA,
      breadcrumbs: [ALPHA],
      items: [FOLDER, FILE],
      nextCursor: 'c-2',
    };
    fetchMock.mockResolvedValue(jsonResponse(folderContentsResponseSchema.parse(contents)));

    await expect(api.folderContents(ALPHA.id, { sort: 'size', dir: 'desc' })).resolves.toEqual(
      contents,
    );
    expect(lastCall().url).toBe(`${API}/folders/contents?folderId=${ALPHA.id}&sort=size&dir=desc`);
  });

  it('007 CA-9: pide la página siguiente con el nextCursor y el mismo orden', async () => {
    const page = { folder: null, breadcrumbs: [], items: [FILE], nextCursor: null };
    fetchMock.mockResolvedValue(jsonResponse(page));

    await api.folderContents(null, { sort: 'created', dir: 'desc', cursor: 'c-2' });

    expect(lastCall().url).toBe(`${API}/folders/contents?sort=created&dir=desc&cursor=c-2`);
  });

  it('007 CA-20: envía el tamaño de página (limit) cuando se pide', async () => {
    const page = { folder: ALPHA, breadcrumbs: [ALPHA], items: [FILE], nextCursor: 'c-2' };
    fetchMock.mockResolvedValue(jsonResponse(page));

    await api.folderContents(ALPHA.id, { sort: 'name', dir: 'asc', limit: 10 });

    expect(lastCall().url).toBe(
      `${API}/folders/contents?folderId=${ALPHA.id}&sort=name&dir=asc&limit=10`,
    );
  });

  it('007 CA-10: una respuesta sin updatedAt no pasa la validación del contrato', async () => {
    const withoutUpdatedAt = { ...FILE, updatedAt: undefined };
    fetchMock.mockResolvedValue(
      jsonResponse({ folder: null, breadcrumbs: [], items: [withoutUpdatedAt], nextCursor: null }),
    );

    await expect(api.folderContents(null, { sort: 'name', dir: 'asc' })).rejects.toThrow();
  });

  it('CA-5: una carpeta ajena, inexistente o en la papelera llega como 404', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND, message: 'x', correlationId: 'c' },
        404,
      ),
    );

    await expect(api.folderContents(ALPHA.id)).rejects.toMatchObject({
      status: 404,
      code: STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND,
    });
  });

  it('CA-1: crea con POST /folders y valida la carpeta devuelta', async () => {
    const created = { id: ALPHA.id, name: 'Actas', parentId: null, createdAt: AT, updatedAt: AT };
    fetchMock.mockResolvedValue(jsonResponse(created, 201));

    await expect(api.createFolder({ name: 'Actas', parentId: null })).resolves.toEqual(created);
    const { url, init } = lastCall();
    expect(url).toBe(`${API}/folders`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'Actas', parentId: null });
  });

  it('CA-2: un 400 conserva los fields para mostrarlos junto al campo', async () => {
    const fields = [{ field: 'name', reason: 'INVALID_NAME', message: 'Nombre no válido.' }];
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: STORAGE_ERROR_CODES.STORAGE_INVALID_NODE_REQUEST,
          message: 'x',
          correlationId: 'c',
          fields,
        },
        400,
      ),
    );

    const error = await api
      .createFolder({ name: 'a/b', parentId: null })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageRequestError);
    expect(error).toMatchObject({ status: 400, fields });
  });
});

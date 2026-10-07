import { STORAGE_ERROR_CODES, type QuickAccessItem, type QuickAccessList } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createQuickAccessApi } from './quick-access-api';
import { createStorageHttp } from './storage-http';
import { StorageRequestError } from './storage-request-error';

const API = 'http://localhost/api/v1';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const FOLDER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const FOLDER: QuickAccessItem = { type: 'folder', id: FOLDER_ID, name: 'Proyecto Alpha' };
const FILE: QuickAccessItem = { type: 'file', id: FILE_ID, name: 'informe.docx', kind: 'docx' };
const LIST: QuickAccessList = { pinned: [FOLDER], recent: [FILE], hasMoreRecent: true };

const NO_CONTENT = 204;

function noContent(): Response {
  return { ok: true, status: NO_CONTENT, json: () => Promise.resolve(undefined) } as Response;
}

describe('api de accesos rápidos (006 CA-27, CA-28)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createQuickAccessApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  function lastCall(): { url: string; method: string | undefined; body: unknown } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), method: call?.[1]?.method, body: call?.[1]?.body };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-27: lee fijados, recientes y «hay más» con GET /quick-access', async () => {
    fetchMock.mockResolvedValue(jsonResponse(LIST));

    await expect(api.quickAccess()).resolves.toEqual(LIST);
    expect(lastCall()).toEqual({ url: `${API}/quick-access`, method: 'GET', body: undefined });
  });

  it('CA-27: fijar una carpeta es PUT /quick-access/pins/folders/:id y devuelve el elemento', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FOLDER));

    await expect(api.pin('folder', FOLDER_ID)).resolves.toEqual(FOLDER);
    expect(lastCall()).toEqual({
      url: `${API}/quick-access/pins/folders/${FOLDER_ID}`,
      method: 'PUT',
      body: undefined,
    });
  });

  it('CA-27: quitar un archivo de la barra es DELETE /quick-access/pins/files/:id', async () => {
    fetchMock.mockResolvedValue(noContent());

    await expect(api.unpin('file', FILE_ID)).resolves.toBeUndefined();
    expect(lastCall()).toEqual({
      url: `${API}/quick-access/pins/files/${FILE_ID}`,
      method: 'DELETE',
      body: undefined,
    });
  });

  it('CA-27: registrar una apertura es POST /quick-access/recents/{files|folders}/:id sin cuerpo', async () => {
    fetchMock.mockResolvedValue(noContent());

    await api.recordRecent('folder', FOLDER_ID);
    expect(lastCall()).toEqual({
      url: `${API}/quick-access/recents/folders/${FOLDER_ID}`,
      method: 'POST',
      body: undefined,
    });
    await api.recordRecent('file', FILE_ID);
    expect(lastCall().url).toBe(`${API}/quick-access/recents/files/${FILE_ID}`);
  });

  it('CA-28: el sexto fijado llega como StorageRequestError con el tope en details', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT,
          message: 'Ya fijaste 5 elementos. Quita uno para fijar otro.',
          correlationId: 'corr-prueba',
          details: { maxPinned: 5 },
        },
        422,
      ),
    );

    const failure = api.pin('file', FILE_ID);

    await expect(failure).rejects.toBeInstanceOf(StorageRequestError);
    await expect(failure).rejects.toMatchObject({
      status: 422,
      code: STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT,
      details: { maxPinned: 5 },
    });
  });

  it('una respuesta que no cumple el contrato se rechaza', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pinned: [] }));

    await expect(api.quickAccess()).rejects.toBeInstanceOf(StorageRequestError);
  });

  it('CA-28: un nodo ajeno o inexistente responde 404', async () => {
    fetchMock.mockResolvedValue(errorResponse(STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND, 404));

    await expect(api.recordRecent('folder', FOLDER_ID)).rejects.toMatchObject({ status: 404 });
  });
});

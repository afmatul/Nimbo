import { INTELLIGENCE_ERROR_CODES, STORAGE_ERROR_CODES } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';
import { createStorageHttp } from '../storage/storage-http';
import { StorageRequestError } from '../storage/storage-request-error';

import { createIndexingApi } from './indexing-api';
import { FAILED, INDEXED_FILE_ID } from './test-indexing';

const API = 'http://localhost/api/v1';

describe('api de indexación (019 plan §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createIndexingApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  function lastCall(): { url: string; method: string | undefined } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), method: call?.[1]?.method };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-14: lee el estado con GET /files/:id/indexing', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FAILED));

    await expect(api.status(INDEXED_FILE_ID)).resolves.toEqual(FAILED);
    expect(lastCall()).toEqual({ url: `${API}/files/${INDEXED_FILE_ID}/indexing`, method: 'GET' });
  });

  it('CA-14: una respuesta fuera del contrato se rechaza como falla del servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...FAILED, reason: null }));

    await expect(api.status(INDEXED_FILE_ID)).rejects.toEqual(
      new StorageRequestError(500, 'INTERNAL_ERROR'),
    );
  });

  it('CA-13: reintenta con POST /files/:id/indexing/retry y vuelve a `pendiente`', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ state: 'pendiente' }, 202));

    await expect(api.retry(INDEXED_FILE_ID)).resolves.toEqual({ state: 'pendiente' });
    expect(lastCall()).toEqual({
      url: `${API}/files/${INDEXED_FILE_ID}/indexing/retry`,
      method: 'POST',
    });
  });

  it('CA-13: un 409 llega como `StorageRequestError` con el código del módulo', async () => {
    const code = INTELLIGENCE_ERROR_CODES.INTELLIGENCE_INDEXING_NOT_RETRYABLE;
    fetchMock.mockResolvedValue(errorResponse(code, 409));

    await expect(api.retry(INDEXED_FILE_ID)).rejects.toEqual(new StorageRequestError(409, code));
  });

  it('CA-18: un archivo ajeno o en la papelera llega como 404', async () => {
    const code = STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND;
    fetchMock.mockResolvedValue(errorResponse(code, 404));

    await expect(api.status(INDEXED_FILE_ID)).rejects.toEqual(new StorageRequestError(404, code));
  });
});

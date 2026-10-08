import {
  STORAGE_ERROR_CODES,
  type FileVersionSummary,
  type FileVersionsResponse,
} from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createStorageHttp } from './storage-http';
import { StorageRequestError } from './storage-request-error';
import { createVersionsApi } from './versions-api';

const API = 'http://localhost/api/v1';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const VERSION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const VERSION: FileVersionSummary = {
  id: VERSION_ID,
  number: 4,
  origin: 'restauracion',
  sizeBytes: 2_400_000,
  deltaBytes: '-100000',
  restoredFromNumber: 2,
  createdAt: '2026-10-07T23:20:00.000Z',
  createdById: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d',
  isCurrent: false,
};

describe('api de versiones (014 plan §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createVersionsApi(
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

  it('CA-6: el historial es GET /files/:id/versions con las retenidas del plan', async () => {
    const history: FileVersionsResponse = { items: [VERSION], retainedVersions: 3 };
    fetchMock.mockResolvedValue(jsonResponse(history));

    await expect(api.fileVersions(FILE_ID)).resolves.toEqual(history);
    expect(lastCall()).toEqual({ url: `${API}/files/${FILE_ID}/versions`, method: 'GET' });
  });

  it('CA-9: restaurar es POST …/versions/:versionId/restore y devuelve la versión nueva', async () => {
    const restored = { ...VERSION, id: FILE_ID, number: 6, isCurrent: true };
    fetchMock.mockResolvedValue(jsonResponse(restored));

    await expect(api.restoreVersion(FILE_ID, VERSION_ID)).resolves.toEqual(restored);
    expect(lastCall()).toEqual({
      url: `${API}/files/${FILE_ID}/versions/${VERSION_ID}/restore`,
      method: 'POST',
    });
  });

  it('CA-8: la descarga de una versión es POST …/versions/:versionId/download-url', async () => {
    const signed = { url: 'https://objetos.local/firmada', expiresAt: '2026-10-08T10:05:00.000Z' };
    fetchMock.mockResolvedValue(jsonResponse(signed));

    await expect(api.versionDownloadUrl(FILE_ID, VERSION_ID)).resolves.toEqual(signed);
    expect(lastCall()).toEqual({
      url: `${API}/files/${FILE_ID}/versions/${VERSION_ID}/download-url`,
      method: 'POST',
    });
  });

  it('CA-11: un 404 de versión llega como StorageRequestError con su código', async () => {
    fetchMock.mockResolvedValue(errorResponse(STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND, 404));

    await expect(api.restoreVersion(FILE_ID, VERSION_ID)).rejects.toEqual(
      new StorageRequestError(404, STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND),
    );
  });

  it('una respuesta fuera del contrato se rechaza como falla del servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ ...VERSION, objectKey: 'k' }] }));

    await expect(api.fileVersions(FILE_ID)).rejects.toBeInstanceOf(StorageRequestError);
  });
});

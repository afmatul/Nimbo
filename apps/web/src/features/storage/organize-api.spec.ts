import { STORAGE_ERROR_CODES } from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createStorageApi } from './api';
import { StorageRequestError } from './storage-request-error';

const API = 'http://localhost/api/v1';
const AT = '2026-09-30T10:00:00.000Z';
const ALPHA_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const FOLDER = {
  id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'Actas',
  parentId: ALPHA_ID,
  createdAt: AT,
};
const FILE = {
  id: '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b',
  name: 'informe.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: ALPHA_ID,
  createdAt: AT,
};

describe('api para renombrar y mover (006 §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createStorageApi(
    API,
    createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
  );

  function lastCall(): { url: string; method: string | undefined; body: unknown } {
    const call = fetchMock.mock.calls.at(-1);
    const init = call?.[1] ?? {};
    return {
      url: String(call?.[0]),
      method: init.method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-4: renombra un archivo con PATCH /files/:id y onConflict', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FILE));

    await expect(api.renameFile(FILE.id, { name: FILE.name, onConflict: 'ask' })).resolves.toEqual(
      FILE,
    );
    expect(lastCall()).toEqual({
      url: `${API}/files/${FILE.id}`,
      method: 'PATCH',
      body: { name: FILE.name, onConflict: 'ask' },
    });
  });

  it('CA-4: renombra una carpeta con PATCH /folders/:id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(FOLDER));

    await expect(api.renameFolder(FOLDER.id, { name: 'Actas' })).resolves.toEqual(FOLDER);
    expect(lastCall()).toEqual({
      url: `${API}/folders/${FOLDER.id}`,
      method: 'PATCH',
      body: { name: 'Actas' },
    });
  });

  it('CA-7: mueve un archivo con POST /files/:id/move', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...FILE, folderId: null }));

    await api.moveFile(FILE.id, { folderId: null, onConflict: 'keep_both' });

    expect(lastCall()).toEqual({
      url: `${API}/files/${FILE.id}/move`,
      method: 'POST',
      body: { folderId: null, onConflict: 'keep_both' },
    });
  });

  it('CA-7: mueve una carpeta con POST /folders/:id/move', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...FOLDER, parentId: null }));

    await expect(api.moveFolder(FOLDER.id, { parentId: null })).resolves.toEqual({
      ...FOLDER,
      parentId: null,
    });
    expect(lastCall()).toEqual({
      url: `${API}/folders/${FOLDER.id}/move`,
      method: 'POST',
      body: { parentId: null },
    });
  });

  it('CA-7: el 409 de un archivo llega con details.suggestedName', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT,
          message: 'x',
          correlationId: 'c',
          details: { suggestedName: 'informe (1).docx' },
        },
        409,
      ),
    );

    const failure = api.moveFile(FILE.id, { folderId: null, onConflict: 'ask' });

    await expect(failure).rejects.toBeInstanceOf(StorageRequestError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      details: { suggestedName: 'informe (1).docx' },
    });
  });
});

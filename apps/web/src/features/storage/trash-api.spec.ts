import { STORAGE_ERROR_CODES, type TrashItem } from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createStorageHttp } from './storage-http';
import { createTrashApi } from './trash-api';

const API = 'http://localhost/api/v1';
const AT = '2026-09-30T10:00:00.000Z';
const PURGE_AT = '2026-11-29T10:00:00.000Z';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const FOLDER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ITEM: TrashItem = {
  id: FILE_ID,
  type: 'file',
  name: 'informe.docx',
  kind: 'docx',
  sizeBytes: 1_024,
  originalFolder: { id: FOLDER_ID, name: 'Proyecto Alpha' },
  deletedAt: AT,
  purgeAt: PURGE_AT,
};

describe('api de la papelera', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createTrashApi(
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

  it('CA-10: mover un archivo a la papelera es DELETE /files/:id y devuelve el elemento', async () => {
    fetchMock.mockResolvedValue(jsonResponse(ITEM));

    await expect(api.moveToTrash('file', FILE_ID)).resolves.toEqual(ITEM);
    expect(lastCall()).toEqual({ url: `${API}/files/${FILE_ID}`, method: 'DELETE' });
  });

  it('CA-11: mover una carpeta a la papelera es DELETE /folders/:id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...ITEM, id: FOLDER_ID, type: 'folder' }));

    await api.moveToTrash('folder', FOLDER_ID);
    expect(lastCall()).toEqual({ url: `${API}/folders/${FOLDER_ID}`, method: 'DELETE' });
  });

  it('CA-12: lista con GET /trash y lee el resumen con GET /trash/summary', async () => {
    const page = { items: [ITEM], nextCursor: null };
    const summary = { itemCount: 1, totalBytes: 1_024, retentionDays: 60 };
    fetchMock
      .mockResolvedValueOnce(jsonResponse(page))
      .mockResolvedValueOnce(jsonResponse(summary));

    await expect(api.listTrash()).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/trash`);
    await expect(api.trashSummary()).resolves.toEqual(summary);
    expect(lastCall()).toEqual({ url: `${API}/trash/summary`, method: 'GET' });
  });

  it('CA-13: restaura con POST /trash/{files|folders}/:id/restore', async () => {
    const restored = {
      item: { type: 'folder', id: FOLDER_ID, name: 'Actas', parentId: null, createdAt: AT },
      outcome: 'moved_to_root',
      originalName: 'Actas',
    };
    fetchMock.mockResolvedValue(jsonResponse(restored));

    await expect(api.restore('folder', FOLDER_ID)).resolves.toEqual(restored);
    expect(lastCall()).toEqual({
      url: `${API}/trash/folders/${FOLDER_ID}/restore`,
      method: 'POST',
    });
  });

  it('CA-18: elimina definitivamente con DELETE /trash/files/:id y vacía con DELETE /trash', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ freedBytes: 1_024 }))
      .mockResolvedValueOnce(jsonResponse({ scheduledItems: 3, pendingBytes: 9_000 }, 202));

    await expect(api.purge('file', FILE_ID)).resolves.toEqual({ freedBytes: 1_024 });
    expect(lastCall()).toEqual({ url: `${API}/trash/files/${FILE_ID}`, method: 'DELETE' });
    await expect(api.emptyTrash()).resolves.toEqual({ scheduledItems: 3, pendingBytes: 9_000 });
    expect(lastCall()).toEqual({ url: `${API}/trash`, method: 'DELETE' });
  });

  it('CA-16: un 404 llega como StorageRequestError con su código', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND, message: 'x', correlationId: 'c' },
        404,
      ),
    );

    await expect(api.restore('file', FILE_ID)).rejects.toMatchObject({
      status: 404,
      code: STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND,
    });
  });
});

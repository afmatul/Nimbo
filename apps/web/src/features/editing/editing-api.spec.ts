import { EDITING_ERROR_CODES } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';
import { createStorageHttp } from '../storage/storage-http';
import { StorageRequestError } from '../storage/storage-request-error';

import { createEditingApi } from './editing-api';
import { editingSession, FILE_ID } from './test-edit-session';

const API = 'http://localhost/api/v1';

describe('api de edición (016 plan §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createEditingApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  function lastCall(): { url: string; method: string | undefined; body: unknown } {
    const call = fetchMock.mock.calls.at(-1);
    const body = call?.[1]?.body;
    return {
      url: String(call?.[0]),
      method: call?.[1]?.method,
      body: typeof body === 'string' ? JSON.parse(body) : body,
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1, CA-6: abre con POST /files/:id/edit-session y el id de la conexión en vivo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(editingSession()));

    await expect(api.openSession(FILE_ID, 'conexion-1')).resolves.toEqual(editingSession());
    expect(lastCall()).toEqual({
      url: `${API}/files/${FILE_ID}/edit-session`,
      method: 'POST',
      body: { connectionId: 'conexion-1' },
    });
  });

  it('CA-6: sin conexión en vivo abre con el cuerpo vacío, nunca con un nombre visible (RN-12)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(editingSession()));

    await api.openSession(FILE_ID, null);

    expect(lastCall().body).toEqual({});
  });

  it('CA-15: un 503 llega como `StorageRequestError` con el código del módulo', async () => {
    fetchMock.mockResolvedValue(errorResponse(EDITING_ERROR_CODES.EDITING_UNAVAILABLE, 503));

    await expect(api.openSession(FILE_ID, null)).rejects.toEqual(
      new StorageRequestError(503, EDITING_ERROR_CODES.EDITING_UNAVAILABLE),
    );
  });

  it('una respuesta fuera del contrato se rechaza (p. ej. con la clave del objeto)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...editingSession(), objectKey: 'u/a/b' }));

    await expect(api.openSession(FILE_ID, null)).rejects.toBeInstanceOf(StorageRequestError);
  });
});

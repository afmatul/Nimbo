import { STORAGE_ERROR_CODES } from '@nimbo/contracts';

import { jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';

import { createStorageApi } from './api';
import { StorageRequestError } from './storage-request-error';

const API = 'http://localhost/api/v1';
const UPLOAD_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
const AT = '2026-09-30T10:00:00.000Z';
const SIGNED_URL = 'https://s3.nimbo.test/nimbo/u/a?X-Amz-Signature=abc';
const FILE = {
  id: FILE_ID,
  name: 'informe.docx',
  sizeBytes: 1024,
  kind: 'docx',
  folderId: null,
  createdAt: AT,
};

function storageError(
  code: string,
  status: number,
  details: Record<string, string | number | boolean> = {},
): Response {
  return jsonResponse({ code, message: code, correlationId: 'corr-prueba', details }, status);
}

describe('api de storage', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const renew = jest.fn<Promise<string | null>, []>();
  const api = createStorageApi(
    `${API}/`,
    createAuthFetch({ getAccessToken: () => 'token-a', renew }),
  );

  function lastCall(): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), init: call?.[1] ?? {} };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    renew.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1: inicia la carga con POST /uploads y Bearer, y valida la respuesta', async () => {
    const simple = {
      uploadId: UPLOAD_ID,
      mode: 'simple',
      name: 'informe.docx',
      expiresAt: AT,
      upload: { url: SIGNED_URL, method: 'PUT', expiresAt: AT },
    };
    fetchMock.mockResolvedValue(jsonResponse(simple, 201));

    await expect(
      api.init({ name: 'informe.docx', sizeBytes: 1024, onConflict: 'ask' }),
    ).resolves.toEqual(simple);

    const { url, init } = lastCall();
    expect(url).toBe(`${API}/uploads`);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer token-a');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'informe.docx',
      sizeBytes: 1024,
      onConflict: 'ask',
    });
  });

  it('CA-6: un 409 llega como StorageRequestError con status, código y suggestedName', async () => {
    fetchMock.mockResolvedValue(
      storageError(STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT, 409, {
        suggestedName: 'informe (1).docx',
      }),
    );

    const error = await api
      .init({ name: 'informe.docx', sizeBytes: 1024, onConflict: 'ask' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageRequestError);
    expect(error).toMatchObject({
      status: 409,
      code: STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT,
      details: { suggestedName: 'informe (1).docx' },
    });
  });

  it('CA-19: un 429 conserva el status para que la fila quede en espera', async () => {
    fetchMock.mockResolvedValue(storageError(STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS, 429));

    await expect(
      api.init({ name: 'a.pdf', sizeBytes: 1, onConflict: 'ask' }),
    ).rejects.toMatchObject({ status: 429, code: STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS });
  });

  it('CA-8: sin respuesta (red caída) no es StorageRequestError: el manager lo trata como corte', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.resume(UPLOAD_ID).catch((caught: unknown) => caught);

    expect(error).not.toBeInstanceOf(StorageRequestError);
  });

  it('CA-5: el 422 de tamaño distinto llega con su código', async () => {
    fetchMock.mockResolvedValue(
      storageError(STORAGE_ERROR_CODES.STORAGE_UPLOAD_SIZE_MISMATCH, 422),
    );

    await expect(api.complete(UPLOAD_ID)).rejects.toMatchObject({
      status: 422,
      code: STORAGE_ERROR_CODES.STORAGE_UPLOAD_SIZE_MISMATCH,
    });
    expect(lastCall().url).toBe(`${API}/uploads/${UPLOAD_ID}/complete`);
  });

  it('CA-8: reanuda con POST /uploads/:id/resume y valida la respuesta', async () => {
    const resumed = {
      uploadId: UPLOAD_ID,
      mode: 'simple',
      expiresAt: AT,
      completedParts: [],
      pending: { url: SIGNED_URL, method: 'PUT', expiresAt: AT },
    };
    fetchMock.mockResolvedValue(jsonResponse(resumed));

    await expect(api.resume(UPLOAD_ID)).resolves.toEqual(resumed);
    expect(lastCall()).toMatchObject({
      url: `${API}/uploads/${UPLOAD_ID}/resume`,
      init: { method: 'POST' },
    });
  });

  it('CA-1: completa con POST /uploads/:id/complete y devuelve el archivo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ file: FILE }));

    await expect(api.complete(UPLOAD_ID)).resolves.toEqual({ file: FILE });
  });

  it('CA-22: cancela con DELETE /uploads/:id (204)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

    await expect(api.cancel(UPLOAD_ID)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      url: `${API}/uploads/${UPLOAD_ID}`,
      init: { method: 'DELETE' },
    });
  });

  it('CA-1: lista la raíz con GET /files y pasa el cursor opaco tal cual', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [FILE], nextCursor: null }));

    await expect(api.listFiles()).resolves.toEqual({ items: [FILE], nextCursor: null });
    expect(lastCall().url).toBe(`${API}/files`);

    await api.listFiles('abc+/=');
    expect(lastCall().url).toBe(`${API}/files?cursor=abc%2B%2F%3D`);
  });

  it('CA-13: pide la URL de descarga con POST /files/:id/download-url', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ url: SIGNED_URL, expiresAt: AT }));

    await expect(api.downloadUrl(FILE_ID)).resolves.toEqual({ url: SIGNED_URL, expiresAt: AT });
    expect(lastCall()).toMatchObject({
      url: `${API}/files/${FILE_ID}/download-url`,
      init: { method: 'POST' },
    });
  });

  it('CA-13: un 404 de descarga llega como STORAGE_NODE_NOT_FOUND', async () => {
    fetchMock.mockResolvedValue(storageError(STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND, 404));

    await expect(api.downloadUrl(FILE_ID)).rejects.toMatchObject({
      status: 404,
      code: STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND,
    });
  });

  it('una respuesta 2xx que no cumple el contrato es un error del servidor, no un corte', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ items: [{ ...FILE, objectKey: 'u/x' }], nextCursor: null }),
    );

    const error = await api.listFiles().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageRequestError);
  });

  it('CA-28 (002): ante 401 SHARED_UNAUTHENTICATED renueva la sesión y repite', async () => {
    renew.mockResolvedValue('token-b');
    fetchMock
      .mockResolvedValueOnce(storageError('SHARED_UNAUTHENTICATED', 401))
      .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));

    await expect(api.listFiles()).resolves.toEqual({ items: [], nextCursor: null });
    expect(new Headers(lastCall().init.headers).get('authorization')).toBe('Bearer token-b');
  });
});

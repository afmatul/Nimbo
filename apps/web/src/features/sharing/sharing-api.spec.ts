import { SHARING_ERROR_CODES } from '@nimbo/contracts';

import { errorResponse, jsonResponse } from '../../lib/test-http';
import { createAuthFetch } from '../identity/session/auth-fetch';
import { createStorageHttp } from '../storage/storage-http';
import { StorageRequestError } from '../storage/storage-request-error';

import { createSharingApi, publicLinkBody } from './sharing-api';
import {
  directEntry,
  INHERITED_ENTRY,
  NODE_ID,
  PUBLIC_LINK_ID,
  PUBLIC_LINK_URL,
  publicLink,
  RECEIVED_FOLDER,
  receivedShare,
  SHARE_ID,
} from './test-sharing';

const API = 'http://localhost/api/v1';
const EMAIL = 'juan@nimbo.gt';

describe('api de compartición (plan 012b §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createSharingApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  function lastCall(): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), init: call?.[1] ?? {} };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-2: comparte con POST /shares; el correo va solo en el cuerpo, nunca en la URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(directEntry(), 201));
    const body = { nodeType: 'file', nodeId: NODE_ID, email: EMAIL, level: 'EDITOR' } as const;

    await expect(api.share(body)).resolves.toEqual(directEntry());

    const { url, init } = lastCall();
    expect(url).toBe(`${API}/shares`);
    expect(url).not.toContain(EMAIL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it('CA-1: lista los accesos de un nodo con GET /shares?nodeType&nodeId', async () => {
    const list = { entries: [directEntry(), INHERITED_ENTRY] };
    fetchMock.mockResolvedValue(jsonResponse(list));

    await expect(api.listAccess({ nodeType: 'folder', nodeId: NODE_ID })).resolves.toEqual(list);
    expect(lastCall()).toMatchObject({
      url: `${API}/shares?nodeType=folder&nodeId=${NODE_ID}`,
      init: { method: 'GET' },
    });
  });

  it('CA-5: quita un acceso con DELETE /shares/:shareId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));

    await expect(api.revoke(SHARE_ID)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      url: `${API}/shares/${SHARE_ID}`,
      init: { method: 'DELETE' },
    });
  });

  it('CA-8: lee «Compartidos conmigo» con GET /shares/received', async () => {
    const received = { entries: [receivedShare(), RECEIVED_FOLDER] };
    fetchMock.mockResolvedValue(jsonResponse(received));

    await expect(api.listReceived()).resolves.toEqual(received);
    expect(lastCall()).toMatchObject({ url: `${API}/shares/received`, init: { method: 'GET' } });
  });

  it('CA-10: sale con DELETE /shares/received/:shareId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));

    await expect(api.leave(SHARE_ID)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      url: `${API}/shares/received/${SHARE_ID}`,
      init: { method: 'DELETE' },
    });
  });

  it('CA-11: un 404 llega como `StorageRequestError` con el código de `sharing`', async () => {
    const code = SHARING_ERROR_CODES.SHARING_SHARE_NOT_FOUND;
    fetchMock.mockResolvedValue(errorResponse(code, 404));

    await expect(api.leave(SHARE_ID)).rejects.toMatchObject({ status: 404, code });
  });

  it('CA-3: un 429 conserva la espera de `Retry-After` para el mensaje', async () => {
    fetchMock.mockResolvedValue(
      errorResponse('SHARED_TOO_MANY_REQUESTS', 429, { 'retry-after': '180' }),
    );

    await expect(
      api.share({ nodeType: 'file', nodeId: NODE_ID, email: EMAIL, level: 'VIEWER' }),
    ).rejects.toMatchObject({ status: 429, details: { retryAfterSeconds: 180 } });
  });

  it('CA-1: una respuesta fuera del contrato se rechaza como falla del servidor', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ entries: [{ ...INHERITED_ENTRY, shareId: SHARE_ID }] }),
    );

    await expect(api.listAccess({ nodeType: 'file', nodeId: NODE_ID })).rejects.toEqual(
      new StorageRequestError(500, 'INTERNAL_ERROR'),
    );
  });
});

describe('cuerpo de generar un enlace público (plan 013c §1, I-1)', () => {
  it('CA-4: la contraseña vacía no se envía', () => {
    expect(publicLinkBody({ fileId: NODE_ID, expiresInDays: 7, password: '' })).toEqual({
      fileId: NODE_ID,
      expiresInDays: 7,
    });
  });

  it('CA-3: una contraseña escrita viaja tal cual', () => {
    expect(
      publicLinkBody({ fileId: NODE_ID, expiresInDays: 30, password: 'puente-azul-27' }),
    ).toEqual({ fileId: NODE_ID, expiresInDays: 30, password: 'puente-azul-27' });
  });
});

describe('api del enlace público del propietario (plan 013c §4)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const api = createSharingApi(
    createStorageHttp(
      API,
      createAuthFetch({ getAccessToken: () => 'token-a', renew: () => Promise.resolve(null) }),
    ),
  );

  function lastCall(): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), init: call?.[1] ?? {} };
  }

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-1: lee el enlace sin revocar con GET /public-links?fileId', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ link: publicLink() }));

    await expect(api.currentPublicLink(NODE_ID)).resolves.toEqual({ link: publicLink() });
    expect(lastCall()).toMatchObject({
      url: `${API}/public-links?fileId=${NODE_ID}`,
      init: { method: 'GET' },
    });
  });

  it('CA-1: un archivo sin enlace llega como `link: null`', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ link: null }));

    await expect(api.currentPublicLink(NODE_ID)).resolves.toEqual({ link: null });
  });

  it('CA-4: genera con POST /public-links sin la contraseña vacía en el cuerpo', async () => {
    const created = { link: publicLink(), url: PUBLIC_LINK_URL };
    fetchMock.mockResolvedValue(jsonResponse(created, 201));

    await expect(
      api.createPublicLink({ fileId: NODE_ID, expiresInDays: 7, password: '' }),
    ).resolves.toEqual(created);

    const { url, init } = lastCall();
    expect(url).toBe(`${API}/public-links`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ fileId: NODE_ID, expiresInDays: 7 });
  });

  it('CA-3: genera con la contraseña escrita en el cuerpo, nunca en la URL', async () => {
    const created = { link: publicLink({ hasPassword: true }), url: PUBLIC_LINK_URL };
    fetchMock.mockResolvedValue(jsonResponse(created, 201));
    const input = { fileId: NODE_ID, expiresInDays: 1, password: 'puente-azul-27' } as const;

    await api.createPublicLink(input);

    const { url, init } = lastCall();
    expect(url).not.toContain(input.password);
    expect(JSON.parse(String(init.body))).toEqual(input);
  });

  it('CA-9: revoca con DELETE /public-links/:linkId', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, 204));

    await expect(api.revokePublicLink(PUBLIC_LINK_ID)).resolves.toBeUndefined();
    expect(lastCall()).toMatchObject({
      url: `${API}/public-links/${PUBLIC_LINK_ID}`,
      init: { method: 'DELETE' },
    });
  });

  it('CA-14: un 404 al revocar llega como `StorageRequestError` con su código', async () => {
    const code = SHARING_ERROR_CODES.SHARING_LINK_NOT_FOUND;
    fetchMock.mockResolvedValue(errorResponse(code, 404));

    await expect(api.revokePublicLink(PUBLIC_LINK_ID)).rejects.toMatchObject({ status: 404, code });
  });

  it('CA-13: una respuesta de generar sin URL se rechaza como falla del servidor', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ link: publicLink() }, 201));

    await expect(
      api.createPublicLink({ fileId: NODE_ID, expiresInDays: 7, password: '' }),
    ).rejects.toEqual(new StorageRequestError(500, 'INTERNAL_ERROR'));
  });
});

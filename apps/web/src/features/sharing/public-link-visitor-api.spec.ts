import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';

import { ApiClientError } from '../../lib/api-error';
import { errorResponse, jsonResponse } from '../../lib/test-http';

import { createPublicLinkVisitorApi } from './public-link-visitor-api';
import { PUBLIC_LINK_DETAILS, SIGNED_DOWNLOAD } from './test-public-link';

const API = 'http://localhost/api/v1';
const TOKEN = 'tok-visitante';

describe('cliente del visitante del enlace público (013b CA-9, CA-10)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  function lastCall(): { url: string; init: RequestInit } {
    const call = fetchMock.mock.calls.at(-1);
    return { url: String(call?.[0]), init: call?.[1] ?? {} };
  }

  const sentBody = (): unknown => JSON.parse(String(lastCall().init.body));

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-9, CA-10: abre con POST a API_PUBLIC_URL/public-links/open, sin cookies ni Authorization', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLIC_LINK_DETAILS));

    const details = await createPublicLinkVisitorApi(API).open(TOKEN);

    const { url, init } = lastCall();
    expect(details).toEqual(PUBLIC_LINK_DETAILS);
    expect(url).toBe(`${API}/public-links/open`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    expect(sentBody()).toEqual({ token: TOKEN });
  });

  it('CA-9: una URL base con barra final no duplica la barra', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLIC_LINK_DETAILS));

    await createPublicLinkVisitorApi(`${API}/`).open(TOKEN);

    expect(lastCall().url).toBe(`${API}/public-links/open`);
  });

  it('CA-9: descarga con POST /public-links/download; el cuerpo lleva solo token y contraseña', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SIGNED_DOWNLOAD));

    const signed = await createPublicLinkVisitorApi(API).download(TOKEN, 'secreta-123');

    const { url, init } = lastCall();
    expect(signed).toEqual(SIGNED_DOWNLOAD);
    expect(url).toBe(`${API}/public-links/download`);
    expect(init.credentials).toBe('omit');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
    expect(sentBody()).toEqual({ token: TOKEN, password: 'secreta-123' });
  });

  it.each([
    ['sin contraseña', undefined],
    ['con la contraseña vacía', ''],
  ])('CA-9: %s, el cuerpo omite `password`', async (_caso, password) => {
    fetchMock.mockResolvedValue(jsonResponse(SIGNED_DOWNLOAD));

    await createPublicLinkVisitorApi(API).download(TOKEN, password);

    expect(sentBody()).toEqual({ token: TOKEN });
  });

  it('CA-9: el token no va en la URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLIC_LINK_DETAILS));

    await createPublicLinkVisitorApi(API).open(TOKEN);

    expect(lastCall().url).not.toContain(TOKEN);
  });

  it('un 403 llega como ApiClientError con su `code`', async () => {
    fetchMock.mockResolvedValue(
      errorResponse(SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID, 403),
    );

    const failure = createPublicLinkVisitorApi(API).download(TOKEN, 'otra-clave');

    await expect(failure).rejects.toBeInstanceOf(ApiClientError);
    await expect(failure).rejects.toMatchObject({
      code: SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID,
      status: 403,
    });
  });

  it('un 429 llega como ApiClientError con `retryAfterSeconds` de `Retry-After`', async () => {
    fetchMock.mockResolvedValue(
      errorResponse(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 429, { 'retry-after': '900' }),
    );

    await expect(createPublicLinkVisitorApi(API).open(TOKEN)).rejects.toMatchObject({
      code: SHARED_ERROR_CODES.TOO_MANY_REQUESTS,
      retryAfterSeconds: 900,
      status: 429,
    });
  });

  it('una respuesta 2xx fuera del contrato es el error genérico', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ...PUBLIC_LINK_DETAILS, ownerId: 'u-1' }));

    await expect(createPublicLinkVisitorApi(API).open(TOKEN)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('la red caída llega como ApiClientError sin `status`', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(createPublicLinkVisitorApi(API).download(TOKEN)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: undefined,
    });
  });
});

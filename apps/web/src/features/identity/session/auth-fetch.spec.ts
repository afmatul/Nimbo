import { errorResponse, jsonResponse } from '../../../lib/test-http';

import { createAuthFetch } from './auth-fetch';

const URL_FILES = 'http://localhost/api/v1/files';

function authorizationOf(call: Parameters<typeof fetch> | undefined): string | null {
  return new Headers(call?.[1]?.headers).get('authorization');
}

describe('auth-fetch', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('CA-28: agrega Authorization: Bearer con el token en memoria', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));
    const authFetch = createAuthFetch({ getAccessToken: () => 'token-a', renew: jest.fn() });

    await expect(authFetch(URL_FILES)).resolves.toEqual({ items: [] });
    expect(authorizationOf(fetchMock.mock.calls[0])).toBe('Bearer token-a');
  });

  it('CA-7: ante 401 SHARED_UNAUTHENTICATED renueva una vez y repite con el token nuevo', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse('SHARED_UNAUTHENTICATED', 401))
      .mockResolvedValueOnce(jsonResponse({ items: [1] }));
    const renew = jest.fn().mockResolvedValue('token-b');
    const authFetch = createAuthFetch({ getAccessToken: () => 'token-a', renew });

    await expect(authFetch(URL_FILES, { method: 'GET' })).resolves.toEqual({ items: [1] });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(authorizationOf(fetchMock.mock.calls[1])).toBe('Bearer token-b');
  });

  it('si el reintento vuelve a dar 401, no renueva otra vez', async () => {
    fetchMock.mockResolvedValue(errorResponse('SHARED_UNAUTHENTICATED', 401));
    const renew = jest.fn().mockResolvedValue('token-b');
    const authFetch = createAuthFetch({ getAccessToken: () => 'token-a', renew });

    await expect(authFetch(URL_FILES)).rejects.toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('plan §5: ante un 401 IDENTITY_* no renueva', async () => {
    fetchMock.mockResolvedValue(errorResponse('IDENTITY_INVALID_CREDENTIALS', 401));
    const renew = jest.fn();
    const authFetch = createAuthFetch({ getAccessToken: () => 'token-a', renew });

    await expect(authFetch(URL_FILES)).rejects.toMatchObject({
      code: 'IDENTITY_INVALID_CREDENTIALS',
    });
    expect(renew).not.toHaveBeenCalled();
  });

  it('CA-8: si la renovación falla, propaga el 401 sin repetir la petición', async () => {
    fetchMock.mockResolvedValue(errorResponse('SHARED_UNAUTHENTICATED', 401));
    const renew = jest.fn().mockResolvedValue(null);
    const authFetch = createAuthFetch({ getAccessToken: () => 'token-a', renew });

    await expect(authFetch(URL_FILES)).rejects.toMatchObject({ code: 'SHARED_UNAUTHENTICATED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

import { register, resendVerification, verifyEmail } from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api de identity', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const registerBody = {
    fullName: 'Ana López',
    email: 'ana@ejemplo.com',
    password: 'UnaClaveSegura!1',
    acceptTerms: true as const,
  };

  it('register valida la respuesta accepted', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));

    await expect(register('http://localhost/api/v1', registerBody)).resolves.toEqual({
      status: 'accepted',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost/api/v1/auth/register');
  });

  it('resendVerification valida la respuesta accepted', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));

    await expect(
      resendVerification('http://localhost/api/v1', { email: 'ana@ejemplo.com' }),
    ).resolves.toEqual({
      status: 'accepted',
    });
  });

  it('verifyEmail valida verified y already-verified', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'verified' }));
    await expect(verifyEmail('http://localhost/api/v1', 'token-opaco')).resolves.toEqual({
      status: 'verified',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'already-verified' }));
    await expect(verifyEmail('http://localhost/api/v1', 'token-opaco')).resolves.toEqual({
      status: 'already-verified',
    });
  });

  it('un cuerpo que no cumple el esquema es un error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'otra-cosa' }, 200));

    await expect(verifyEmail('http://localhost/api/v1', 'token-opaco')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});

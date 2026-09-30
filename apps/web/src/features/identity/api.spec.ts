import {
  checkResetLink,
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from './api';

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

  describe('sesión (plan 002 §5)', () => {
    const session = {
      accessToken: 'token-de-acceso',
      accessTokenExpiresAt: '2026-09-30T12:15:00.000Z',
      user: {
        id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d',
        fullName: 'Ana López',
        email: 'ana@ejemplo.com',
        role: 'CLIENT',
      },
    };

    function lastCall(): { url: string; init: RequestInit } {
      const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
      return { url: String(url), init: init ?? {} };
    }

    it('CA-1: login hace POST /auth/login con credenciales incluidas y valida la sesión', async () => {
      fetchMock.mockResolvedValue(jsonResponse(session));

      await expect(
        login('http://localhost/api/v1', { email: 'ana@ejemplo.com', password: 'secreta' }),
      ).resolves.toEqual(session);

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/login');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'ana@ejemplo.com',
        password: 'secreta',
      });
    });

    it('CA-2: login propaga el code tipado del error', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { code: 'IDENTITY_INVALID_CREDENTIALS', message: 'No', correlationId: 'c-1' },
          401,
        ),
      );

      await expect(
        login('http://localhost/api/v1', { email: 'ana@ejemplo.com', password: 'otra' }),
      ).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CREDENTIALS', correlationId: 'c-1' });
    });

    it('CA-7: refresh hace POST /auth/session/refresh sin cuerpo y con credenciales', async () => {
      fetchMock.mockResolvedValue(jsonResponse(session));

      await expect(refresh('http://localhost/api/v1')).resolves.toEqual(session);

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/session/refresh');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.body).toBeUndefined();
    });

    it('refresh rechaza una sesión que no cumple el contrato', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ...session, user: { id: 'x' } }));

      await expect(refresh('http://localhost/api/v1')).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
      });
    });

    it('logout hace POST /auth/session/logout sin cuerpo, con credenciales, y acepta el 204', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(logout('http://localhost/api/v1')).resolves.toBeUndefined();

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/session/logout');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.body).toBeUndefined();
    });
  });

  describe('recuperación (plan 002 §5)', () => {
    function lastCall(): { url: string; init: RequestInit } {
      const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
      return { url: String(url), init: init ?? {} };
    }

    it('CA-18: forgotPassword hace POST /auth/forgot-password sin credenciales y valida el 202', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));

      await expect(
        forgotPassword('http://localhost/api/v1', { email: 'ana@ejemplo.com' }),
      ).resolves.toEqual({ status: 'accepted' });

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/forgot-password');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBeUndefined();
      expect(JSON.parse(String(init.body))).toEqual({ email: 'ana@ejemplo.com' });
    });

    it('CA-18: forgotPassword propaga el límite con su Retry-After', async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'IDENTITY_TOO_MANY_REQUESTS', message: 'No', correlationId: 'c' }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '60' } },
        ),
      );

      await expect(
        forgotPassword('http://localhost/api/v1', { email: 'ana@ejemplo.com' }),
      ).rejects.toMatchObject({ code: 'IDENTITY_TOO_MANY_REQUESTS', retryAfterSeconds: 60 });
    });

    it('CA-20: checkResetLink hace POST /auth/reset-password/check con el token y valida `valid`', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'valid' }));

      await expect(checkResetLink('http://localhost/api/v1', 'token-opaco')).resolves.toEqual({
        status: 'valid',
      });

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/reset-password/check');
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ token: 'token-opaco' });
    });

    it('CA-20: checkResetLink propaga el enlace vencido', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { code: 'IDENTITY_RESET_LINK_EXPIRED', message: 'No', correlationId: 'c-2' },
          422,
        ),
      );

      await expect(checkResetLink('http://localhost/api/v1', 'viejo')).rejects.toMatchObject({
        code: 'IDENTITY_RESET_LINK_EXPIRED',
      });
    });

    it('CA-19: resetPassword hace POST /auth/reset-password con credenciales y valida `password-reset`', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ status: 'password-reset' }));

      await expect(
        resetPassword('http://localhost/api/v1', {
          token: 'token-opaco',
          password: 'UnaClaveSegura!1',
        }),
      ).resolves.toEqual({ status: 'password-reset' });

      const { url, init } = lastCall();
      expect(url).toBe('http://localhost/api/v1/auth/reset-password');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(JSON.parse(String(init.body))).toEqual({
        token: 'token-opaco',
        password: 'UnaClaveSegura!1',
      });
    });

    it('CA-21: resetPassword propaga IDENTITY_WEAK_PASSWORD con sus fields', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            code: 'IDENTITY_WEAK_PASSWORD',
            message: 'No',
            correlationId: 'c-3',
            fields: [{ field: 'password', reason: 'PASSWORD_COMMON', message: 'Común' }],
          },
          422,
        ),
      );

      await expect(
        resetPassword('http://localhost/api/v1', {
          token: 'token-opaco',
          password: 'UnaClaveSegura!1',
        }),
      ).rejects.toMatchObject({
        code: 'IDENTITY_WEAK_PASSWORD',
        fields: [{ field: 'password', reason: 'PASSWORD_COMMON' }],
      });
    });
  });
});

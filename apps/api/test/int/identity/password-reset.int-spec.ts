import request from 'supertest';
import { DataSource } from 'typeorm';

import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  FORGOT_PASSWORD_PATH,
  insertAccount,
  LOGIN_PATH,
  RESET_PASSWORD_CHECK_PATH,
  RESET_PASSWORD_PATH,
  setCookie,
} from './accounts';
import type { AccountOptions } from './accounts';
import { createIdentityTestApp, resetTokenSentTo } from './identity-test-app';

/** Contraseña nueva que cumple la política de 001 y no se parece al correo de las cuentas de prueba. */
const NEW_PASSWORD = 'Otra-Clave-Segura-2026';

/**
 * Recuperación de contraseña de punta a punta (plan 002 §5, CA-18 a CA-21). Cada prueba usa una cuenta nueva, así
 * los límites por correo y los correos de Mailpit (filtrados por destinatario) no se cruzan entre pruebas.
 */
describe('recuperación de contraseña (CA-18 a CA-21)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const forgotPassword = (email: string) =>
    request(server()).post(FORGOT_PASSWORD_PATH).send({ email });
  const checkResetLink = (token: string) =>
    request(server()).post(RESET_PASSWORD_CHECK_PATH).send({ token });
  const resetPassword = (token: string, password: string, cookie?: string) => {
    const call = request(server()).post(RESET_PASSWORD_PATH).send({ token, password });
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  /** Cuenta nueva que pide la recuperación (`202`); devuelve su correo y el token del enlace que llegó a Mailpit. */
  const requestedReset = async (
    options?: AccountOptions,
  ): Promise<{ email: string; token: string }> => {
    const { email } = await insertAccount(dataSource, options);
    await forgotPassword(email).expect(202);
    return { email, token: await resetTokenSentTo(email) };
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('caminos felices', () => {
    it('CA-18: `forgot-password` → `202 { status: accepted }` sin caché y el enlace llega por correo', async () => {
      const { email } = await insertAccount(dataSource);

      const response = await forgotPassword(email);

      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: 'accepted' });
      expect(response.headers['cache-control']).toBe('no-store');
      await expect(resetTokenSentTo(email)).resolves.toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('CA-20: `reset-password/check` con el enlace del correo → `200 { status: valid }` sin consumirlo', async () => {
      const { token } = await requestedReset();

      const first = await checkResetLink(token);
      const second = await checkResetLink(token);

      expect(first.status).toBe(200);
      expect(first.body).toEqual({ status: 'valid' });
      expect(first.headers['cache-control']).toBe('no-store');
      expect(second.body).toEqual({ status: 'valid' });
    });

    it('CA-19: `reset-password` → `200 { status: password-reset }`, borra `nimbo_rt` y la contraseña nueva sirve', async () => {
      const { email, token } = await requestedReset();

      const response = await resetPassword(
        token,
        NEW_PASSWORD,
        cookieHeader({ nimbo_rt: 'cualquier-valor' }),
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'password-reset' });
      const cleared = setCookie(response.headers, 'nimbo_rt');
      expect(cleared?.value).toBe('');
      expect(cleared?.attributes).toContain('path=/api/v1/auth/session');
      await request(server())
        .post(LOGIN_PATH)
        .send({ email, password: ACCOUNT_PASSWORD })
        .expect(401);
      await request(server()).post(LOGIN_PATH).send({ email, password: NEW_PASSWORD }).expect(200);
    });
  });
});

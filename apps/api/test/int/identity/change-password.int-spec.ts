import {
  errorResponseSchema,
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_FAILURES,
  sessionResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  insertAccount,
  LOGIN_PATH,
  REFRESH_PATH,
  setCookie,
} from './accounts';
import type { AccountOptions } from './accounts';
import { createIdentityTestApp, firstMessageTo } from './identity-test-app';

const CHANGE_PASSWORD_PATH = '/api/v1/auth/change-password';
/** Contraseña nueva que cumple la política de 001 y no se parece al correo de las cuentas de prueba. */
const NEW_PASSWORD = 'Otra-Clave-Segura-2026';
const WRONG_PASSWORD = 'Clave-Incorrecta-2026';
const PASSWORD_CHANGED_SUBJECT = 'Tu contraseña de Nimbo cambió';
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const LOCK_SECONDS = PASSWORD_CHANGE_LOCK_MINUTES * SECONDS_PER_MINUTE;

/** Lo que un navegador guarda de su sesión: el token de acceso en memoria y `nimbo_rt` en la cookie. */
interface Browser {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly sessionId: string;
}

/**
 * `POST /auth/change-password` de punta a punta (plan 002 §5, CA-22 y CA-23). Cada prueba usa una cuenta nueva, así
 * el bloqueo por cuenta y los correos de Mailpit (filtrados por destinatario) no se cruzan. El reloj es un
 * `FixedClock` que la prueba del bloqueo adelanta 15 minutos.
 */
describe('POST /auth/change-password (CA-22, CA-23)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let nextIp = 0;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  /** Una IP por inicio de sesión: el límite por IP (CA-6) tiene su propia suite. */
  const signInFrom = async (email: string, userAgent: string): Promise<Browser> => {
    nextIp += 1;
    const response = await request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `192.0.2.${String((nextIp % 250) + 1)}`)
      .set('User-Agent', userAgent)
      .send({ email, password: ACCOUNT_PASSWORD })
      .expect(200);
    const refreshToken = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
    const { accessToken } = sessionResponseSchema.parse(response.body);
    return { accessToken, refreshToken, sessionId: refreshToken.split('.')[0] ?? '' };
  };

  /** Cuenta nueva con sesión abierta en un navegador. */
  const accountSignedIn = async (options?: AccountOptions) => {
    const account = await insertAccount(dataSource, options);
    return { account, browser: await signInFrom(account.email, 'Firefox de prueba') };
  };

  const changePassword = (accessToken: string | undefined, body: Record<string, unknown>) => {
    const call = request(server()).post(CHANGE_PASSWORD_PATH).send(body);
    return accessToken === undefined ? call : call.set('Authorization', `Bearer ${accessToken}`);
  };

  const refresh = (browser: Browser) =>
    request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: browser.refreshToken }));

  /** Renueva la sesión (`200`) y devuelve el navegador con el token de acceso y la cookie nuevos. */
  const refreshed = async (browser: Browser): Promise<Browser> => {
    const response = await refresh(browser).expect(200);
    const refreshToken = setCookie(response.headers, 'nimbo_rt')?.value ?? '';
    const { accessToken } = sessionResponseSchema.parse(response.body);
    return { accessToken, refreshToken, sessionId: browser.sessionId };
  };

  const passwordHashOf = async (userId: string): Promise<string> => {
    const [row] = (await dataSource.query('SELECT hash_clave FROM usuario WHERE id = $1', [
      userId,
    ])) as { hash_clave: string }[];
    if (row === undefined) throw new Error('La cuenta de la prueba no existe.');
    return row.hash_clave;
  };

  const revokedAtBySession = async (userId: string): Promise<Record<string, Date | null>> => {
    const rows = (await dataSource.query(
      'SELECT id, revocada_en FROM sesion WHERE usuario_id = $1',
      [userId],
    )) as { id: string; revocada_en: Date | null }[];
    return Object.fromEntries(rows.map((row) => [row.id, row.revocada_en]));
  };

  const loginStatus = async (email: string, password: string): Promise<number> => {
    nextIp += 1;
    const response = await request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `192.0.2.${String((nextIp % 250) + 1)}`)
      .send({ email, password });
    return response.status;
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  describe('la ruta', () => {
    it('CA-22: `204` sin cuerpo ni caché; la contraseña nueva sirve y la anterior ya no', async () => {
      const { account, browser } = await accountSignedIn();

      const response = await changePassword(browser.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(await loginStatus(account.email, ACCOUNT_PASSWORD)).toBe(401);
      expect(await loginStatus(account.email, NEW_PASSWORD)).toBe(200);
    });

    it('CA-22: sin token → `401 SHARED_UNAUTHENTICATED` y la contraseña no cambia', async () => {
      const { account } = await accountSignedIn();
      const before = await passwordHashOf(account.id);

      const response = await changePassword(undefined, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(response.status).toBe(401);
      expect(errorResponseSchema.parse(response.body).code).toBe('SHARED_UNAUTHENTICATED');
      expect(await passwordHashOf(account.id)).toBe(before);
    });
  });

  describe('CA-22: cambio correcto', () => {
    it('CA-22: con tres navegadores, las otras dos sesiones quedan revocadas, la actual renueva y llega «Tu contraseña cambió»', async () => {
      const account = await insertAccount(dataSource);
      const [current, ...others] = [
        await signInFrom(account.email, 'Firefox de prueba'),
        await signInFrom(account.email, 'Chrome de prueba'),
        await signInFrom(account.email, 'Safari de prueba'),
      ];
      if (current === undefined) throw new Error('Falta la sesión actual.');

      await changePassword(current.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      const revokedAt = await revokedAtBySession(account.id);
      expect(revokedAt[current.sessionId]).toBeNull();
      for (const other of others) {
        expect(revokedAt[other.sessionId]).toEqual(clock.now());
        const response = await refresh(other);
        expect(response.status).toBe(401);
        expect(errorResponseSchema.parse(response.body).code).toBe('IDENTITY_SESSION_REVOKED');
      }
      await refreshed(current);
      await expect(firstMessageTo(account.email, PASSWORD_CHANGED_SUBJECT)).resolves.toMatchObject({
        Subject: PASSWORD_CHANGED_SUBJECT,
      });
    });

    it('CA-22: nueva vacía → `422 IDENTITY_WEAK_PASSWORD` sobre `newPassword`; la contraseña no cambia', async () => {
      const { account, browser } = await accountSignedIn();
      const before = await passwordHashOf(account.id);

      const response = await changePassword(browser.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: '',
      });

      expect(response.status).toBe(422);
      const body = errorResponseSchema.parse(response.body);
      expect(body.code).toBe('IDENTITY_WEAK_PASSWORD');
      expect(body.fields?.map((issue) => issue.field)).toContain('newPassword');
      expect(body.fields?.every((issue) => issue.field === 'newPassword')).toBe(true);
      expect(await passwordHashOf(account.id)).toBe(before);
    });

    it('CA-22: un rol interno cambia la suya y su sesión sigue abierta', async () => {
      const { account, browser } = await accountSignedIn({ role: 'SUPPORT' });

      await changePassword(browser.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);

      await refreshed(browser);
      expect(await loginStatus(account.email, NEW_PASSWORD)).toBe(200);
    });
  });

  describe('CA-23: contraseña actual incorrecta', () => {
    const wrongAttempt = (browser: Browser) =>
      changePassword(browser.accessToken, {
        currentPassword: WRONG_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

    it('CA-23: `422 IDENTITY_WRONG_PASSWORD` con `fields` sobre `currentPassword`; nada cambia', async () => {
      const { account } = await accountSignedIn();
      const other = await signInFrom(account.email, 'Chrome de prueba');
      const browser = await signInFrom(account.email, 'Safari de prueba');
      const hashBefore = await passwordHashOf(account.id);
      const sessionsBefore = await revokedAtBySession(account.id);

      const response = await wrongAttempt(browser);

      expect(response.status).toBe(422);
      const body = errorResponseSchema.parse(response.body);
      expect(body.code).toBe('IDENTITY_WRONG_PASSWORD');
      expect(body.fields).toEqual([
        expect.objectContaining({ field: 'currentPassword', reason: 'WRONG_PASSWORD' }),
      ]);
      expect(await passwordHashOf(account.id)).toBe(hashBefore);
      expect(await revokedAtBySession(account.id)).toEqual(sessionsBefore);
      await refreshed(other);
      await refreshed(browser);
    });

    it('CA-23: 5 fallos → el 6.º, incluso correcto, `429 PASSWORD_CHANGE_LOCKED` con `Retry-After`; a los 15 min vuelve a permitirse y la sesión nunca se cierra', async () => {
      const { account, browser } = await accountSignedIn();
      for (let attempt = 0; attempt < PASSWORD_CHANGE_MAX_FAILURES; attempt += 1) {
        await wrongAttempt(browser).expect(422);
      }

      const locked = await changePassword(browser.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

      expect(locked.status).toBe(429);
      expect(locked.headers['retry-after']).toBe(String(LOCK_SECONDS));
      const body = errorResponseSchema.parse(locked.body);
      expect(body.code).toBe('IDENTITY_PASSWORD_CHANGE_LOCKED');
      expect(body.message).toContain(`Espera ${String(PASSWORD_CHANGE_LOCK_MINUTES)} minutos`);
      const stillOpen = await refreshed(browser);
      expect((await revokedAtBySession(account.id))[browser.sessionId]).toBeNull();

      clock.advance(LOCK_SECONDS * MS_PER_SECOND);
      const later = await refreshed(stillOpen);

      await changePassword(later.accessToken, {
        currentPassword: ACCOUNT_PASSWORD,
        newPassword: NEW_PASSWORD,
      }).expect(204);
      await refreshed(later);
    });
  });
});

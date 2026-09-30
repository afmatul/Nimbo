import { randomUUID } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  errorResponseSchema,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  RESET_LINK_TTL_MINUTES,
} from '@nimbo/contracts';
import type { Redis } from 'ioredis';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK, REDIS_CLIENT } from '../../../src/shared';
import { deleteAll, listMessages } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import {
  ACCOUNT_PASSWORD,
  cookieHeader,
  FORGOT_PASSWORD_PATH,
  insertAccount,
  LOGIN_PATH,
  REFRESH_PATH,
  RESET_PASSWORD_CHECK_PATH,
  RESET_PASSWORD_PATH,
  setCookie,
} from './accounts';
import type { AccountOptions } from './accounts';
import {
  createIdentityTestApp,
  firstMessageTo,
  RESET_MAIL_SUBJECT,
  resetTokenSentTo,
  verificationTokenSentTo,
} from './identity-test-app';

/** Contraseña nueva que cumple la política de 001 y no se parece al correo de las cuentas de prueba. */
const NEW_PASSWORD = 'Otra-Clave-Segura-2026';
/** Otra contraseña válida, para comprobar que un enlace rechazado no la aplica. */
const REJECTED_PASSWORD = 'Tercera-Clave-Segura-2026';
const WRONG_PASSWORD = 'Clave-Incorrecta-2026';
const PASSWORD_CHANGED_SUBJECT = 'Tu contraseña de Nimbo cambió';
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const SECONDS_PER_HOUR = 3600;
const RESET_LINK_TTL_MS = RESET_LINK_TTL_MINUTES * MS_PER_MINUTE;
const COOLDOWN_MS = EMAIL_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND;

/** `status`, cuerpo y cabeceras salvo `date`; con el mismo `x-correlation-id` todo lo demás debe coincidir. */
const observe = (response: Response) => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/** `status` y `Retry-After` de una respuesta, para comparar secuencias de límites. */
const statusAndRetryAfter = (response: Response): string =>
  `${String(response.status)} ${String(response.headers['retry-after'] ?? '-')}`;

/**
 * Recuperación de contraseña de punta a punta (plan 002 §5, CA-18 a CA-21 y la segunda parte de CA-5). Cada prueba
 * usa una cuenta nueva, así los límites por correo y los correos de Mailpit (filtrados por destinatario) no se cruzan
 * entre pruebas. El reloj es un `FixedClock` que mueven las pruebas de límites y de vencimiento.
 */
describe('recuperación de contraseña (CA-18 a CA-21)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let redis: Redis;
  let nextIp = 0;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();
  const forgotPassword = (email: string) =>
    request(server()).post(FORGOT_PASSWORD_PATH).send({ email });
  const checkResetLink = (token: string) =>
    request(server()).post(RESET_PASSWORD_CHECK_PATH).send({ token });
  const resetPassword = (token: string, password: string, cookie?: string) => {
    const call = request(server()).post(RESET_PASSWORD_PATH).send({ token, password });
    return cookie === undefined ? call : call.set('Cookie', cookie);
  };

  /** Una IP por intento: el límite por IP del inicio de sesión (CA-6) no debe mezclarse con estas pruebas. */
  const login = (email: string, password: string, userAgent = 'Navegador de prueba') => {
    nextIp += 1;
    return request(server())
      .post(LOGIN_PATH)
      .set('X-Forwarded-For', `203.0.113.${String((nextIp % 250) + 1)}`)
      .set('User-Agent', userAgent)
      .send({ email, password });
  };

  const refresh = (refreshToken: string) =>
    request(server())
      .post(REFRESH_PATH)
      .set('Cookie', cookieHeader({ nimbo_rt: refreshToken }));

  /** Cuenta nueva que pide la recuperación (`202`); devuelve su id, su correo y el token del enlace del correo. */
  const requestedReset = async (
    options?: AccountOptions,
  ): Promise<{ id: string; email: string; token: string }> => {
    const { id, email } = await insertAccount(dataSource, options);
    await forgotPassword(email).expect(202);
    return { id, email, token: await resetTokenSentTo(email) };
  };

  const passwordHashOf = async (userId: string): Promise<string> => {
    const [row] = (await dataSource.query('SELECT hash_clave FROM usuario WHERE id = $1', [
      userId,
    ])) as { hash_clave: string }[];
    if (row === undefined) throw new Error('La cuenta de la prueba no existe.');
    return row.hash_clave;
  };

  const sessionsOf = (userId: string): Promise<{ id: string; revocada_en: Date | null }[]> =>
    dataSource.query(
      'SELECT id, revocada_en FROM sesion WHERE usuario_id = $1 ORDER BY creada_en, id',
      [userId],
    );

  const accountTokensOf = (
    userId: string,
  ): Promise<{ tipo: string; creado_en: Date; expira_en: Date }[]> =>
    dataSource.query(
      'SELECT tipo, creado_en, expira_en FROM token_cuenta WHERE usuario_id = $1 ORDER BY creado_en',
      [userId],
    );

  /** Se rechaza con `code` al abrirlo y al enviarlo, con la acción de pedir otro, y la contraseña no cambia. */
  const expectLinkRejected = async (
    token: string,
    userId: string,
    code: 'IDENTITY_RESET_LINK_EXPIRED' | 'IDENTITY_RESET_LINK_INVALID',
  ): Promise<void> => {
    const before = await passwordHashOf(userId);

    const checked = await checkResetLink(token);
    const submitted = await resetPassword(token, REJECTED_PASSWORD);

    for (const response of [checked, submitted]) {
      expect(response.status).toBe(422);
      const body = errorResponseSchema.parse(response.body);
      expect(body.code).toBe(code);
      expect(body.message.toLowerCase()).toContain('pide uno nuevo');
    }
    expect(setCookie(submitted.headers, 'nimbo_rt')).toBeUndefined();
    expect(await passwordHashOf(userId)).toBe(before);
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    redis = testApp.app.get<Redis>(REDIS_CLIENT);
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
      await expect(resetTokenSentTo(email)).resolves.toMatch(LINK_TOKEN);
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
      await login(email, ACCOUNT_PASSWORD).expect(401);
      await login(email, NEW_PASSWORD).expect(200);
    });
  });

  describe('CA-18: pedir el enlace sin enumeración', () => {
    it('CA-18: las cuatro clases de cuenta reciben la misma respuesta; el enlace de 1 h solo llega a la verificada y a la interna, y la no verificada recibe uno de verificación (D-15)', async () => {
      const verified = await insertAccount(dataSource);
      const unverified = await insertAccount(dataSource, { verified: false });
      const internal = await insertAccount(dataSource, { role: 'SUPPORT' });
      const nobody = `nadie-${randomUUID()}@nimbo.me`;
      const correlationId = `forgot-${randomUUID()}`;
      const ask = async (email: string) =>
        observe(
          await request(server())
            .post(FORGOT_PASSWORD_PATH)
            .set('X-Correlation-Id', correlationId)
            .send({ email }),
        );

      // La inexistente va primero: si le tocara un correo, llegaría antes que los de las otras tres.
      const missing = await ask(nobody);
      const others = [
        await ask(verified.email),
        await ask(unverified.email),
        await ask(internal.email),
      ];

      expect(missing.status).toBe(202);
      expect(missing.body).toEqual({ status: 'accepted' });
      for (const response of others) expect(response).toEqual(missing);
      await expect(resetTokenSentTo(verified.email)).resolves.toMatch(LINK_TOKEN);
      await expect(resetTokenSentTo(internal.email)).resolves.toMatch(LINK_TOKEN);
      await expect(verificationTokenSentTo(unverified.email)).resolves.toMatch(LINK_TOKEN);
      const inbox = await listMessages();
      const sentTo = (email: string) =>
        inbox.filter((message) => message.To.some((recipient) => recipient.Address === email));
      expect(sentTo(nobody)).toEqual([]);
      expect(
        sentTo(unverified.email).filter((message) => message.Subject === RESET_MAIL_SUBJECT),
      ).toEqual([]);
      for (const account of [verified, internal]) {
        const tokens = await accountTokensOf(account.id);
        expect(tokens.map((token) => token.tipo)).toEqual(['recuperacion']);
        const [token] = tokens;
        expect((token?.expira_en.getTime() ?? 0) - (token?.creado_en.getTime() ?? 0)).toBe(
          RESET_LINK_TTL_MS,
        );
      }
      expect((await accountTokensOf(unverified.id)).map((token) => token.tipo)).toEqual([
        'verificacion',
      ]);
    });

    it('CA-18: 60 s y 5 por hora se aplican igual exista o no la cuenta, con `429 IDENTITY_TOO_MANY_REQUESTS` y `Retry-After`', async () => {
      const account = await insertAccount(dataSource);
      const nobody = `nadie-${randomUUID()}@nimbo.me`;
      /** Pide, repite dentro de los 60 s y luego pide una vez por minuto hasta pasar las 5 de la hora. */
      const limitSequence = async (email: string): Promise<{ steps: string[]; last: Response }> => {
        const steps = [statusAndRetryAfter(await forgotPassword(email))];
        steps.push(statusAndRetryAfter(await forgotPassword(email)));
        for (let sent = 1; sent < EMAIL_REQUESTS_PER_HOUR; sent += 1) {
          clock.advance(COOLDOWN_MS);
          steps.push(statusAndRetryAfter(await forgotPassword(email)));
        }
        clock.advance(COOLDOWN_MS);
        const last = await forgotPassword(email);
        steps.push(statusAndRetryAfter(last));
        return { steps, last };
      };
      const hourlyRetryAfter =
        SECONDS_PER_HOUR - EMAIL_REQUESTS_PER_HOUR * EMAIL_REQUEST_COOLDOWN_SECONDS;
      const expected = [
        '202 -',
        `429 ${String(EMAIL_REQUEST_COOLDOWN_SECONDS)}`,
        ...Array.from({ length: EMAIL_REQUESTS_PER_HOUR - 1 }, () => '202 -'),
        `429 ${String(hourlyRetryAfter)}`,
      ];

      const existing = await limitSequence(account.email);
      const missing = await limitSequence(nobody);

      expect(existing.steps).toEqual(expected);
      expect(missing.steps).toEqual(expected);
      for (const { last } of [existing, missing]) {
        const body = errorResponseSchema.parse(last.body);
        expect(body.code).toBe('IDENTITY_TOO_MANY_REQUESTS');
        expect(body.message).toContain('inténtalo de nuevo en');
      }
      expect(await accountTokensOf(account.id)).toHaveLength(EMAIL_REQUESTS_PER_HOUR);
    });
  });

  describe('CA-19 y CA-5: restablecer', () => {
    it('CA-19: revoca las sesiones de los dos navegadores (su refresco falla), no crea sesión, borra `nimbo_rt` y envía «Tu contraseña cambió»', async () => {
      const account = await insertAccount(dataSource);
      const browsers: string[] = [];
      for (const userAgent of ['Firefox de prueba', 'Chrome de prueba']) {
        const response = await login(account.email, ACCOUNT_PASSWORD, userAgent).expect(200);
        browsers.push(setCookie(response.headers, 'nimbo_rt')?.value ?? '');
      }
      await forgotPassword(account.email).expect(202);
      const token = await resetTokenSentTo(account.email);
      const sessionsBefore = await sessionsOf(account.id);

      const response = await resetPassword(
        token,
        NEW_PASSWORD,
        cookieHeader({ nimbo_rt: browsers[0] ?? '' }),
      );

      expect(response.status).toBe(200);
      expect(setCookie(response.headers, 'nimbo_rt')?.value).toBe('');
      const sessionsAfter = await sessionsOf(account.id);
      expect(sessionsBefore).toHaveLength(2);
      expect(sessionsAfter.map((session) => session.id)).toEqual(
        sessionsBefore.map((session) => session.id),
      );
      expect(sessionsAfter.map((session) => session.revocada_en)).toEqual([
        clock.now(),
        clock.now(),
      ]);
      for (const refreshToken of browsers) {
        const refreshed = await refresh(refreshToken);
        expect(refreshed.status).toBe(401);
        expect(errorResponseSchema.parse(refreshed.body).code).toBe('IDENTITY_SESSION_REVOKED');
      }
      await expect(firstMessageTo(account.email, PASSWORD_CHANGED_SUBJECT)).resolves.toMatchObject({
        Subject: PASSWORD_CHANGED_SUBJECT,
      });
    });

    it('CA-5: restablecer quita al momento el bloqueo del inicio de sesión (y el del cambio de contraseña, DT-5)', async () => {
      const account = await insertAccount(dataSource);
      for (let attempt = 0; attempt < LOGIN_MAX_FAILURES; attempt += 1) {
        await login(account.email, WRONG_PASSWORD).expect(401);
      }
      const locked = await login(account.email, ACCOUNT_PASSWORD);
      expect(errorResponseSchema.parse(locked.body).code).toBe('IDENTITY_LOGIN_LOCKED');
      const changeLock = `identity:lockout:password-change:${account.id}:lock`;
      await redis.set(
        changeLock,
        String(clock.now().getTime() + LOGIN_LOCK_MINUTES * MS_PER_MINUTE),
      );
      await forgotPassword(account.email).expect(202);
      const token = await resetTokenSentTo(account.email);

      await resetPassword(token, NEW_PASSWORD).expect(200);

      await login(account.email, NEW_PASSWORD).expect(200);
      expect(await redis.exists(changeLock)).toBe(0);
    });
  });

  describe('CA-21: contraseña débil al restablecer', () => {
    it.each([
      ['corta y sin requisitos', (): string => 'corta', 'PASSWORD_TOO_SHORT'],
      ['igual al correo', (email: string): string => email.toUpperCase(), 'PASSWORD_EQUALS_EMAIL'],
      [
        'igual a la parte local del correo',
        (email: string): string => (email.split('@')[0] ?? '').toUpperCase(),
        'PASSWORD_EQUALS_EMAIL',
      ],
    ])(
      'CA-21: %s → `422 IDENTITY_WEAK_PASSWORD` con `fields`, la contraseña no cambia y el mismo enlace sirve después',
      async (_case, weakPasswordFor, reason) => {
        const { id, email, token } = await requestedReset();
        const before = await passwordHashOf(id);

        const response = await resetPassword(token, weakPasswordFor(email));

        expect(response.status).toBe(422);
        const body = errorResponseSchema.parse(response.body);
        expect(body.code).toBe('IDENTITY_WEAK_PASSWORD');
        expect(body.fields?.length).toBeGreaterThan(0);
        expect(body.fields?.every((issue) => issue.field === 'password')).toBe(true);
        expect(body.fields?.map((issue) => issue.reason)).toContain(reason);
        expect(await passwordHashOf(id)).toBe(before);
        await checkResetLink(token).expect(200);
        await resetPassword(token, NEW_PASSWORD).expect(200);
        await login(email, NEW_PASSWORD).expect(200);
      },
    );
  });

  describe('CA-20: enlace vencido, usado, reemplazado o inválido', () => {
    it('CA-20: con 1 h y 1 s → `IDENTITY_RESET_LINK_EXPIRED` al abrirlo y al enviarlo; la contraseña no cambia', async () => {
      const { id, token } = await requestedReset();

      clock.advance(RESET_LINK_TTL_MS + MS_PER_SECOND);

      await expectLinkRejected(token, id, 'IDENTITY_RESET_LINK_EXPIRED');
    });

    it('CA-20: a 1 s de cumplir la hora el enlace todavía sirve', async () => {
      const { token } = await requestedReset();

      clock.advance(RESET_LINK_TTL_MS - MS_PER_SECOND);

      await checkResetLink(token).expect(200);
      await resetPassword(token, NEW_PASSWORD).expect(200);
    });

    it('CA-20: ya usado → `IDENTITY_RESET_LINK_INVALID`; la contraseña del primer uso se mantiene', async () => {
      const { id, email, token } = await requestedReset();
      await resetPassword(token, NEW_PASSWORD).expect(200);

      await expectLinkRejected(token, id, 'IDENTITY_RESET_LINK_INVALID');

      await login(email, NEW_PASSWORD).expect(200);
    });

    it('CA-20: reemplazado por uno más reciente → `IDENTITY_RESET_LINK_INVALID`; el nuevo sigue sirviendo', async () => {
      const { id, email, token: replaced } = await requestedReset();
      await deleteAll();
      clock.advance(COOLDOWN_MS);
      await forgotPassword(email).expect(202);
      const latest = await resetTokenSentTo(email);
      expect(latest).not.toBe(replaced);

      await expectLinkRejected(replaced, id, 'IDENTITY_RESET_LINK_INVALID');

      await checkResetLink(latest).expect(200);
    });

    it('CA-20: alterado → `IDENTITY_RESET_LINK_INVALID`; el original sigue sirviendo', async () => {
      const { id, token } = await requestedReset();
      const altered = `${token.startsWith('A') ? 'B' : 'A'}${token.slice(1)}`;

      await expectLinkRejected(altered, id, 'IDENTITY_RESET_LINK_INVALID');

      await checkResetLink(token).expect(200);
    });

    it.each([
      ['demasiado corto', (token: string): string => token.slice(0, 10)],
      ['con un carácter de más', (token: string): string => `${token}A`],
      ['con un carácter fuera de base64url', (token: string): string => `${token.slice(0, 42)}+`],
    ])(
      'CA-20: mal formado (%s) → `IDENTITY_RESET_LINK_INVALID`; la contraseña no cambia',
      async (_case, malform) => {
        const { id, token } = await requestedReset();

        await expectLinkRejected(malform(token), id, 'IDENTITY_RESET_LINK_INVALID');
      },
    );

    it('CA-20: un enlace de verificación (tipo `verificacion`) → `IDENTITY_RESET_LINK_INVALID`; la contraseña no cambia', async () => {
      const { id, email } = await insertAccount(dataSource, { verified: false });
      await forgotPassword(email).expect(202);
      const verificationToken = await verificationTokenSentTo(email);

      await expectLinkRejected(verificationToken, id, 'IDENTITY_RESET_LINK_INVALID');
    });
  });
});

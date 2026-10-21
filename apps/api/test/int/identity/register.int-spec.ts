import { randomUUID } from 'node:crypto';

import {
  acceptedResponseSchema,
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  errorResponseSchema,
  LEGAL_DOCUMENTS,
  VERIFICATION_LINK_TTL_HOURS,
} from '@nimbo/contracts';
import { verify } from 'argon2';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK, I_RATE_LIMITER } from '../../../src/shared';
import type { IRateLimiter } from '../../../src/shared';
import { uniqueEmployeeCode } from '../../support/employee-codes';
import { deleteAll, getMessage, listMessages } from '../setup/mailpit';
import type { MailpitMessage } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp, validRegistration } from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 3_600_000;
/** Un segundo más que la espera entre solicitudes por correo (D-8). */
const AFTER_COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * MS_PER_SECOND;
const LINK_TTL_MS = VERIFICATION_LINK_TTL_HOURS * MS_PER_HOUR;
const VERIFICATION_TAG = 'identity.verification';
const ATTEMPT_NOTICE_TAG = 'identity.attempt-notice';
const ATTEMPT_NOTICE_SUBJECT = 'Alguien intentó crear una cuenta con tu correo';
const LINK_TOKEN = /\/verificar-correo#token=([A-Za-z0-9_-]{43})/;
/** PHC de Argon2id fijo para las cuentas insertadas a mano (no se verifica contra él). */
const MANUAL_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$bWFudWFs';
const MAIL_WAIT_STEP_MS = 100;
const MAIL_WAIT_MS = 10_000;
/** Cabeceras que cambian en cada respuesta aunque sea la misma respuesta neutra (spec §7). */
const VOLATILE_HEADERS = new Set([CORRELATION_ID_HEADER, 'date']);

interface UserRow {
  id: string;
  nombre: string;
  correo: string;
  hash_clave: string;
  rol: string;
  estado: string;
  correo_verificado: boolean;
  version_terminos: string | null;
  version_privacidad: string | null;
  terminos_aceptados_en: Date | null;
}

interface TokenRow {
  expira_en: Date;
  creado_en: Date;
}

const uniqueEmail = (local = 'ana'): string => `${local}-${randomUUID()}@ejemplo.com`;

/**
 * Cada registro sale de una IP distinta (`trust proxy` de un salto): así el límite por IP de CA-15, que cubre
 * `rate-limits.int-spec.ts`, no interfiere con los criterios de esta suite.
 */
let requestCount = 0;
const nextClientIp = (): string => {
  requestCount += 1;
  return `10.0.${String(Math.floor(requestCount / 250))}.${String((requestCount % 250) + 1)}`;
};

const tokenIn = (message: MailpitMessage): string => {
  const token = LINK_TOKEN.exec(message.Text)?.[1];
  if (token === undefined) throw new Error('El correo no trae el enlace de verificación.');
  return token;
};

/** Espera `count` correos dirigidos a `email` y los devuelve completos. */
const waitForMessagesTo = async (email: string, count: number): Promise<MailpitMessage[]> => {
  const deadline = Date.now() + MAIL_WAIT_MS;
  for (;;) {
    const summaries = (await listMessages()).filter((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
    if (summaries.length >= count) {
      return Promise.all(summaries.map((summary) => getMessage(summary.ID)));
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Llegaron ${String(summaries.length)} correos; se esperaban ${String(count)}.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, MAIL_WAIT_STEP_MS));
  }
};

/** Estado, cuerpo y cabeceras salvo las que cambian en cada respuesta: lo que la respuesta neutra fija. */
const neutralView = (response: Response): unknown => ({
  status: response.status,
  body: response.body as unknown,
  headers: Object.fromEntries(
    Object.entries(response.headers).filter(([name]) => !VOLATILE_HEADERS.has(name)),
  ),
});

/**
 * `POST /auth/register` de punta a punta (plan §5, §6.3): CA-1 a CA-4. El reloj es un `FixedClock` compartido por la
 * suite y solo avanza; cada prueba usa correos propios, así los límites por correo de Redis no se cruzan.
 */
describe('POST /auth/register (CA-1 a CA-4)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
  });

  const register = (body: object): Promise<Response> =>
    request(testApp.app.getHttpServer())
      .post(REGISTER)
      .set('X-Forwarded-For', nextClientIp())
      .send(body);

  const verifyEmail = (token: string): Promise<Response> =>
    request(testApp.app.getHttpServer()).post(VERIFY_EMAIL).send({ token });

  /** `tag` de cada correo que encoló la petición: la bitácora `mail.enqueued` se escribe antes de responder. */
  const mailTagsEnqueuedBy = (response: Response): unknown[] =>
    testApp.logs
      .withCorrelationId(String(response.headers[CORRELATION_ID_HEADER]))
      .filter((line) => line.event === 'mail.enqueued')
      .map((line) => line.tag);

  const eventsOf = (response: Response): unknown[] =>
    testApp.logs
      .withCorrelationId(String(response.headers[CORRELATION_ID_HEADER]))
      .map((line) => line.event);

  const usersWithEmail = async (email: string): Promise<UserRow[]> =>
    (await dataSource.query(
      `SELECT id, nombre, correo, hash_clave, rol, estado, correo_verificado, version_terminos,
              version_privacidad, terminos_aceptados_en
         FROM usuario WHERE correo = $1`,
      [email],
    )) as UserRow[];

  const userWithEmail = async (email: string): Promise<UserRow> => {
    const [user, ...others] = await usersWithEmail(email);
    if (user === undefined || others.length > 0) {
      throw new Error('Se esperaba exactamente una cuenta con ese correo.');
    }
    return user;
  };

  const activeTokensOf = async (userId: string): Promise<TokenRow[]> =>
    (await dataSource.query(
      `SELECT expira_en, creado_en FROM token_cuenta
        WHERE usuario_id = $1 AND tipo = 'verificacion' AND usado_en IS NULL AND invalidado_en IS NULL`,
      [userId],
    )) as TokenRow[];

  const tokenCountOf = async (userId: string): Promise<number> => {
    const [row] = (await dataSource.query(
      'SELECT count(*)::int AS total FROM token_cuenta WHERE usuario_id = $1',
      [userId],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  /** Cuenta insertada a mano: cliente verificado (con aceptación anterior) o interna (sin aceptación), CA-2. */
  const insertAccount = async (kind: 'verified-client' | 'internal'): Promise<UserRow> => {
    const email = uniqueEmail(kind);
    const isClient = kind === 'verified-client';
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                            version_privacidad, terminos_aceptados_en, codigo_empleado)
       VALUES ($1, 'Ana Existente', $2, $3, $4, $5, $6, $6, $7, $8)`,
      [
        randomUUID(),
        email,
        MANUAL_PHC,
        isClient ? 'CLIENT' : 'SUPPORT',
        isClient,
        isClient ? '0.9' : null,
        isClient ? new Date('2026-01-15T10:00:00.000Z') : null,
        isClient ? null : uniqueEmployeeCode(),
      ],
    );
    return userWithEmail(email);
  };

  describe('CA-1: registro válido', () => {
    it('CA-1: responde `202 accepted` sin caché ni cookies y crea un Cliente activo, sin verificar, con el correo normalizado y la aceptación vigente', async () => {
      const email = uniqueEmail();
      const password = 'Nimbo-Seguro-2026';

      const response = await register({
        ...validRegistration(`  ${email.toUpperCase()} `),
        fullName: '  Lucía Pérez ',
        password,
      });

      expect(response.status).toBe(202);
      expect(acceptedResponseSchema.parse(response.body)).toEqual({ status: 'accepted' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['set-cookie']).toBeUndefined();
      const user = await userWithEmail(email);
      expect(user).toMatchObject({
        nombre: 'Lucía Pérez',
        correo: email,
        rol: 'CLIENT',
        estado: 'activa',
        correo_verificado: false,
        version_terminos: LEGAL_DOCUMENTS.terms.version,
        version_privacidad: LEGAL_DOCUMENTS.privacy.version,
        terminos_aceptados_en: clock.now(),
      });
      expect(user.hash_clave.startsWith('$argon2id$')).toBe(true);
      expect(await verify(user.hash_clave, password)).toBe(true);
    });

    it('CA-1: emite un token vigente que vence 24 h después y envía un solo correo con el enlace de `web` y sin la contraseña', async () => {
      const email = uniqueEmail();
      const password = 'Nimbo-Seguro-2026';

      const response = await register({ ...validRegistration(email), password });

      expect(response.status).toBe(202);
      const user = await userWithEmail(email);
      expect(await activeTokensOf(user.id)).toEqual([
        { creado_en: clock.now(), expira_en: new Date(clock.now().getTime() + LINK_TTL_MS) },
      ]);
      expect(mailTagsEnqueuedBy(response)).toEqual([VERIFICATION_TAG]);
      const [message] = await waitForMessagesTo(email, 1);
      expect(message?.To.map((recipient) => recipient.Address)).toEqual([email]);
      expect(message?.Text).toContain(`${testApp.env.WEB_PUBLIC_URL}/verificar-correo#token=`);
      expect(message?.Text).toContain('24 horas');
      expect(message?.Text).not.toContain(password);
      expect(message?.HTML).not.toContain(password);
    });
  });

  describe('CA-2: correo de una cuenta verificada o interna', () => {
    it.each(['verified-client', 'internal'] as const)(
      'CA-2: con una cuenta %s responde lo mismo que CA-1, no cambia la cuenta, no emite enlace y avisa una sola vez en 24 h',
      async (kind) => {
        const existing = await insertAccount(kind);
        const fresh = await register(validRegistration(uniqueEmail('nueva')));

        const attempt = await register({
          ...validRegistration(existing.correo),
          fullName: 'Otra Persona',
          password: 'Otra-Clave-Segura-2026',
        });

        expect(neutralView(attempt)).toEqual(neutralView(fresh));
        expect(await usersWithEmail(existing.correo)).toEqual([existing]);
        expect(await tokenCountOf(existing.id)).toBe(0);
        expect(mailTagsEnqueuedBy(attempt)).toEqual([ATTEMPT_NOTICE_TAG]);
        const [notice] = await waitForMessagesTo(existing.correo, 1);
        expect(notice?.Subject).toBe(ATTEMPT_NOTICE_SUBJECT);

        clock.advance(AFTER_COOLDOWN_MS);
        const repeated = await register(validRegistration(existing.correo));
        clock.advance(23 * MS_PER_HOUR);
        const nextDay = await register(validRegistration(existing.correo));

        for (const response of [repeated, nextDay]) {
          expect(neutralView(response)).toEqual(neutralView(fresh));
          expect(mailTagsEnqueuedBy(response)).toEqual([]);
          expect(eventsOf(response)).toContain('identity.registration.attempt_notice_suppressed');
        }
        expect(await usersWithEmail(existing.correo)).toEqual([existing]);
        expect(await waitForMessagesTo(existing.correo, 1)).toHaveLength(1);
      },
    );
  });

  describe('CA-3: variantes del mismo correo', () => {
    it('CA-3: `  Ana@Ejemplo.COM ` es la misma cuenta: se reemplaza la pendiente y no se crea otra', async () => {
      const email = uniqueEmail();
      await register({ ...validRegistration(email), fullName: 'Ana Uno' });
      clock.advance(AFTER_COOLDOWN_MS);

      const response = await register({
        ...validRegistration(`  ${email.toUpperCase()} `),
        fullName: 'Ana Dos',
      });

      expect(response.status).toBe(202);
      expect(await usersWithEmail(email)).toEqual([
        expect.objectContaining({ correo: email, nombre: 'Ana Dos' }),
      ]);
    });

    it('CA-3: `ana.b@…` y `ana+nimbo@…` son cuentas distintas de `ana@…` (sin reglas por proveedor)', async () => {
      const suffix = randomUUID();
      const emails = [
        `ana${suffix}@ejemplo.com`,
        `ana.b${suffix}@ejemplo.com`,
        `ana${suffix}+nimbo@ejemplo.com`,
      ];

      for (const email of emails) {
        expect((await register(validRegistration(email))).status).toBe(202);
      }

      const ids = await Promise.all(emails.map(async (email) => (await userWithEmail(email)).id));
      expect(new Set(ids).size).toBe(emails.length);
      for (const email of emails) {
        expect(await waitForMessagesTo(email, 1)).toHaveLength(1);
      }
    });
  });

  describe('CA-4: correo registrado sin verificar', () => {
    it('CA-4: pasados 60 s reemplaza nombre, contraseña y aceptación, invalida el enlace anterior y envía uno nuevo de 24 h', async () => {
      const email = uniqueEmail();
      const firstPassword = 'Primera-Clave-2026';
      const secondPassword = 'Segunda-Clave-2026';
      await register({ ...validRegistration(email), fullName: 'Ana Uno', password: firstPassword });
      const [firstMessage] = await waitForMessagesTo(email, 1);
      const oldToken = tokenIn(firstMessage as MailpitMessage);
      clock.advance(AFTER_COOLDOWN_MS);

      const response = await register({
        ...validRegistration(email),
        fullName: 'Ana Dos',
        password: secondPassword,
      });

      expect(response.status).toBe(202);
      expect(acceptedResponseSchema.parse(response.body)).toEqual({ status: 'accepted' });
      const user = await userWithEmail(email);
      expect(user).toMatchObject({
        nombre: 'Ana Dos',
        correo_verificado: false,
        terminos_aceptados_en: clock.now(),
      });
      expect(await verify(user.hash_clave, secondPassword)).toBe(true);
      expect(await verify(user.hash_clave, firstPassword)).toBe(false);
      expect(await activeTokensOf(user.id)).toEqual([
        { creado_en: clock.now(), expira_en: new Date(clock.now().getTime() + LINK_TTL_MS) },
      ]);
      expect(mailTagsEnqueuedBy(response)).toEqual([VERIFICATION_TAG]);
      const tokens = (await waitForMessagesTo(email, 2)).map(tokenIn);
      expect(tokens).toContain(oldToken);
      expect(tokens.filter((token) => token !== oldToken)).toHaveLength(1);

      const oldLink = await verifyEmail(oldToken);

      expect(oldLink.status).toBe(422);
      expect(errorResponseSchema.parse(oldLink.body)).toMatchObject({
        code: 'IDENTITY_VERIFICATION_LINK_INVALID',
      });
    });

    it('CA-4: antes de 60 s responde `429` con `Retry-After` y la cuenta no cambia', async () => {
      const email = uniqueEmail();
      await register({ ...validRegistration(email), fullName: 'Ana Uno' });
      const before = await userWithEmail(email);
      const tokensBefore = await activeTokensOf(before.id);
      clock.advance(AFTER_COOLDOWN_MS / 2);

      const response = await register({
        ...validRegistration(email),
        fullName: 'Ana Dos',
        password: 'Segunda-Clave-2026',
      });

      expect(response.status).toBe(429);
      expect(errorResponseSchema.parse(response.body)).toMatchObject({
        code: 'IDENTITY_TOO_MANY_REQUESTS',
      });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(await usersWithEmail(email)).toEqual([before]);
      expect(await activeTokensOf(before.id)).toEqual(tokensBefore);
      expect(mailTagsEnqueuedBy(response)).toEqual([]);
    });
  });
});

/**
 * CA-3, concurrencia: el límite por correo (60 s) ya serializa dos registros del mismo correo, así que aquí se
 * sustituye por uno que siempre permite para que las peticiones lleguen juntas a la base de datos, que es quien
 * debe impedir la segunda cuenta (`uq_usuario_correo` y relectura del perdedor, plan §6.3).
 */
describe('POST /auth/register concurrente (CA-3)', () => {
  const alwaysAllow: IRateLimiter = { consume: () => Promise.resolve({ allowed: true }) };
  const CONCURRENT_REQUESTS = 5;
  let testApp: TestApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await createIdentityTestApp({
      overrides: [{ provide: I_RATE_LIMITER, useValue: alwaysAllow }],
    });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-3: varios registros simultáneos del mismo correo (con variantes de mayúsculas y espacios) dejan una sola cuenta', async () => {
    const email = uniqueEmail();
    const variants = Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
      index % 2 === 0 ? email : `  ${email.toUpperCase()} `,
    );

    const responses = await Promise.all(
      variants.map((variant) =>
        request(testApp.app.getHttpServer())
          .post(REGISTER)
          .set('X-Forwarded-For', nextClientIp())
          .send(validRegistration(variant)),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(variants.map(() => 202));
    const rows = (await dataSource.query('SELECT id FROM usuario WHERE correo = $1', [email])) as {
      id: string;
    }[];
    expect(rows).toHaveLength(1);
  });
});

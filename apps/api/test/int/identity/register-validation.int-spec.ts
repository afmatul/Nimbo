import { randomUUID } from 'node:crypto';

import { errorResponseSchema, IDENTITY_FIELD_MESSAGES, LEGAL_DOCUMENTS } from '@nimbo/contracts';
import type { ErrorResponse, FieldIssueReason } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp, validRegistration } from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const TRAILING_PERIOD = /\.$/;
/**
 * Cabeceras que cambian en cada respuesta: `x-correlation-id` y `date`, y la `etag` que Express calcula sobre un
 * cuerpo que incluye el `correlationId`. Lo demás debe ser idéntico (spec §7).
 */
const VOLATILE_HEADERS = new Set([CORRELATION_ID_HEADER, 'date', 'etag']);

interface UserRow {
  rol: string;
  correo_verificado: boolean;
  version_terminos: string | null;
  version_privacidad: string | null;
}

const uniqueEmail = (local = 'ana'): string => `${local}-${randomUUID()}@ejemplo.com`;

/** Cada petición sale de una IP distinta: el límite por IP (CA-15) no interfiere con la validación. */
let requestCount = 0;
const nextClientIp = (): string => {
  requestCount += 1;
  return `10.1.${String(Math.floor(requestCount / 250))}.${String((requestCount % 250) + 1)}`;
};

const errorBody = (response: Response): ErrorResponse => errorResponseSchema.parse(response.body);

const reasonsOf = (response: Response): { field: string; reason: string }[] =>
  (errorBody(response).fields ?? []).map(({ field, reason }) => ({ field, reason }));

/** La respuesta sin lo que cambia en cada petición: sirve para comprobar que no revela si el correo existe. */
const comparableView = (response: Response): unknown => {
  const { correlationId: _correlationId, ...body } = errorBody(response);
  return {
    status: response.status,
    body,
    headers: Object.fromEntries(
      Object.entries(response.headers).filter(([name]) => !VOLATILE_HEADERS.has(name)),
    ),
  };
};

/** Una contraseña por regla de D-6 que incumple **solo** esa regla (CA-5). */
const WEAK_PASSWORDS: readonly [FieldIssueReason, string][] = [
  ['PASSWORD_TOO_SHORT', 'Nimbo-2026'],
  ['PASSWORD_TOO_LONG', `Aa1!${'x'.repeat(1030)}`],
  ['PASSWORD_MISSING_UPPERCASE', 'nimbo-seguro-2026'],
  ['PASSWORD_MISSING_NUMBER', 'Nimbo-Seguro-Dos'],
  ['PASSWORD_MISSING_SYMBOL', 'NimboSeguro2026'],
  ['PASSWORD_COMMON', 'Password@123'],
];

/** Campos que el registro no declara y deben rechazarse (CA-7). */
const UNDECLARED_FIELDS: readonly [string, unknown][] = [
  ['rol', 'ADMIN'],
  ['role', 'ADMIN'],
  ['correoVerificado', true],
  ['estado', 'activa'],
  ['version', '0.1'],
  ['plan', 'pro'],
  ['planId', randomUUID()],
];

/** Validación de `POST /auth/register` de punta a punta (plan §5): CA-5, CA-6 y CA-7. */
describe('POST /auth/register: validación (CA-5, CA-6, CA-7)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  const register = (body: object, headers: Record<string, string> = {}): Promise<Response> =>
    request(testApp.app.getHttpServer())
      .post(REGISTER)
      .set({ 'X-Forwarded-For': nextClientIp(), ...headers })
      .send(body);

  const usersWithEmail = async (email: string): Promise<UserRow[]> =>
    (await dataSource.query(
      `SELECT rol, correo_verificado, version_terminos, version_privacidad
         FROM usuario WHERE correo = $1`,
      [email.trim().toLowerCase()],
    )) as UserRow[];

  /** Ningún efecto: ni cuenta, ni token (no hay cuenta a la cual colgarlo), ni correo encolado por la petición. */
  const expectNoEffects = async (response: Response, email: string): Promise<void> => {
    expect(await usersWithEmail(email)).toEqual([]);
    const enqueued = testApp.logs
      .withCorrelationId(String(response.headers[CORRELATION_ID_HEADER]))
      .filter((line) => line.event === 'mail.enqueued');
    expect(enqueued).toEqual([]);
  };

  describe('CA-5: contraseña débil', () => {
    it.each(WEAK_PASSWORDS)(
      'CA-5: `%s` responde `IDENTITY_WEAK_PASSWORD` con esa regla y sin efectos',
      async (reason, password) => {
        const email = uniqueEmail();

        const response = await register({ ...validRegistration(email), password });

        expect(response.status).toBe(422);
        expect(errorBody(response).code).toBe('IDENTITY_WEAK_PASSWORD');
        expect(reasonsOf(response)).toEqual([{ field: 'password', reason }]);
        expect(errorBody(response).message).toContain(
          IDENTITY_FIELD_MESSAGES[reason].replace(TRAILING_PERIOD, ''),
        );
        expect(response.headers['cache-control']).toBe('no-store');
        await expectNoEffects(response, email);
      },
    );

    it.each([
      ['el correo completo', (email: string): string => email],
      ['la parte local del correo', (email: string): string => email.slice(0, email.indexOf('@'))],
    ])(
      'CA-5: una contraseña igual a %s responde `PASSWORD_EQUALS_EMAIL`',
      async (_case, passwordFrom) => {
        const email = `Ana-Segura-2026-${randomUUID()}@ejemplo.com`;

        const response = await register({
          ...validRegistration(email),
          password: passwordFrom(email),
        });

        expect(response.status).toBe(422);
        expect(errorBody(response).code).toBe('IDENTITY_WEAK_PASSWORD');
        expect(reasonsOf(response)).toEqual([
          { field: 'password', reason: 'PASSWORD_EQUALS_EMAIL' },
        ]);
        await expectNoEffects(response, email);
      },
    );

    it('CA-5: con un correo que ya tiene cuenta la respuesta es idéntica (salvo la correlación)', async () => {
      const existing = uniqueEmail('existente');
      expect((await register(validRegistration(existing))).status).toBe(202);
      const weak = { password: 'Nimbo-2026' };

      const withExisting = await register({ ...validRegistration(existing), ...weak });
      const withNew = await register({ ...validRegistration(uniqueEmail('nueva')), ...weak });

      expect(withExisting.status).toBe(422);
      expect(comparableView(withExisting)).toEqual(comparableView(withNew));
    });
  });

  describe('CA-6: datos inválidos', () => {
    it.each([
      ['correo mal formado', { email: 'no-es-un-correo' }, 'email', 'INVALID_EMAIL'],
      ['nombre vacío', { fullName: '   ' }, 'fullName', 'REQUIRED'],
      ['nombre de 101 caracteres', { fullName: 'a'.repeat(101) }, 'fullName', 'TOO_LONG'],
      ['casilla sin marcar', { acceptTerms: false }, 'acceptTerms', 'TERMS_NOT_ACCEPTED'],
    ] as const)(
      'CA-6: %s responde `IDENTITY_INVALID_INPUT` con el campo y su motivo, sin efectos',
      async (_case, change, field, reason) => {
        const email = uniqueEmail();

        const response = await register({ ...validRegistration(email), ...change });

        expect(response.status).toBe(422);
        expect(errorBody(response).code).toBe('IDENTITY_INVALID_INPUT');
        expect(errorBody(response).fields).toEqual([
          { field, reason, message: IDENTITY_FIELD_MESSAGES[reason] },
        ]);
        expect(response.headers['cache-control']).toBe('no-store');
        await expectNoEffects(response, email);
      },
    );

    it('CA-6: la casilla sin marcar lleva el mensaje de la spec', async () => {
      const response = await register({ ...validRegistration(uniqueEmail()), acceptTerms: false });

      expect(errorBody(response).fields?.[0]?.message).toBe(
        'Para crear tu cuenta, acepta los Términos y la Política de privacidad.',
      );
    });

    it.each([
      ['fullName', 'REQUIRED'],
      ['email', 'REQUIRED'],
      ['password', 'REQUIRED'],
      ['acceptTerms', 'TERMS_NOT_ACCEPTED'],
    ] as const)(
      'CA-6: sin `%s` responde `IDENTITY_INVALID_INPUT` con `%s`, sin efectos',
      async (missing, reason) => {
        const email = uniqueEmail();
        const body = Object.fromEntries(
          Object.entries(validRegistration(email)).filter(([key]) => key !== missing),
        );

        const response = await register(body);

        expect(response.status).toBe(422);
        expect(errorBody(response).code).toBe('IDENTITY_INVALID_INPUT');
        expect(reasonsOf(response)).toEqual([{ field: missing, reason }]);
        await expectNoEffects(response, email);
      },
    );

    it('CA-6: varios campos inválidos a la vez se informan todos, incluidas las reglas de contraseña', async () => {
      const response = await register({
        fullName: '',
        email: 'no-es-un-correo',
        password: 'corta',
        acceptTerms: false,
      });

      expect(response.status).toBe(422);
      expect(errorBody(response).code).toBe('IDENTITY_INVALID_INPUT');
      expect(reasonsOf(response)).toEqual(
        expect.arrayContaining([
          { field: 'fullName', reason: 'REQUIRED' },
          { field: 'email', reason: 'INVALID_EMAIL' },
          { field: 'acceptTerms', reason: 'TERMS_NOT_ACCEPTED' },
          { field: 'password', reason: 'PASSWORD_TOO_SHORT' },
          { field: 'password', reason: 'PASSWORD_MISSING_UPPERCASE' },
          { field: 'password', reason: 'PASSWORD_MISSING_NUMBER' },
          { field: 'password', reason: 'PASSWORD_MISSING_SYMBOL' },
        ]),
      );
    });

    it('CA-6: un cuerpo `text/plain` responde `IDENTITY_INVALID_INPUT` con los campos obligatorios, sin efectos', async () => {
      const email = uniqueEmail();

      const response = await request(testApp.app.getHttpServer())
        .post(REGISTER)
        .set({ 'X-Forwarded-For': nextClientIp(), 'Content-Type': 'text/plain' })
        .send(JSON.stringify(validRegistration(email)));

      expect(response.status).toBe(422);
      expect(errorBody(response).code).toBe('IDENTITY_INVALID_INPUT');
      expect(reasonsOf(response)).toEqual(
        expect.arrayContaining([
          { field: 'fullName', reason: 'REQUIRED' },
          { field: 'email', reason: 'REQUIRED' },
          { field: 'password', reason: 'REQUIRED' },
        ]),
      );
      await expectNoEffects(response, email);
    });

    it('CA-6: un JSON mal formado responde el `400 VALIDATION_FAILED` de 000, sin efectos', async () => {
      const email = uniqueEmail();

      const response = await request(testApp.app.getHttpServer())
        .post(REGISTER)
        .set({ 'X-Forwarded-For': nextClientIp(), 'Content-Type': 'application/json' })
        .send(`{"fullName":"Lucía Pérez","email":"${email}",`);

      expect(response.status).toBe(400);
      expect(errorBody(response).code).toBe('VALIDATION_FAILED');
      await expectNoEffects(response, email);
    });

    it('CA-6: un dato inválido con un correo que ya tiene cuenta responde igual que con uno nuevo', async () => {
      const existing = uniqueEmail('existente');
      expect((await register(validRegistration(existing))).status).toBe(202);

      const withExisting = await register({ ...validRegistration(existing), fullName: '' });
      const withNew = await register({ ...validRegistration(uniqueEmail('nueva')), fullName: '' });

      expect(withExisting.status).toBe(422);
      expect(comparableView(withExisting)).toEqual(comparableView(withNew));
    });
  });

  describe('CA-7: el registro solo crea Clientes sin verificar con la versión vigente', () => {
    it.each(UNDECLARED_FIELDS)(
      'CA-7: el campo `%s` se rechaza con `UNKNOWN_FIELD`, también con `Authorization`, y no crea cuenta',
      async (field, value) => {
        const email = uniqueEmail();
        const body = { ...validRegistration(email), [field]: value };

        const anonymous = await register(body);
        const withToken = await register(body, { Authorization: `Bearer ${randomUUID()}` });

        for (const response of [anonymous, withToken]) {
          expect(response.status).toBe(422);
          expect(errorBody(response).code).toBe('IDENTITY_INVALID_INPUT');
          expect(reasonsOf(response)).toEqual([{ field, reason: 'UNKNOWN_FIELD' }]);
          await expectNoEffects(response, email);
        }
      },
    );

    it('CA-7: con `Authorization` un registro válido crea un Cliente sin verificar con la versión vigente', async () => {
      const email = uniqueEmail();

      const response = await register(validRegistration(email), {
        Authorization: `Bearer ${randomUUID()}`,
      });

      expect(response.status).toBe(202);
      expect(await usersWithEmail(email)).toEqual([
        {
          rol: 'CLIENT',
          correo_verificado: false,
          version_terminos: LEGAL_DOCUMENTS.terms.version,
          version_privacidad: LEGAL_DOCUMENTS.privacy.version,
        },
      ]);
    });
  });
});

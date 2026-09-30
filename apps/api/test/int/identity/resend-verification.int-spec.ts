import { createHash, randomUUID } from 'node:crypto';

import {
  acceptedResponseSchema,
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  errorResponseSchema,
  LEGAL_DOCUMENTS,
  VERIFICATION_LINK_TTL_HOURS,
  verifyEmailResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

const MS_PER_SECOND = 1000;
const LINK_TTL_MS = VERIFICATION_LINK_TTL_HOURS * 3600 * MS_PER_SECOND;
const PAST_COOLDOWN_MS = (EMAIL_REQUEST_COOLDOWN_SECONDS + 1) * MS_PER_SECOND;
/** PHC de relleno para cuentas insertadas a mano: estas pruebas nunca verifican su contraseña. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$cmVsbGVubw';
/** Cabeceras que cambian en cada respuesta aunque el resultado sea el mismo. */
const VARYING_HEADERS = new Set(['x-correlation-id', 'date']);

interface TokenRow {
  creado_en: Date;
  expira_en: Date;
}

/** Lo que ve quien llama: estado, cuerpo y cabeceras, sin las que cambian en cada petición. */
const observable = (
  response: request.Response,
): { status: number; body: unknown; headers: Record<string, unknown> } => ({
  status: response.status,
  body: response.body as unknown,
  headers: Object.fromEntries(
    Object.entries(response.headers as Record<string, unknown>).filter(
      ([name]) => !VARYING_HEADERS.has(name),
    ),
  ),
});

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** `POST /auth/resend-verification` de punta a punta (plan §5): CA-13 y CA-14 (T-49). */
describe('POST /auth/resend-verification (CA-13, CA-14)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;

  const server = (): ReturnType<TestApp['app']['getHttpServer']> => testApp.app.getHttpServer();

  const registerAndReadLink = async (email: string): Promise<string> => {
    await request(server()).post(REGISTER).send(validRegistration(email)).expect(202);
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return token;
  };

  /** Pasada la espera de 60 s, pide otro enlace; devuelve la respuesta y el token que llegó. */
  const resendAndReadLink = async (
    email: string,
  ): Promise<{ response: request.Response; token: string }> => {
    clock.advance(PAST_COOLDOWN_MS);
    const response = await request(server()).post(RESEND).send({ email });
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return { response, token };
  };

  const verify = (token: string): request.Test =>
    request(server()).post(VERIFY_EMAIL).send({ token });

  const verificationTokenCount = async (email: string): Promise<number> => {
    const [row] = (await dataSource.query(
      `SELECT count(t.id)::int AS total FROM usuario u
         LEFT JOIN token_cuenta t ON t.usuario_id = u.id AND t.tipo = 'verificacion'
        WHERE u.correo = $1`,
      [email],
    )) as { total: number }[];
    return row?.total ?? 0;
  };

  const insertAccount = async (email: string, role: 'CLIENT' | 'SUPPORT'): Promise<void> => {
    await dataSource.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
         version_privacidad, terminos_aceptados_en)
       VALUES ($1, 'Cuenta Existente', $2, $3, $4, true, $5, $6, $7)`,
      [
        randomUUID(),
        email,
        PLACEHOLDER_PHC,
        role,
        LEGAL_DOCUMENTS.terms.version,
        LEGAL_DOCUMENTS.privacy.version,
        clock.now(),
      ],
    );
  };

  const accountRow = async (email: string): Promise<unknown> => {
    const rows = (await dataSource.query('SELECT * FROM usuario WHERE correo = $1', [
      email,
    ])) as unknown[];
    return rows[0];
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
  });

  it('CA-13: el reenvío responde `202 accepted` y envía un enlace con 24 h desde ahora; los anteriores dan `LINK_INVALID`', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const first = await registerAndReadLink(email);
    const second = await resendAndReadLink(email);

    const { response, token: latest } = await resendAndReadLink(email);

    expect(response.status).toBe(202);
    expect(acceptedResponseSchema.parse(response.body)).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(new Set([first, second.token, latest]).size).toBe(3);
    const [row] = (await dataSource.query(
      'SELECT creado_en, expira_en FROM token_cuenta WHERE token_hash = $1',
      [sha256(latest)],
    )) as TokenRow[];
    expect(row).toEqual({
      creado_en: clock.now(),
      expira_en: new Date(clock.now().getTime() + LINK_TTL_MS),
    });
    for (const previous of [first, second.token]) {
      const rejected = await verify(previous);
      expect(rejected.status).toBe(422);
      expect(errorResponseSchema.parse(rejected.body).code).toBe(
        'IDENTITY_VERIFICATION_LINK_INVALID',
      );
    }
    const verified = await verify(latest);
    expect(verifyEmailResponseSchema.parse(verified.body)).toMatchObject({ status: 'verified' });
  });

  it('CA-14: para un correo inexistente, de una cuenta verificada o de una interna la respuesta es idéntica a CA-13 y no sale ningún enlace', async () => {
    const pending = `ana-${randomUUID()}@ejemplo.com`;
    await registerAndReadLink(pending);
    const { response: reference } = await resendAndReadLink(pending);
    const verified = `vero-${randomUUID()}@ejemplo.com`;
    const internal = `soporte-${randomUUID()}@nimbo.me`;
    await insertAccount(verified, 'CLIENT');
    await insertAccount(internal, 'SUPPORT');
    const cases = [`nadie-${randomUUID()}@ejemplo.com`, verified, internal];

    for (const email of cases) {
      const before = await accountRow(email);
      testApp.logs.clear();

      const response = await request(server()).post(RESEND).send({ email });

      expect(observable(response)).toEqual(observable(reference));
      expect(testApp.logs.lines().filter((line) => line.event === 'mail.enqueued')).toEqual([]);
      expect(await verificationTokenCount(email)).toBe(0);
      expect(await accountRow(email)).toEqual(before);
    }
  });
});

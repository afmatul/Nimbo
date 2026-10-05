import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  errorResponseSchema,
  VERIFICATION_LINK_TTL_HOURS,
  verifyEmailResponseSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { CLIENT_ACCOUNT_VERIFIED } from '../../../src/modules/identity';
import type { ClientAccountVerifiedEvent } from '../../../src/modules/identity';
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
/** Aperturas del mismo enlace en (a) a (c): la segunda no debe tener ningún efecto nuevo. */
const OPENINGS = 2;

interface AccountState {
  user: { id: string; correo_verificado: boolean };
  tokens: { usado_en: Date | null; invalidado_en: Date | null }[];
  /** Filas de `sesion` de la cuenta (002 CA-15). */
  sessions: number;
}

/** La respuesta entrega una sesión: `session` en el cuerpo o alguna cookie de `identity` (002 CA-15). */
const deliversSession = (response: Response): boolean =>
  (response.body as { session?: unknown }).session !== undefined ||
  response.headers['set-cookie'] !== undefined;

/**
 * CA-29 (parte del token, D-19): el enlace es una credencial de un solo uso. Se fija que (a) a (c) no tienen efectos
 * repetidos ni abren sesión y que (d) dos aperturas simultáneas verifican una sola vez y solo la ganadora recibe la
 * sesión (002 CA-15). La app escucha en un puerto propio para que las peticiones simultáneas lleguen de verdad en paralelo.
 */
describe('POST /auth/verify-email: un solo uso y concurrencia (CA-29; 002 CA-15)', () => {
  const clock = new FixedClock(new Date());
  const events: ClientAccountVerifiedEvent[] = [];
  let testApp: TestApp;
  let dataSource: DataSource;
  let baseUrl: string;

  const registerAndReadLink = async (email: string): Promise<string> => {
    await request(baseUrl).post(REGISTER).send(validRegistration(email)).expect(202);
    const token = await verificationTokenSentTo(email);
    await deleteAll();
    return token;
  };

  const verify = (token: string): request.Test =>
    request(baseUrl).post(VERIFY_EMAIL).send({ token });

  const stateOf = async (email: string): Promise<AccountState> => {
    const [user] = (await dataSource.query(
      'SELECT id, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as AccountState['user'][];
    if (user === undefined) throw new Error('La cuenta de la prueba no existe.');
    const tokens = (await dataSource.query(
      `SELECT usado_en, invalidado_en FROM token_cuenta
        WHERE usuario_id = $1 AND tipo = 'verificacion' ORDER BY creado_en`,
      [user.id],
    )) as AccountState['tokens'];
    const [sessions] = (await dataSource.query(
      'SELECT count(*)::int AS total FROM sesion WHERE usuario_id = $1',
      [user.id],
    )) as { total: number }[];
    return { user, tokens, sessions: sessions?.total ?? 0 };
  };

  /**
   * Abre el enlace `OPENINGS` veces y devuelve el estado de cada respuesta con su código de error, si lo hay, y
   * « con sesión» si además entregó una (002 CA-15).
   */
  const openRepeatedly = async (token: string): Promise<string[]> => {
    const outcomes: string[] = [];
    for (let opening = 0; opening < OPENINGS; opening += 1) {
      const response = await verify(token);
      const outcome =
        response.status === 200
          ? `200 ${verifyEmailResponseSchema.parse(response.body).status}`
          : `${String(response.status)} ${errorResponseSchema.parse(response.body).code}`;
      outcomes.push(deliversSession(response) ? `${outcome} con sesión` : outcome);
    }
    return outcomes;
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    testApp.app
      .get(EventEmitter2)
      .on(CLIENT_ACCOUNT_VERIFIED, (event: ClientAccountVerifiedEvent) => {
        events.push(event);
      });
    await testApp.app.listen(0, '127.0.0.1');
    const address = (testApp.app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
    events.length = 0;
  });

  it('CA-29 (d) / CA-15: dos aperturas simultáneas del mismo enlace dan un `verified` con la única sesión, un `already-verified` sin sesión y un solo evento', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);

    const responses = await Promise.all([verify(token), verify(token)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const statuses = responses.map(
      (response) => verifyEmailResponseSchema.parse(response.body).status,
    );
    expect(statuses.sort()).toEqual(['already-verified', 'verified']);
    const withSession = responses.filter(deliversSession);
    expect(withSession).toHaveLength(1);
    expect(verifyEmailResponseSchema.parse(withSession[0]?.body).status).toBe('verified');
    const { user, tokens, sessions } = await stateOf(email);
    expect(sessions).toBe(1);
    expect(user.correo_verificado).toBe(true);
    expect(tokens).toEqual([{ usado_en: clock.now(), invalidado_en: null }]);
    expect(events).toEqual([{ userId: user.id }]);
    expect(
      testApp.logs.lines().filter((line) => line.event === 'identity.verification.succeeded'),
    ).toHaveLength(1);
  });

  it('CA-29 (a) / CA-15: abrir otra vez un enlace ya usado no repite efectos: `already-verified`, sin sesión, evento ni correo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    await verify(token).expect(200);
    const afterFirstUse = await stateOf(email);
    clock.advance(MS_PER_SECOND);
    testApp.logs.clear();

    const outcomes = await openRepeatedly(token);

    expect(outcomes).toEqual(['200 already-verified', '200 already-verified']);
    expect(afterFirstUse.sessions).toBe(1);
    expect(await stateOf(email)).toEqual(afterFirstUse);
    expect(events).toEqual([{ userId: afterFirstUse.user.id }]);
    expect(testApp.logs.lines().filter((line) => line.event === 'mail.enqueued')).toEqual([]);
  });

  it('CA-29 (b) / CA-15: un enlace reemplazado no verifica, no abre sesión ni cambia nada, por más veces que se abra', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const replaced = await registerAndReadLink(email);
    clock.advance(PAST_COOLDOWN_MS);
    await request(baseUrl).post(RESEND).send({ email }).expect(202);
    await verificationTokenSentTo(email);
    const before = await stateOf(email);

    const outcomes = await openRepeatedly(replaced);

    expect(outcomes).toEqual([
      '422 IDENTITY_VERIFICATION_LINK_INVALID',
      '422 IDENTITY_VERIFICATION_LINK_INVALID',
    ]);
    expect(before.sessions).toBe(0);
    expect(await stateOf(email)).toEqual(before);
    expect(events).toEqual([]);
  });

  it('CA-29 (c) / CA-15: un enlace de más de 24 h no verifica, no abre sesión ni cambia nada, por más veces que se abra', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    clock.advance(LINK_TTL_MS + MS_PER_SECOND);
    const before = await stateOf(email);

    const outcomes = await openRepeatedly(token);

    expect(outcomes).toEqual([
      '422 IDENTITY_VERIFICATION_LINK_EXPIRED',
      '422 IDENTITY_VERIFICATION_LINK_EXPIRED',
    ]);
    expect(await stateOf(email)).toEqual(before);
    expect(before.user.correo_verificado).toBe(false);
    expect(before.sessions).toBe(0);
    expect(events).toEqual([]);
  });
});

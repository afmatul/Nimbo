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
}

/**
 * CA-29 (parte del token, D-19): el enlace es una credencial de un solo uso. La sesión la prueba 002; aquí se fija
 * que (a) a (c) no tienen efectos repetidos y que (d) dos aperturas simultáneas verifican una sola vez. La app
 * escucha en un puerto propio para que las peticiones simultáneas lleguen de verdad en paralelo.
 */
describe('POST /auth/verify-email: un solo uso y concurrencia (CA-29)', () => {
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
    return { user, tokens };
  };

  /** Abre el enlace `OPENINGS` veces y devuelve el estado de cada respuesta con su código de error, si lo hay. */
  const openRepeatedly = async (token: string): Promise<string[]> => {
    const outcomes: string[] = [];
    for (let opening = 0; opening < OPENINGS; opening += 1) {
      const response = await verify(token);
      outcomes.push(
        response.status === 200
          ? `200 ${verifyEmailResponseSchema.parse(response.body).status}`
          : `${String(response.status)} ${errorResponseSchema.parse(response.body).code}`,
      );
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

  it('CA-29 (d): dos aperturas simultáneas del mismo enlace dan un `verified`, un `already-verified` y un solo evento', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);

    const responses = await Promise.all([verify(token), verify(token)]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const statuses = responses.map(
      (response) => verifyEmailResponseSchema.parse(response.body).status,
    );
    expect(statuses.sort()).toEqual(['already-verified', 'verified']);
    const { user, tokens } = await stateOf(email);
    expect(user.correo_verificado).toBe(true);
    expect(tokens).toEqual([{ usado_en: clock.now(), invalidado_en: null }]);
    expect(events).toEqual([{ userId: user.id }]);
    expect(
      testApp.logs.lines().filter((line) => line.event === 'identity.verification.succeeded'),
    ).toHaveLength(1);
  });

  it('CA-29 (a): abrir otra vez un enlace ya usado no repite efectos: `already-verified`, sin evento ni correo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const token = await registerAndReadLink(email);
    await verify(token).expect(200);
    const afterFirstUse = await stateOf(email);
    clock.advance(MS_PER_SECOND);
    testApp.logs.clear();

    const outcomes = await openRepeatedly(token);

    expect(outcomes).toEqual(['200 already-verified', '200 already-verified']);
    expect(await stateOf(email)).toEqual(afterFirstUse);
    expect(events).toEqual([{ userId: afterFirstUse.user.id }]);
    expect(testApp.logs.lines().filter((line) => line.event === 'mail.enqueued')).toEqual([]);
  });

  it('CA-29 (b): un enlace reemplazado no verifica ni cambia nada, por más veces que se abra', async () => {
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
    expect(await stateOf(email)).toEqual(before);
    expect(events).toEqual([]);
  });

  it('CA-29 (c): un enlace de más de 24 h no verifica ni cambia nada, por más veces que se abra', async () => {
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
    expect(events).toEqual([]);
  });
});

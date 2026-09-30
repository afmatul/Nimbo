import type { AddressInfo } from 'node:net';

import { errorResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import type { TestApp } from '../setup/test-app';

import { FORGOT_PASSWORD_PATH, insertAccount, LOGIN_PATH, RESET_PASSWORD_PATH } from './accounts';
import { createIdentityTestApp, resetTokenSentTo } from './identity-test-app';

/** Dos contraseñas válidas distintas: la que queda dice qué envío ganó. */
const FIRST_PASSWORD = 'Primera-Clave-Segura-2026';
const SECOND_PASSWORD = 'Segunda-Clave-Segura-2026';

const outcomeOf = (response: Response): string =>
  response.status === 200
    ? '200 password-reset'
    : `${String(response.status)} ${errorResponseSchema.parse(response.body).code}`;

/**
 * CA-20 (consumo atómico, D-6): dos envíos simultáneos del mismo enlace de recuperación. La app escucha en un puerto
 * propio para que las peticiones lleguen de verdad en paralelo.
 */
describe('POST /auth/reset-password: dos envíos simultáneos (CA-20)', () => {
  const clock = new FixedClock(new Date());
  let testApp: TestApp;
  let dataSource: DataSource;
  let baseUrl: string;

  const reset = (token: string, password: string) =>
    request(baseUrl).post(RESET_PASSWORD_PATH).send({ token, password });

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    await testApp.app.listen(0, '127.0.0.1');
    const address = (testApp.app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.logs.clear();
  });

  it('CA-20: con el mismo enlace, uno responde `200` y el otro `IDENTITY_RESET_LINK_INVALID`; solo se aplica la contraseña del ganador', async () => {
    const account = await insertAccount(dataSource);
    await request(baseUrl).post(FORGOT_PASSWORD_PATH).send({ email: account.email }).expect(202);
    const token = await resetTokenSentTo(account.email);

    const responses = await Promise.all([
      reset(token, FIRST_PASSWORD),
      reset(token, SECOND_PASSWORD),
    ]);

    expect(responses.map(outcomeOf).sort()).toEqual([
      '200 password-reset',
      '422 IDENTITY_RESET_LINK_INVALID',
    ]);
    const winner = responses[0]?.status === 200 ? FIRST_PASSWORD : SECOND_PASSWORD;
    const loser = winner === FIRST_PASSWORD ? SECOND_PASSWORD : FIRST_PASSWORD;
    const tokens = (await dataSource.query(
      "SELECT usado_en FROM token_cuenta WHERE usuario_id = $1 AND tipo = 'recuperacion'",
      [account.id],
    )) as { usado_en: Date | null }[];
    expect(tokens).toEqual([{ usado_en: clock.now() }]);
    const lines = testApp.logs.lines();
    expect(lines.filter((line) => line.event === 'identity.password_reset.completed')).toHaveLength(
      1,
    );
    await request(baseUrl)
      .post(LOGIN_PATH)
      .send({ email: account.email, password: loser })
      .expect(401);
    await request(baseUrl)
      .post(LOGIN_PATH)
      .send({ email: account.email, password: winner })
      .expect(200);
  });
});

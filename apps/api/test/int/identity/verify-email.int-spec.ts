import { randomUUID } from 'node:crypto';

import { verifyEmailResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';

/** `POST /auth/verify-email` de punta a punta (plan §5). T-45: camino feliz de CA-8; T-48 completa CA-8 a CA-11. */
describe('POST /auth/verify-email (CA-8)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
  });

  it('CA-8: el enlace del correo verifica la cuenta, responde `200 verified` y publica el evento', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const server = testApp.app.getHttpServer();
    await request(server).post(REGISTER).send(validRegistration(email)).expect(202);
    const token = await verificationTokenSentTo(email);

    const response = await request(server).post(VERIFY_EMAIL).send({ token });

    expect(response.status).toBe(200);
    expect(verifyEmailResponseSchema.parse(response.body)).toEqual({ status: 'verified' });
    expect(response.headers['cache-control']).toBe('no-store');
    const [user] = (await dataSource.query(
      'SELECT id, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as { id: string; correo_verificado: boolean }[];
    expect(user?.correo_verificado).toBe(true);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({ event: 'identity.account_verified.published', userId: user?.id }),
    );
  });
});

import { randomUUID } from 'node:crypto';

import { acceptedResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { deleteAll, getMessage, waitForMessages } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

import { createIdentityTestApp, validRegistration } from './identity-test-app';

const REGISTER = '/api/v1/auth/register';

interface UserRow {
  id: string;
  rol: string;
  correo_verificado: boolean;
}

/** `POST /auth/register` de punta a punta (plan §5). T-45: camino feliz de CA-1; T-46 completa CA-1 a CA-4. */
describe('POST /auth/register (CA-1)', () => {
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
  });

  it('CA-1: responde `202 accepted` sin caché ni cookies, crea la cuenta y su enlace vigente, y envía el correo', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;

    const response = await request(testApp.app.getHttpServer())
      .post(REGISTER)
      .send(validRegistration(email));

    expect(response.status).toBe(202);
    expect(acceptedResponseSchema.parse(response.body)).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toBeUndefined();

    const [user] = (await dataSource.query(
      'SELECT id, rol, correo_verificado FROM usuario WHERE correo = $1',
      [email],
    )) as UserRow[];
    expect(user).toMatchObject({ rol: 'CLIENT', correo_verificado: false });

    const tokens = (await dataSource.query(
      `SELECT id FROM token_cuenta
        WHERE usuario_id = $1 AND tipo = 'verificacion' AND usado_en IS NULL AND invalidado_en IS NULL
          AND expira_en > now()`,
      [user?.id],
    )) as { id: string }[];
    expect(tokens).toHaveLength(1);

    const [summary] = await waitForMessages(1);
    const message = await getMessage(summary?.ID ?? '');
    expect(message.To.map((recipient) => recipient.Address)).toEqual([email]);
    expect(message.Text).toContain('/verificar-correo#token=');
  });
});

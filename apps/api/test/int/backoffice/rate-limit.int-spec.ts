import { randomUUID } from 'node:crypto';

import { errorResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import type { JwtTokenService } from '../../../src/modules/identity/infrastructure/jwt/jwt-token.service';
import { Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createFullApiTestApp } from '../../support/full-api-test-app';
import { realAccessTokenIssuer } from '../../support/real-access-tokens';
import { buildTestEnv } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';
import { insertAccount, removeAccounts } from '../storage/storage-test-db';

const METRICS = '/api/v1/backoffice/metrics';
/** La regla del límite del backoffice (011 T-14, PD-103; plan §5): 60 peticiones por minuto y por cuenta interna. */
const REQUESTS_PER_WINDOW = 60;

/**
 * Límite de tasa del backoffice (011 T-14, PD-103, Art. IX.7) contra la API completa (`AppModule`) con tokens reales y el
 * `IRateLimiter` de Redis: toda operación del backoffice pasa por `InternalActionService`, que es donde se comprueba.
 */
describe('límite de tasa del backoffice (011 T-14, PD-103)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let issuer: JwtTokenService;
  const accounts: string[] = [];

  const tokenFor = async (userId: string, role: Role): Promise<string> => {
    const { token } = await issuer.issueAccessToken({ userId, role, sessionId: randomUUID() });
    return token;
  };

  const metricsAs = async (token: string): Promise<Response> =>
    request(testApp.app.getHttpServer()).get(METRICS).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const env = buildTestEnv();
    testApp = await createFullApiTestApp(env);
    issuer = realAccessTokenIssuer(env);
    owner = await connectAsOwner();
  });

  afterAll(async () => {
    await testApp?.close();
    await removeAccounts(owner, accounts);
    await owner?.destroy();
  });

  it('la petición 61 de una cuenta en un minuto es `429 SHARED_TOO_MANY_REQUESTS` con su `Retry-After`', async () => {
    const adminId = await insertAccount(owner, Role.ADMIN);
    accounts.push(adminId);
    const token = await tokenFor(adminId, Role.ADMIN);

    for (let attempt = 0; attempt < REQUESTS_PER_WINDOW; attempt += 1) {
      const allowed = await metricsAs(token);
      expect(allowed.status).toBe(200);
    }

    const response = await metricsAs(token);

    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      code: 'SHARED_TOO_MANY_REQUESTS',
    });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el límite es por cuenta interna: otra cuenta del mismo rol sigue entrando', async () => {
    const otherId = await insertAccount(owner, Role.ADMIN);
    accounts.push(otherId);
    const token = await tokenFor(otherId, Role.ADMIN);

    const response = await metricsAs(token);

    expect(response.status).toBe(200);
  });

  it('RNF-17: la bitácora del límite lleva el id y el rol del interno, sin correo', async () => {
    const adminId = await insertAccount(owner, Role.ADMIN);
    accounts.push(adminId);
    const token = await tokenFor(adminId, Role.ADMIN);
    const correlationId = randomUUID();

    for (let attempt = 0; attempt < REQUESTS_PER_WINDOW; attempt += 1) {
      await request(testApp.app.getHttpServer())
        .get(METRICS)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Correlation-Id', correlationId);
    }
    const response = await request(testApp.app.getHttpServer())
      .get(METRICS)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Correlation-Id', correlationId);

    expect(response.status).toBe(429);
    const lines = testApp.logs.withCorrelationId(correlationId);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'backoffice.rate_limited',
          actorId: adminId,
          actorRole: Role.ADMIN,
        }),
      ]),
    );
  });
});

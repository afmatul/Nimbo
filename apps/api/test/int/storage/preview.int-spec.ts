import { randomUUID } from 'node:crypto';

import { errorResponseSchema, previewUrlResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import {
  I_PLAN_LIMITS_PROVIDER,
  StorageModule,
  StoragePreviewFacade,
} from '../../../src/modules/storage';
import type { IPlanLimitsProvider } from '../../../src/modules/storage';
import { PreviewModule } from '../../../src/modules/storage/preview';
import { PreviewService } from '../../../src/modules/storage/preview/application/preview.service';
import { PlanLimitsBindingModule } from '../../../src/plan-limits-binding.module';
import { createActor, FixedClock, Role } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { insertCommittedFile } from './storage-http';
import { insertAccount, removeAccounts } from './storage-test-db';

/** T-03: HTTP, DI, filtro y logging reales; Postgres/Redis/firmador existentes, sin infraestructura duplicada. */
describe('POST /api/v1/files/:fileId/preview-url (017 T-03)', () => {
  let testApp: TestApp;
  let owner: DataSource;
  let actorId: string;
  let fileId: string;
  let facade: StoragePreviewFacade;
  const accounts: string[] = [];
  const tokens = new TestAccessTokens(new FixedClock(PROBE_CLOCK_START));

  beforeAll(async () => {
    const env = buildTestEnv({ RATE_LIMIT_PREVIEW_URL_PER_MINUTE: '3' });
    const storageModule = StorageModule.forRoot(env);
    testApp = await createTestApp({
      validatedEnv: env,
      modules: [
        PlanLimitsBindingModule,
        PreviewModule.register({ storageModule, config: { previewUrlPerMinute: 3 } }),
      ],
    });
    owner = await connectAsOwner();
    facade = testApp.app.get(StoragePreviewFacade);
  });

  beforeEach(async () => {
    actorId = await insertAccount(owner);
    accounts.push(actorId);
    ({ fileId } = await insertCommittedFile(owner, actorId, { name: 'privado.pdf' }));
    testApp.logs.clear();
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await testApp?.close();
    if (owner !== undefined) {
      await removeAccounts(owner, accounts);
      await owner.destroy();
    }
  });

  const issue = (options: { role?: Role; id?: string; correlationId?: string } = {}) =>
    request(testApp.app.getHttpServer())
      .post(`/api/v1/files/${options.id ?? fileId}/preview-url`)
      .auth(tokens.forRole(options.role ?? Role.CLIENT, actorId), { type: 'bearer' })
      .set('x-correlation-id', options.correlationId ?? randomUUID());

  it('CA-6, CA-10, CA-11: CLIENT recibe 200 con el archivo actual y vencimiento ISO, sin auditoría de descarga', async () => {
    const facadeCall = jest.spyOn(facade, 'issueUrl');
    const limitsCall = jest.spyOn(
      testApp.app.get<IPlanLimitsProvider>(I_PLAN_LIMITS_PROVIDER),
      'limitsFor',
    );

    const response = await issue({ correlationId: 'preview-issued' });

    expect(response.status).toBe(200);
    const delivery = previewUrlResponseSchema.parse(response.body);
    expect(delivery.file.id).toBe(fileId);
    expect(new Date(delivery.expiresAt).toISOString()).toBe(delivery.expiresAt);
    expect(facadeCall).toHaveBeenCalledWith(createActor(actorId, Role.CLIENT), fileId);
    expect(limitsCall).not.toHaveBeenCalled();
    expect(testApp.logs.withCorrelationId('preview-issued')).toContainEqual(
      expect.objectContaining({ event: 'preview.url_issued', fileId }),
    );
    const logs = JSON.stringify(testApp.logs.lines());
    for (const forbidden of [
      delivery.url,
      'X-Amz-Signature',
      'privado.pdf',
      'download.url_issued',
      'audit.record',
    ]) {
      expect(logs).not.toContain(forbidden);
    }
  });

  it('CA-3: sin autenticación responde 401 sin llamar al servicio ni a storage', async () => {
    const serviceCall = jest.spyOn(testApp.app.get(PreviewService), 'issueUrl');
    const facadeCall = jest.spyOn(facade, 'issueUrl');

    const response = await request(testApp.app.getHttpServer()).post(
      `/api/v1/files/${fileId}/preview-url`,
    );

    expect(response.status).toBe(401);
    expect(errorResponseSchema.parse(response.body).code).toBe('SHARED_UNAUTHENTICATED');
    expect(serviceCall).not.toHaveBeenCalled();
    expect(facadeCall).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-4: %s recibe 403 antes de preview/storage',
    async (role) => {
      const serviceCall = jest.spyOn(testApp.app.get(PreviewService), 'issueUrl');
      const facadeCall = jest.spyOn(facade, 'issueUrl');

      const response = await issue({ role });

      expect(response.status).toBe(403);
      expect(errorResponseSchema.parse(response.body).code).toBe('SHARED_FORBIDDEN');
      expect(serviceCall).not.toHaveBeenCalled();
      expect(facadeCall).not.toHaveBeenCalled();
    },
  );

  it('CA-5: UUID inválido e inexistente tienen el mismo 404; el inválido no llega al servicio', async () => {
    const serviceCall = jest.spyOn(testApp.app.get(PreviewService), 'issueUrl');
    const facadeCall = jest.spyOn(facade, 'issueUrl');

    const malformed = await issue({ id: 'no-es-un-uuid' });

    expect(serviceCall).not.toHaveBeenCalled();
    expect(facadeCall).not.toHaveBeenCalled();
    const missing = await issue({ id: randomUUID(), correlationId: 'preview-missing' });
    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
    const { correlationId: _malformedId, ...malformedBody } = errorResponseSchema.parse(
      malformed.body,
    );
    const { correlationId: _missingId, ...missingBody } = errorResponseSchema.parse(missing.body);
    expect(malformedBody).toEqual(missingBody);
    expect(missingBody.code).toBe('STORAGE_NODE_NOT_FOUND');
    expect(testApp.logs.withCorrelationId('preview-missing')).toContainEqual(
      expect.objectContaining({ event: 'preview.url_failed', code: missingBody.code }),
    );
  });

  it('CA-11: un formato excluido responde 422 STORAGE_PREVIEW_UNSUPPORTED', async () => {
    await owner.query('UPDATE archivo SET tipo = $1 WHERE id = $2', ['otro', fileId]);

    const response = await issue({ correlationId: 'preview-unsupported' });

    expect(response.status).toBe(422);
    expect(errorResponseSchema.parse(response.body).code).toBe('STORAGE_PREVIEW_UNSUPPORTED');
    expect(testApp.logs.withCorrelationId('preview-unsupported')).toContainEqual(
      expect.objectContaining({
        event: 'preview.url_failed',
        fileId,
        code: 'STORAGE_PREVIEW_UNSUPPORTED',
      }),
    );
  });

  it('CA-12: la tasa se evalúa antes del archivo y responde 429 con mensaje y Retry-After', async () => {
    for (let i = 0; i < 3; i += 1) expect((await issue()).status).toBe(200);
    const facadeCall = jest.spyOn(facade, 'issueUrl');
    const missingId = randomUUID();

    const response = await issue({ id: missingId, correlationId: 'preview-limited' });

    expect(response.status).toBe(429);
    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      code: 'STORAGE_TOO_MANY_REQUESTS',
      message: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(facadeCall).not.toHaveBeenCalled();
    expect(testApp.logs.withCorrelationId('preview-limited')).toContainEqual(
      expect.objectContaining({
        event: 'preview.rate_limited',
        fileId: missingId,
        code: 'STORAGE_TOO_MANY_REQUESTS',
      }),
    );
  });

  it('CA-10: un fallo privado no llega a logs globales ni a la respuesta HTTP', async () => {
    const failure = new Error('https://example.test/file?X-Amz-Signature=SECRETO_MESSAGE', {
      cause: new Error('SECRETO_CAUSE'),
    });
    failure.stack = 'SECRETO_STACK';
    // Inyección de fallo en la frontera de aplicación; no sustituye DB, Redis ni MinIO por mocks.
    jest.spyOn(facade, 'issueUrl').mockRejectedValueOnce(failure);

    const response = await issue({ correlationId: 'preview-failed' });

    expect(response.status).toBe(500);
    expect(errorResponseSchema.parse(response.body)).toMatchObject({
      code: 'INTERNAL_ERROR',
      correlationId: 'preview-failed',
    });
    const lines = testApp.logs.withCorrelationId('preview-failed');
    expect(lines).toContainEqual(
      expect.objectContaining({ event: 'preview.url_failed', fileId, reason: 'unexpected_error' }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({ event: 'http.domain_error', code: 'INTERNAL_ERROR', status: 500 }),
    );
    expect(lines.some((line) => line.event === 'http.unhandled_error')).toBe(false);
    const serialized = JSON.stringify({ logs: testApp.logs.lines(), response: response.body });
    for (const forbidden of ['SECRETO', 'example.test', 'X-Amz-Signature', 'privado.pdf']) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const line of lines) expect(line).not.toHaveProperty('err');
  });
});

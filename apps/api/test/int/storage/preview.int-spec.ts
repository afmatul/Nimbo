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
import { createActor, FixedClock, I_RATE_LIMITER, Role } from '../../../src/shared';
import type { IRateLimiter } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { TestAccessTokens } from '../../support/test-access-tokens';
import type { LogLine } from '../setup/log-sink';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

import { insertCommittedFile } from './storage-http';
import { insertAccount, removeAccounts } from './storage-test-db';

/** Evaluar el matcher a boolean evita imprimir el log que falló la comprobación. */
const hasLog = (lines: readonly LogLine[], fields: Record<string, unknown>): boolean =>
  lines.some((line) => expect.objectContaining(fields).asymmetricMatch(line));

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
    expect(
      hasLog(testApp.logs.withCorrelationId('preview-issued'), {
        event: 'preview.url_issued',
        fileId,
      }),
    ).toBe(true);
    const logs = JSON.stringify(testApp.logs.lines());
    for (const forbidden of [
      delivery.url,
      'X-Amz-Signature',
      'privado.pdf',
      'download.url_issued',
      'audit.record',
    ]) {
      expect(logs.includes(forbidden)).toBe(false);
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
    expect(
      hasLog(testApp.logs.withCorrelationId('preview-missing'), {
        event: 'preview.url_failed',
        code: missingBody.code,
      }),
    ).toBe(true);
  });

  it('CA-11: un formato excluido responde 422 STORAGE_PREVIEW_UNSUPPORTED', async () => {
    await owner.query('UPDATE archivo SET tipo = $1 WHERE id = $2', ['otro', fileId]);

    const response = await issue({ correlationId: 'preview-unsupported' });

    expect(response.status).toBe(422);
    expect(errorResponseSchema.parse(response.body).code).toBe('STORAGE_PREVIEW_UNSUPPORTED');
    expect(
      hasLog(testApp.logs.withCorrelationId('preview-unsupported'), {
        event: 'preview.url_failed',
        fileId,
        code: 'STORAGE_PREVIEW_UNSUPPORTED',
      }),
    ).toBe(true);
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
    expect(
      hasLog(testApp.logs.withCorrelationId('preview-limited'), {
        event: 'preview.rate_limited',
        fileId: missingId,
        code: 'STORAGE_TOO_MANY_REQUESTS',
      }),
    ).toBe(true);
  });

  it.each(['facade', 'rateLimiter'] as const)(
    'CA-10: un fallo privado de %s usa el 500 canónico sin secretos en ningún log',
    async (source) => {
      const signedUrl =
        'https://example.test/PRIVATE_OBJECT_KEY?X-Amz-Signature=PRIVATE_SIGNATURE&token=PRIVATE_TOKEN';
      const failure = new Error(`PRIVATE_MESSAGE ${signedUrl}`, {
        cause: new Error('PRIVATE_CAUSE'),
      });
      failure.stack = 'PRIVATE_STACK';
      Object.assign(failure, { objectKey: 'PRIVATE_OBJECT_KEY', privateName: 'privado.pdf' });
      const facadeCall = jest.spyOn(facade, 'issueUrl');
      // Fallo inyectado en aplicación: no acredita Redis/MinIO realmente detenidos (T-04).
      if (source === 'facade') facadeCall.mockRejectedValueOnce(failure);
      else
        jest
          .spyOn(testApp.app.get<IRateLimiter>(I_RATE_LIMITER), 'consume')
          .mockRejectedValueOnce(failure);

      const response = await issue({ correlationId: 'preview-failed' });

      expect(response.status).toBe(500);
      expect(
        expect
          .arrayContaining([
            {
              code: 'INTERNAL_ERROR',
              message:
                'Ocurrió un error inesperado. Inténtalo de nuevo más tarde; si persiste, contacta a soporte con el identificador de correlación.',
              correlationId: 'preview-failed',
            },
          ])
          .asymmetricMatch([response.body]),
      ).toBe(true);
      const lines = testApp.logs.withCorrelationId('preview-failed');
      expect(
        hasLog(lines, {
          event: 'preview.url_failed',
          fileId,
          reason: 'unexpected_error',
        }),
      ).toBe(true);
      expect(hasLog(lines, { event: 'http.unhandled_error' })).toBe(true);
      expect(
        hasLog(lines, {
          event: 'http.request',
          res: expect.objectContaining({ statusCode: 500 }),
        }),
      ).toBe(true);
      expect(lines.some((line) => line.event === 'http.domain_error')).toBe(false);
      expect(lines.some((line) => line.event === 'preview.url_issued')).toBe(false);
      const serialized = JSON.stringify({ logs: testApp.logs.lines(), response: response.body });
      for (const forbidden of [
        signedUrl,
        'PRIVATE_MESSAGE',
        'PRIVATE_STACK',
        'PRIVATE_CAUSE',
        'PRIVATE_TOKEN',
        'PRIVATE_SIGNATURE',
        'PRIVATE_OBJECT_KEY',
        'X-Amz-Signature',
        'example.test',
        'privado.pdf',
      ])
        expect(serialized.includes(forbidden)).toBe(false);
      for (const line of lines) expect(line.correlationId).toBe('preview-failed');
      if (source === 'rateLimiter') expect(facadeCall).not.toHaveBeenCalled();
    },
  );
});

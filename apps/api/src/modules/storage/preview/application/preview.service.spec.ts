import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';

import { StoragePreviewFacade } from '../..';
import type { PreviewDelivery } from '../..';
import {
  createActor,
  DomainError,
  I_RATE_LIMITER,
  InsufficientRoleError,
  Role,
} from '../../../../shared';
import type { Actor, IRateLimiter } from '../../../../shared';
import { NodeNotFoundError, PreviewUnsupportedError } from '../../domain/errors';
import { PreviewTooManyRequestsError } from '../domain/preview-errors';

import { PREVIEW_CONFIG } from './preview-config';
import { PreviewService } from './preview.service';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT = createActor(ACTOR_ID, Role.CLIENT);
const DELIVERY: PreviewDelivery = {
  file: {
    id: FILE_ID,
    name: 'privado.pdf',
    kind: 'pdf',
    folderId: null,
    sizeBytes: 42,
    createdAt: '2026-10-08T20:00:00.000Z',
    updatedAt: '2026-10-08T20:00:00.000Z',
  },
  url: 'https://objects.example.test/private-key?X-Amz-Signature=PRIVATE_SIGNATURE&token=PRIVATE_TOKEN',
  expiresAt: new Date('2026-10-08T20:05:00.000Z'),
};

const logWasCalledWith = (calls: readonly unknown[][], payload: Record<string, unknown>): boolean =>
  expect.arrayContaining([[payload]]).asymmetricMatch(calls);

async function setup() {
  const facade: jest.Mocked<Pick<StoragePreviewFacade, 'issueUrl'>> = { issueUrl: jest.fn() };
  const rateLimiter: jest.Mocked<IRateLimiter> = { consume: jest.fn() };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const config = { previewUrlPerMinute: 120 };
  const module = await Test.createTestingModule({
    providers: [
      PreviewService,
      { provide: StoragePreviewFacade, useValue: facade },
      { provide: I_RATE_LIMITER, useValue: rateLimiter },
      { provide: PREVIEW_CONFIG, useValue: config },
      { provide: PinoLogger, useValue: logger },
    ],
  }).compile();
  return { facade, rateLimiter, logger, config, service: module.get(PreviewService) };
}

describe('PreviewService', () => {
  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-4: %s falla antes de consumir tasa o acceder a storage',
    async (role) => {
      const { service, facade, rateLimiter } = await setup();

      await expect(service.issueUrl(createActor(ACTOR_ID, role), FILE_ID)).rejects.toBeInstanceOf(
        InsufficientRoleError,
      );

      expect(rateLimiter.consume).not.toHaveBeenCalled();
      expect(facade.issueUrl).not.toHaveBeenCalled();
    },
  );

  it.each<Actor>([
    { ...CLIENT, canReadContent: false },
    ...[Role.ADMIN, Role.SUPPORT, Role.OPERATOR].map((role) => ({
      id: ACTOR_ID,
      role,
      canReadContent: true,
    })),
  ])('CA-4: defensa directa de $role con canReadContent=$canReadContent', async (actor) => {
    const { service, facade, rateLimiter } = await setup();
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    facade.issueUrl.mockResolvedValue(DELIVERY);

    const failure: unknown = await service.issueUrl(actor, FILE_ID).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ status: 403, code: 'SHARED_FORBIDDEN' });

    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(facade.issueUrl).not.toHaveBeenCalled();
  });

  it('CA-12: consume la tasa configurada de preview antes de acceder a storage', async () => {
    const { service, facade, rateLimiter, config } = await setup();
    const calls: string[] = [];
    config.previewUrlPerMinute = 7;
    rateLimiter.consume.mockImplementation(async () => {
      calls.push('consume');
      return { allowed: true };
    });
    facade.issueUrl.mockImplementation(async () => {
      calls.push('facade');
      return DELIVERY;
    });

    await service.issueUrl(CLIENT, FILE_ID);

    expect(calls).toEqual(['consume', 'facade']);
    expect(rateLimiter.consume).toHaveBeenCalledWith(`storage:preview-url:${ACTOR_ID}`, [
      { limit: 7, windowSeconds: 60 },
    ]);
  });

  it('CA-12: tasa rechazada responde 429 con Retry-After sin acceder a storage', async () => {
    const { service, facade, rateLimiter, logger } = await setup();
    rateLimiter.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });

    const error: unknown = await service.issueUrl(CLIENT, FILE_ID).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PreviewTooManyRequestsError);
    expect(error).toMatchObject({
      status: 429,
      code: 'STORAGE_TOO_MANY_REQUESTS',
      retryAfterSeconds: 17,
      message: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    });
    expect(facade.issueUrl).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(
      logWasCalledWith(logger.warn.mock.calls, {
        event: 'preview.rate_limited',
        fileId: FILE_ID,
        code: 'STORAGE_TOO_MANY_REQUESTS',
      }),
    ).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(0);
    expect(logger.info).toHaveBeenCalledTimes(0);
  });

  it('CA-12: conserva la instancia 429 sin duplicar preview.url_failed', async () => {
    const { service, facade, rateLimiter, logger } = await setup();
    const failure = new PreviewTooManyRequestsError(17);
    rateLimiter.consume.mockRejectedValue(failure);

    await expect(service.issueUrl(CLIENT, FILE_ID)).rejects.toBe(failure);

    expect(facade.issueUrl).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(0);
    expect(logger.error).toHaveBeenCalledTimes(0);
    expect(logger.info).toHaveBeenCalledTimes(0);
  });

  it('CA-10, CA-11: devuelve la entrega intacta y registra solo preview.url_issued y fileId', async () => {
    const { service, facade, rateLimiter, logger } = await setup();
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    facade.issueUrl.mockResolvedValue(DELIVERY);

    const result = await service.issueUrl(CLIENT, FILE_ID);

    expect(result === DELIVERY).toBe(true);
    expect(facade.issueUrl).toHaveBeenCalledWith(CLIENT, FILE_ID);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(
      logWasCalledWith(logger.info.mock.calls, { event: 'preview.url_issued', fileId: FILE_ID }),
    ).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(0);
    expect(logger.error).toHaveBeenCalledTimes(0);
  });

  it.each([new InsufficientRoleError(), new NodeNotFoundError(), new PreviewUnsupportedError()])(
    'CA-10: $code registra preview.url_failed solo con código cerrado y propaga la instancia',
    async (failure) => {
      const { service, facade, rateLimiter, logger } = await setup();
      Object.assign(failure, { privateUrl: DELIVERY.url, privateKey: 'PRIVATE_KEY' });
      rateLimiter.consume.mockResolvedValue({ allowed: true });
      facade.issueUrl.mockRejectedValue(failure);

      const caught: unknown = await service.issueUrl(CLIENT, FILE_ID).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(caught === failure).toBe(true);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(
        logWasCalledWith(logger.warn.mock.calls, {
          event: 'preview.url_failed',
          fileId: FILE_ID,
          code: failure.code,
        }),
      ).toBe(true);
      expect(logger.error).toHaveBeenCalledTimes(0);
      expect(logger.info).toHaveBeenCalledTimes(0);
    },
  );

  it.each(['facade', 'rateLimiter'] as const)(
    'CA-10: un fallo inesperado de %s sale saneado y no es DomainError',
    async (source) => {
      const { service, facade, rateLimiter, logger } = await setup();
      const failure = new Error(`PRIVATE_MESSAGE ${DELIVERY.url}`, {
        cause: new Error('PRIVATE_CAUSE'),
      });
      failure.stack = 'PRIVATE_STACK';
      Object.assign(failure, {
        objectKey: 'PRIVATE_KEY',
        token: 'PRIVATE_TOKEN',
        signature: 'PRIVATE_SIGNATURE',
      });
      rateLimiter.consume.mockResolvedValue({ allowed: true });
      facade.issueUrl.mockRejectedValue(failure);
      if (source === 'rateLimiter') rateLimiter.consume.mockRejectedValue(failure);

      const error: unknown = await service.issueUrl(CLIENT, FILE_ID).then(
        () => undefined,
        (caught: unknown) => caught,
      );

      expect(error instanceof Error).toBe(true);
      expect(error === failure).toBe(false);
      expect(error instanceof DomainError).toBe(false);
      for (const property of ['cause', 'code', 'status']) {
        expect(typeof error === 'object' && error !== null && property in error).toBe(false);
      }
      if (!(error instanceof Error)) throw new Error('Se esperaba un Error operativo saneado');
      expect(error.name).not.toBe('PreviewUrlIssuanceError');
      // Revisar valores privados no exige una lista fija de propiedades internas del runtime.
      const serialized = JSON.stringify({
        properties: Object.getOwnPropertyNames(error).map((property): unknown =>
          Reflect.get(error, property),
        ),
        message: error.message,
        stack: error.stack,
        logs: [logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls],
      });
      for (const secret of [DELIVERY.url, 'PRIVATE_', 'X-Amz-Signature', 'privado.pdf'])
        expect(serialized.includes(secret)).toBe(false);
      if (source === 'rateLimiter') expect(facade.issueUrl).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(
        logWasCalledWith(logger.error.mock.calls, {
          event: 'preview.url_failed',
          fileId: FILE_ID,
          reason: 'unexpected_error',
        }),
      ).toBe(true);
      expect(logger.warn).toHaveBeenCalledTimes(0);
      expect(logger.info).toHaveBeenCalledTimes(0);
    },
  );
});

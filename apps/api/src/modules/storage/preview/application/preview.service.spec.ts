import type { StoragePreviewFacade } from '../..';
import { createActor, InsufficientRoleError, Role } from '../../../../shared';
import type { IRateLimiter } from '../../../../shared';
import { NodeNotFoundError, PreviewUnsupportedError } from '../../domain/errors';

import { PreviewService } from './preview.service';

const FILE_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

describe('PreviewService', () => {
  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-4: %s falla antes de consumir tasa o acceder a storage',
    async (role) => {
      const actor = createActor(ACTOR_ID, role);

      const facade = {
        issueUrl: jest.fn(),
      } as unknown as StoragePreviewFacade;

      const rateLimiter = {
        consume: jest.fn(),
      };

      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const service = new PreviewService(
        facade,
        rateLimiter as IRateLimiter,
        { previewUrlPerMinute: 120 },
        logger,
      );

      await expect(service.issueUrl(actor, FILE_ID)).rejects.toBeInstanceOf(InsufficientRoleError);

      expect(rateLimiter.consume).not.toHaveBeenCalled();
      expect(facade.issueUrl).not.toHaveBeenCalled();
    },
  );

  it('CA-12: consume la tasa configurada de preview antes de acceder a storage', async () => {
    const actor = createActor(ACTOR_ID, Role.CLIENT);
    const calls: string[] = [];

    const facade = {
      issueUrl: jest.fn(async () => {
        calls.push('facade');
        return {};
      }),
    } as unknown as StoragePreviewFacade;

    const rateLimiter = {
      consume: jest.fn(async () => {
        calls.push('consume');
        return { allowed: true };
      }),
    };

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new PreviewService(
      facade,
      rateLimiter as IRateLimiter,
      { previewUrlPerMinute: 7 },
      logger,
    );

    await service.issueUrl(actor, FILE_ID);

    expect(calls).toEqual(['consume', 'facade']);
    expect(rateLimiter.consume).toHaveBeenCalledWith(`storage:preview-url:${ACTOR_ID}`, [
      { limit: 7, windowSeconds: 60 },
    ]);
  });

  it('CA-12: tasa rechazada responde 429 con Retry-After sin acceder a storage', async () => {
    const actor = createActor(ACTOR_ID, Role.CLIENT);

    const facade = {
      issueUrl: jest.fn(),
    } as unknown as StoragePreviewFacade;

    const rateLimiter = {
      consume: jest.fn(async () => ({
        allowed: false,
        retryAfterSeconds: 17,
      })),
    };

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new PreviewService(
      facade,
      rateLimiter as IRateLimiter,
      { previewUrlPerMinute: 120 },
      logger,
    );

    const error = await service.issueUrl(actor, FILE_ID).catch((e: unknown) => e);

    expect(error).toMatchObject({
      status: 429,
      code: 'STORAGE_TOO_MANY_REQUESTS',
      retryAfterSeconds: 17,
      message: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    });

    expect(facade.issueUrl).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith({
      event: 'preview.rate_limited',
      fileId: FILE_ID,
      code: 'STORAGE_TOO_MANY_REQUESTS',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('CA-11: devuelve la entrega de storage sin alterar archivo, URL ni vencimiento', async () => {
    const actor = createActor(ACTOR_ID, Role.CLIENT);
    const expiresAt = new Date('2026-10-08T20:00:00.000Z');

    const delivery = {
      file: {
        id: FILE_ID,
      },
      url: 'https://objects.example.test/file',
      expiresAt,
    };

    const facade = {
      issueUrl: jest.fn(async () => delivery),
    } as unknown as StoragePreviewFacade;

    const rateLimiter = {
      consume: jest.fn(async () => ({ allowed: true })),
    };

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new PreviewService(
      facade,
      rateLimiter as IRateLimiter,
      { previewUrlPerMinute: 120 },
      logger,
    );

    const result = await service.issueUrl(actor, FILE_ID);

    expect(result).toBe(delivery);
    expect(facade.issueUrl).toHaveBeenCalledWith(actor, FILE_ID);
  });

  it('CA-10: una URL emitida registra preview.url_issued sin datos sensibles', async () => {
    const actor = createActor(ACTOR_ID, Role.CLIENT);

    const delivery = {
      file: {
        id: FILE_ID,
      },
      url: 'https://s3.test/preview?firma=secreta',
      expiresAt: new Date('2026-10-08T20:05:00.000Z'),
    };

    const facade = {
      issueUrl: jest.fn(async () => delivery),
    } as unknown as StoragePreviewFacade;

    const rateLimiter = {
      consume: jest.fn(async () => ({ allowed: true })),
    };

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new PreviewService(
      facade,
      rateLimiter as IRateLimiter,
      { previewUrlPerMinute: 120 },
      logger,
    );

    await service.issueUrl(actor, FILE_ID);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'preview.url_issued',
      fileId: FILE_ID,
    });
  });
  it.each([new NodeNotFoundError(), new PreviewUnsupportedError()])(
    'CA-10: $code registra preview.url_failed solo con código cerrado',
    async (failure) => {
      const actor = createActor(ACTOR_ID, Role.CLIENT);

      const facade = {
        issueUrl: jest.fn(async () => {
          throw failure;
        }),
      } as unknown as StoragePreviewFacade;

      const rateLimiter = {
        consume: jest.fn(async () => ({ allowed: true })),
      };

      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const service = new PreviewService(
        facade,
        rateLimiter as IRateLimiter,
        { previewUrlPerMinute: 120 },
        logger,
      );

      await expect(service.issueUrl(actor, FILE_ID)).rejects.toBe(failure);

      expect(logger.warn).toHaveBeenCalledWith({
        event: 'preview.url_failed',
        fileId: FILE_ID,
        code: failure.code,
      });
      expect(logger.info).not.toHaveBeenCalled();
    },
  );
  it.each(['facade', 'rateLimiter'] as const)(
    'CA-10: un fallo inesperado de %s se sanea antes del filtro global',
    async (source) => {
      const actor = createActor(ACTOR_ID, Role.CLIENT);
      const failure = new Error('falló https://example.test/file?X-Amz-Signature=SECRETO', {
        cause: new Error('contraseña y objectKey privados'),
      });

      const facade = {
        issueUrl: jest.fn(async () => {
          throw failure;
        }),
      } as unknown as StoragePreviewFacade;

      const rateLimiter = {
        consume: jest.fn(async () => {
          if (source === 'rateLimiter') throw failure;
          return { allowed: true };
        }),
      };

      const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const service = new PreviewService(
        facade,
        rateLimiter as IRateLimiter,
        { previewUrlPerMinute: 120 },
        logger,
      );

      const error: unknown = await service
        .issueUrl(actor, FILE_ID)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
      expect(error).not.toBe(failure);
      expect(error).not.toHaveProperty('cause');
      expect(String(error)).not.toContain('SECRETO');
      expect((error as Error).stack).not.toContain('SECRETO');
      if (source === 'rateLimiter') expect(facade.issueUrl).not.toHaveBeenCalled();

      expect(logger.error).toHaveBeenCalledWith({
        event: 'preview.url_failed',
        fileId: FILE_ID,
        reason: 'unexpected_error',
      });
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    },
  );
});

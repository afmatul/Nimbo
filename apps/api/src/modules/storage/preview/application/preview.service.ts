import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { StoragePreviewFacade, StorageTooManyRequestsError } from '../..';
import type { PreviewDelivery } from '../..';
import { DomainError, I_RATE_LIMITER, InsufficientRoleError, Role } from '../../../../shared';
import type { Actor, IRateLimiter } from '../../../../shared';

import { PREVIEW_CONFIG } from './preview-config';
import type { PreviewConfig } from './preview-config';

const RATE_LIMIT_WINDOW_SECONDS = 60;
const PREVIEW_RATE_KEY_PREFIX = 'storage:preview-url:';

@Injectable()
export class PreviewService {
  constructor(
    private readonly facade: StoragePreviewFacade,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(PREVIEW_CONFIG) private readonly config: PreviewConfig,
    @Inject(PinoLogger) private readonly logger: Pick<PinoLogger, 'info' | 'warn' | 'error'>,
  ) {}

  async issueUrl(actor: Actor, fileId: string): Promise<PreviewDelivery> {
    try {
      if (actor.role !== Role.CLIENT || actor.canReadContent !== true) {
        throw new InsufficientRoleError();
      }
      await this.assertWithinRate(actor, fileId);
      const delivery = await this.facade.issueUrl(actor, fileId);
      this.logger.info({ event: 'preview.url_issued', fileId });
      return delivery;
    } catch (error) {
      throw this.loggedFailure(fileId, error);
    }
  }

  private async assertWithinRate(actor: Actor, fileId: string): Promise<void> {
    const decision = await this.rateLimiter.consume(PREVIEW_RATE_KEY_PREFIX + actor.id, [
      { limit: this.config.previewUrlPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (!decision.allowed) {
      const error = new StorageTooManyRequestsError(decision.retryAfterSeconds);
      this.logger.warn({ event: 'preview.rate_limited', fileId, code: error.code });
      throw error;
    }
  }

  private loggedFailure(fileId: string, error: unknown): Error {
    if (error instanceof StorageTooManyRequestsError) return error;
    if (error instanceof DomainError) {
      this.logger.warn({ event: 'preview.url_failed', fileId, code: error.code });
      return error;
    }
    this.logger.error({ event: 'preview.url_failed', fileId, reason: 'unexpected_error' });
    // El filtro registra el Error recibido: jamás transportar message, stack, cause ni datos del SDK.
    return new Error('No se pudo emitir la URL de previsualización.');
  }
}

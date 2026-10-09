import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { StoragePreviewFacade } from '../..';
import type { PreviewDelivery } from '../..';
import { DomainError, I_RATE_LIMITER, InsufficientRoleError, Role } from '../../../../shared';
import type { Actor, IRateLimiter } from '../../../../shared';
import { PreviewTooManyRequestsError, PreviewUrlIssuanceError } from '../domain/preview-errors';

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
      if (actor.role !== Role.CLIENT) throw new InsufficientRoleError();
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
      const error = new PreviewTooManyRequestsError(decision.retryAfterSeconds);
      this.logger.warn({ event: 'preview.rate_limited', fileId, code: error.code });
      throw error;
    }
  }

  private loggedFailure(fileId: string, error: unknown): DomainError {
    if (error instanceof PreviewTooManyRequestsError) return error;
    if (error instanceof DomainError) {
      this.logger.warn({ event: 'preview.url_failed', fileId, code: error.code });
      return error;
    }
    this.logger.error({ event: 'preview.url_failed', fileId, reason: 'unexpected_error' });
    return new PreviewUrlIssuanceError();
  }
}

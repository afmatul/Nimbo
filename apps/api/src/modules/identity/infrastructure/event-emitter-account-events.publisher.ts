import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PinoLogger } from 'nestjs-pino';

import type { IdentityLogger } from '../application/identity-logger';
import type { IAccountEventsPublisher } from '../application/ports/i-account-events-publisher.port';
import { CLIENT_ACCOUNT_VERIFIED } from '../domain/client-account-verified.event';
import type { ClientAccountVerifiedEvent } from '../domain/client-account-verified.event';

/**
 * `IAccountEventsPublisher` con `@nestjs/event-emitter` en proceso (ADR-0019, plan §6.4). Se llama después del
 * commit; si un oyente lanza de forma síncrona, se registra y no se relanza: una verificación ya confirmada no se
 * convierte en `500`. La bitácora lleva solo `userId` (nunca el error, que puede traer datos del oyente).
 */
@Injectable()
export class EventEmitterAccountEventsPublisher implements IAccountEventsPublisher {
  constructor(
    private readonly emitter: EventEmitter2,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  clientAccountVerified(event: ClientAccountVerifiedEvent): void {
    const { userId, pendingPlanSlug } = event;
    try {
      this.emitter.emit(CLIENT_ACCOUNT_VERIFIED, { userId, pendingPlanSlug });
    } catch {
      this.logger.warn({ event: 'identity.account_verified.publish_failed', userId });
      return;
    }
    this.logger.info({ event: 'identity.account_verified.published', userId });
  }
}

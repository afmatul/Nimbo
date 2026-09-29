import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { MAX_AVISOS_INTENTO_24H } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER } from '../../../shared';
import type { IClock, IRateLimiter, RateLimitRule } from '../../../shared';
import type { MailMessage } from '../../notifications';
import type { User } from '../domain/user.entity';

import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import type { IdentityLogger } from './identity-logger';
import { registrationAttemptMail } from './mail/registration-attempt-mail.template';
import { WEB_PATHS, webUrl } from './web-links';

const SECONDS_PER_DAY = 86_400;
const ATTEMPT_NOTICE_TAG = 'identity.attempt-notice';
const ATTEMPT_NOTICE_RULES: readonly RateLimitRule[] = [
  { limit: MAX_AVISOS_INTENTO_24H, windowSeconds: SECONDS_PER_DAY },
];

/**
 * Aviso al dueño cuando alguien intenta registrar su correo (D-17, RN-10): como máximo `MAX_AVISOS_INTENTO_24H` en
 * 24 h por cuenta. Devuelve el correo a enviar después del commit, o `null` si el límite lo suprime. La respuesta al
 * solicitante no cambia en ningún caso.
 */
@Injectable()
export class RegistrationAttemptNotifier {
  constructor(
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  async maybeNotify(user: User): Promise<MailMessage | null> {
    const decision = await this.rateLimiter.consume(
      `identity:attempt-notice:${user.id}`,
      ATTEMPT_NOTICE_RULES,
    );
    if (!decision.allowed) {
      this.logger.info({
        event: 'identity.registration.attempt_notice_suppressed',
        userId: user.id,
      });
      return null;
    }
    this.logger.info({ event: 'identity.registration.attempt_notice_sent', userId: user.id });
    return {
      to: user.email.value,
      ...registrationAttemptMail({
        attemptedAt: this.clock.now(),
        loginUrl: webUrl(this.config, WEB_PATHS.login),
        passwordRecoveryUrl: webUrl(this.config, WEB_PATHS.passwordRecovery),
      }),
      idempotencyKey: `${ATTEMPT_NOTICE_TAG}.${randomUUID()}`,
      tag: ATTEMPT_NOTICE_TAG,
      recipientId: user.id,
    };
  }
}

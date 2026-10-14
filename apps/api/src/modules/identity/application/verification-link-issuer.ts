import { Inject, Injectable } from '@nestjs/common';
import { VERIFICATION_LINK_TTL_HOURS } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { IClock } from '../../../shared';
import type { MailMessage } from '../../notifications';
import type { ClientUser } from '../domain/client-user.entity';

import { issueAccountToken } from './account-token-issuer';
import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import { verificationMail } from './mail/verification-mail.template';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';
import { tokenLink, WEB_PATHS } from './web-links';

const MS_PER_HOUR = 3_600_000;
const VERIFICATION_TAG = 'identity.verification';

/**
 * Emite un enlace de verificación (plan §6.3): invalida los vigentes, guarda solo el hash del token nuevo y devuelve
 * el correo a enviar. El valor en claro solo vive en memoria y en el correo (R-2, CA-17). Debe llamarse dentro de la
 * transacción del caso de uso; el correo se envía después del commit. Lo reutiliza 002 (D-15).
 */
@Injectable()
export class VerificationLinkIssuer {
  constructor(
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  async issue(user: ClientUser): Promise<MailMessage> {
    const issued = await issueAccountToken(this.tokens, {
      userId: user.id,
      type: 'verificacion',
      issuedAt: this.clock.now(),
      ttlMs: VERIFICATION_LINK_TTL_HOURS * MS_PER_HOUR,
    });
    const verificationUrl = tokenLink(this.config, WEB_PATHS.verifyEmail, issued.value);
    return {
      to: user.email.value,
      ...verificationMail({ verificationUrl }),
      idempotencyKey: `${VERIFICATION_TAG}.${issued.id}`,
      tag: VERIFICATION_TAG,
      recipientId: user.id,
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_SETUP_LINK_TTL_HOURS } from '@nimbo/contracts';

import { I_CLOCK } from '../../../shared';
import type { IClock } from '../../../shared';
import type { MailMessage } from '../../notifications';
import type { InternalUser } from '../domain/internal-user.entity';

import { issueAccountToken } from './account-token-issuer';
import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import { internalInvitationMail } from './mail/internal-invitation-mail.template';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';
import { tokenLink, WEB_PATHS } from './web-links';

const MS_PER_HOUR = 3_600_000;
const INVITATION_TAG = 'identity.internal-invitation';

/**
 * Emite el enlace «Crear tu contraseña» de una cuenta interna (011 CA-5, CA-7), con la forma de
 * `VerificationLinkIssuer`: guarda solo el hash del token `alta_interna` y devuelve el correo a enviar. El valor en claro
 * solo vive en memoria y en el fragmento del enlace. Se llama dentro de la transacción del alta; el correo sale después
 * del commit.
 */
@Injectable()
export class AccountSetupLinkIssuer {
  constructor(
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
  ) {}

  async issue(user: InternalUser): Promise<MailMessage> {
    const issued = await issueAccountToken(this.tokens, {
      userId: user.id,
      type: 'alta_interna',
      issuedAt: this.clock.now(),
      ttlMs: ACCOUNT_SETUP_LINK_TTL_HOURS * MS_PER_HOUR,
    });
    const setupUrl = tokenLink(this.config, WEB_PATHS.accountSetup, issued.value);
    return {
      to: user.email.value,
      ...internalInvitationMail({ setupUrl }),
      idempotencyKey: `${INVITATION_TAG}.${issued.id}`,
      tag: INVITATION_TAG,
      recipientId: user.id,
    };
  }
}

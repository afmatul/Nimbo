import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import type { Env } from '../../shared';
import { NotificationsModule } from '../notifications';

import { IDENTITY_CONFIG } from './application/identity-config';
import type { IdentityConfig } from './application/identity-config';
import { I_ACCOUNT_EVENTS_PUBLISHER } from './application/ports/i-account-events-publisher.port';
import { I_PASSWORD_HASHER } from './application/ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './application/ports/i-user-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './application/ports/i-verification-token-repository.port';
import { RegistrationAttemptNotifier } from './application/registration-attempt-notifier';
import { RegistrationService } from './application/registration.service';
import { VerificationLinkIssuer } from './application/verification-link-issuer';
import { Argon2idHasher } from './infrastructure/argon2id.hasher';
import { EventEmitterAccountEventsPublisher } from './infrastructure/event-emitter-account-events.publisher';
import { TypeormUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { TypeormVerificationTokenRepository } from './infrastructure/persistence/typeorm-verification-token.repository';
import { AuthController } from './presentation/auth.controller';

/**
 * Módulo `identity` (plan §6.1, §6.8): registro y verificación del correo. `forRoot(env)` publica `IDENTITY_CONFIG`
 * con `WEB_PUBLIC_URL` y une cada puerto con su adaptador. Requiere en la raíz `EventEmitterModule.forRoot()` y
 * `ThrottlerModule.forRoot` con `IDENTITY_THROTTLERS`; `shared` aporta reloj, límites y transacciones (global).
 */
@Module({})
export class IdentityModule {
  static forRoot(env: Pick<Env, 'WEB_PUBLIC_URL'>): DynamicModule {
    const config: IdentityConfig = { webPublicUrl: env.WEB_PUBLIC_URL };
    return {
      module: IdentityModule,
      imports: [NotificationsModule],
      controllers: [AuthController],
      providers: [
        { provide: IDENTITY_CONFIG, useValue: config },
        { provide: I_USER_REPOSITORY, useClass: TypeormUserRepository },
        { provide: I_VERIFICATION_TOKEN_REPOSITORY, useClass: TypeormVerificationTokenRepository },
        { provide: I_PASSWORD_HASHER, useClass: Argon2idHasher },
        { provide: I_ACCOUNT_EVENTS_PUBLISHER, useClass: EventEmitterAccountEventsPublisher },
        VerificationLinkIssuer,
        RegistrationAttemptNotifier,
        RegistrationService,
      ],
    };
  }
}

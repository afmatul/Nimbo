import { Module } from '@nestjs/common';
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { I_ACCESS_TOKEN_VERIFIER } from '../../shared';
import type { Env } from '../../shared';
import { NotificationsModule } from '../notifications';

import { AccountAdministration } from './application/account-administration';
import { AccountDirectory } from './application/account-directory';
import { AuthService } from './application/auth.service';
import { IDENTITY_CONFIG, identityConfigFrom } from './application/identity-config';
import { InternalAccountEnrollment } from './application/internal-account-enrollment';
import { PasswordService } from './application/password.service';
import { I_ACCOUNT_DIRECTORY_REPOSITORY } from './application/ports/i-account-directory.repository.port';
import { I_ACCOUNT_EVENTS_PUBLISHER } from './application/ports/i-account-events-publisher.port';
import { I_ATTEMPT_LOCKOUT } from './application/ports/i-attempt-lockout.port';
import { I_DEVICE_REPOSITORY } from './application/ports/i-device-repository.port';
import { I_PASSWORD_HASHER } from './application/ports/i-password-hasher.port';
import { I_SESSION_REPOSITORY } from './application/ports/i-session-repository.port';
import { I_TOKEN_SERVICE } from './application/ports/i-token-service.port';
import { I_USER_REPOSITORY } from './application/ports/i-user-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './application/ports/i-verification-token-repository.port';
import { RegistrationAttemptNotifier } from './application/registration-attempt-notifier';
import { RegistrationService } from './application/registration.service';
import { SessionService } from './application/session.service';
import { VerificationLinkIssuer } from './application/verification-link-issuer';
import { Argon2idHasher } from './infrastructure/argon2id.hasher';
import { EventEmitterAccountEventsPublisher } from './infrastructure/event-emitter-account-events.publisher';
import { accessTokenOptionsProvider } from './infrastructure/jwt/access-token-options';
import { JwtTokenService } from './infrastructure/jwt/jwt-token.service';
import { JwtStrategy } from './infrastructure/jwt/jwt.strategy';
import { TypeOrmAccountDirectoryRepository } from './infrastructure/persistence/typeorm-account-directory.repository';
import { TypeOrmDeviceRepository } from './infrastructure/persistence/typeorm-device.repository';
import { TypeOrmSessionRepository } from './infrastructure/persistence/typeorm-session.repository';
import { TypeormUserRepository } from './infrastructure/persistence/typeorm-user.repository';
import { TypeormVerificationTokenRepository } from './infrastructure/persistence/typeorm-verification-token.repository';
import { RedisAttemptLockout } from './infrastructure/redis-attempt-lockout';
import { AuthController } from './presentation/auth.controller';
import { NoStoreMiddleware } from './presentation/no-store.middleware';
import { PasswordController } from './presentation/password.controller';
import { SessionsController } from './presentation/sessions.controller';

/** Lo que `IdentityModule.forRoot` lee del entorno validado. */
export type IdentityEnv = Pick<Env, 'WEB_PUBLIC_URL' | 'APP_ENV' | 'JWT_ACCESS_SECRET'>;

/**
 * Módulo `identity` (plan 001 §6.1, §6.8; plan 002 §6.8): registro, verificación, inicio de sesión, sesiones y
 * recuperación de contraseña.
 * `forRoot(env)` publica `IDENTITY_CONFIG` (`WEB_PUBLIC_URL` y `cookieSecure` desde `APP_ENV`) y
 * `ACCESS_TOKEN_OPTIONS`, une cada puerto con su adaptador y registra la `JwtStrategy` con el nombre
 * `ACCESS_TOKEN_STRATEGY`, que el `JwtAuthGuard` de `shared` encuentra sin importar `identity`. Exporta
 * `I_ACCESS_TOKEN_VERIFIER` (implementado por `JwtTokenService`) y las fachadas del backoffice (011 plan §2), sin
 * repositorios ni entidades. Requiere en la raíz `EventEmitterModule.forRoot()` y
 * `ThrottlerModule.forRoot` con `IDENTITY_THROTTLERS`; `shared` aporta reloj, Redis, límites y transacciones (global).
 * Todas las respuestas de `AuthController`, `PasswordController` y `SessionsController`, también las de error, llevan
 * `Cache-Control: no-store` (plan §5).
 */
@Module({})
export class IdentityModule implements NestModule {
  static forRoot(env: IdentityEnv): DynamicModule {
    return {
      module: IdentityModule,
      // El secreto no va en `JwtModule`: `JwtTokenService` lo pasa en cada llamada desde `ACCESS_TOKEN_OPTIONS`.
      imports: [NotificationsModule, JwtModule.register({}), PassportModule],
      controllers: [AuthController, PasswordController, SessionsController],
      providers: [
        { provide: IDENTITY_CONFIG, useValue: identityConfigFrom(env) },
        accessTokenOptionsProvider(env),
        { provide: I_USER_REPOSITORY, useClass: TypeormUserRepository },
        { provide: I_VERIFICATION_TOKEN_REPOSITORY, useClass: TypeormVerificationTokenRepository },
        { provide: I_SESSION_REPOSITORY, useClass: TypeOrmSessionRepository },
        { provide: I_DEVICE_REPOSITORY, useClass: TypeOrmDeviceRepository },
        { provide: I_PASSWORD_HASHER, useClass: Argon2idHasher },
        { provide: I_ACCOUNT_EVENTS_PUBLISHER, useClass: EventEmitterAccountEventsPublisher },
        { provide: I_ATTEMPT_LOCKOUT, useClass: RedisAttemptLockout },
        JwtTokenService,
        { provide: I_TOKEN_SERVICE, useExisting: JwtTokenService },
        { provide: I_ACCESS_TOKEN_VERIFIER, useExisting: JwtTokenService },
        JwtStrategy,
        VerificationLinkIssuer,
        RegistrationAttemptNotifier,
        RegistrationService,
        SessionService,
        AuthService,
        PasswordService,
        { provide: I_ACCOUNT_DIRECTORY_REPOSITORY, useClass: TypeOrmAccountDirectoryRepository },
        AccountDirectory,
        AccountAdministration,
        InternalAccountEnrollment,
      ],
      exports: [
        I_ACCESS_TOKEN_VERIFIER,
        AccountDirectory,
        AccountAdministration,
        InternalAccountEnrollment,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(NoStoreMiddleware)
      .forRoutes(AuthController, PasswordController, SessionsController);
  }
}

import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { SUPPORT_CONTACT_EMAIL } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { AccountStatus } from '../domain/account-status.enum';
import { EmailAddress } from '../domain/email-address.vo';
import {
  AccountSuspendedError,
  EmailNotVerifiedError,
  InvalidCredentialsError,
  LoginLockedError,
} from '../domain/errors';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';

import type { ClientContext } from './client-context';
import { LOGIN_LOCKOUT_POLICY, loginLockoutKey } from './identity-limit-keys';
import type { IdentityLogger } from './identity-logger';
import { I_ATTEMPT_LOCKOUT } from './ports/i-attempt-lockout.port';
import type { IAttemptLockout } from './ports/i-attempt-lockout.port';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { SessionService } from './session.service';
import type { OpenedSession } from './session.service';

const DUMMY_PASSWORD_BYTES = 32;

/** Motivo de `identity.login.failed` (plan §7). */
type LoginFailureReason = 'invalid_credentials' | 'email_not_verified' | 'account_suspended';

/** Inicio de sesión ya validado por `loginRequestSchema`; el correo aún sin normalizar. */
export interface LoginCommand {
  readonly email: string;
  readonly password: string;
}

/**
 * Inicio de sesión (plan 002 §6.3, design-model M1). Sin `actor`: es público. El bloqueo se consulta antes de buscar
 * la cuenta y un correo inexistente cuesta lo mismo que una contraseña incorrecta, así la respuesta no delata cuentas
 * (CA-2, CA-5, RN-2).
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: Promise<PasswordHash> | null = null;

  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_ATTEMPT_LOCKOUT) private readonly lockout: IAttemptLockout,
    @Inject(SessionService) private readonly sessions: Pick<SessionService, 'open'>,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /** Calcula el hash señuelo una sola vez, con los parámetros del hasher real (CA-2). */
  async onModuleInit(): Promise<void> {
    await this.dummyPasswordHash();
  }

  /** CA-1 a CA-5: devuelve las credenciales de la sesión nueva; el controlador escribe las cookies. */
  async login(command: LoginCommand, client: ClientContext): Promise<OpenedSession> {
    const email = EmailAddress.of(command.email);
    const key = loginLockoutKey(email);
    await this.enforceNotLocked(key);
    const user = await this.users.findByEmail(email);
    if (user === null) {
      await this.hasher.verify(await this.dummyPasswordHash(), command.password);
      return this.rejectCredentials(key, null);
    }
    if (!(await this.hasher.verify(user.passwordHash, command.password))) {
      return this.rejectCredentials(key, user);
    }
    this.enforceCanSignIn(user);
    // DT-4: un inicio de sesión correcto borra los fallos acumulados del correo.
    await this.lockout.clear(key);
    const opened = await this.sessions.open(user, client, 'login');
    this.logger.info({
      event: 'identity.login.succeeded',
      userId: user.id,
      sessionId: opened.sessionId,
      newDevice: opened.newDevice,
    });
    return opened;
  }

  /** Solo con la contraseña correcta (R-4, D-10); ninguno de los dos cuenta como fallo. */
  private enforceCanSignIn(user: User): void {
    if (user.status === AccountStatus.SUSPENDED) {
      this.logFailure('account_suspended', user);
      throw new AccountSuspendedError(SUPPORT_CONTACT_EMAIL);
    }
    if (!user.emailVerified) {
      this.logFailure('email_not_verified', user);
      throw new EmailNotVerifiedError();
    }
  }

  private logFailure(reason: LoginFailureReason, user: User | null): void {
    this.logger.info({
      event: 'identity.login.failed',
      reason,
      ...(user === null ? {} : { userId: user.id }),
    });
  }

  private async enforceNotLocked(key: string): Promise<void> {
    const state = await this.lockout.check(key);
    if (!state.locked) {
      return;
    }
    this.logger.warn({
      event: 'identity.login.locked',
      retryAfterSeconds: state.retryAfterSeconds,
    });
    throw new LoginLockedError(state.retryAfterSeconds);
  }

  /** El quinto fallo todavía responde credenciales inválidas; el sexto intento ya encuentra el bloqueo (CA-5). */
  private async rejectCredentials(key: string, user: User | null): Promise<never> {
    const state = await this.lockout.recordFailure(key, LOGIN_LOCKOUT_POLICY);
    this.logFailure('invalid_credentials', user);
    if (state.locked) {
      this.logger.warn({
        event: 'identity.lockout.engaged',
        scope: 'login',
        ...(user === null ? {} : { userId: user.id }),
      });
    }
    throw new InvalidCredentialsError();
  }

  private dummyPasswordHash(): Promise<PasswordHash> {
    this.dummyHash ??= this.hasher.hash(randomBytes(DUMMY_PASSWORD_BYTES).toString('base64url'));
    return this.dummyHash;
  }
}

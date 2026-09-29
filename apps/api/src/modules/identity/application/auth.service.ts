import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
} from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { EmailAddress } from '../domain/email-address.vo';
import { InvalidCredentialsError, LoginLockedError } from '../domain/errors';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';

import type { ClientContext } from './client-context';
import type { IdentityLogger } from './identity-logger';
import { I_ATTEMPT_LOCKOUT } from './ports/i-attempt-lockout.port';
import type { IAttemptLockout, LockoutPolicy } from './ports/i-attempt-lockout.port';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { SessionService } from './session.service';
import type { OpenedSession } from './session.service';

const SECONDS_PER_MINUTE = 60;
const DUMMY_PASSWORD_BYTES = 32;

/** D-5: 5 fallos por correo normalizado en 15 min bloquean 15 min, exista o no la cuenta. */
const LOGIN_POLICY: LockoutPolicy = {
  maxFailures: LOGIN_MAX_FAILURES,
  windowSeconds: LOGIN_FAILURE_WINDOW_MINUTES * SECONDS_PER_MINUTE,
  lockSeconds: LOGIN_LOCK_MINUTES * SECONDS_PER_MINUTE,
};

/** Inicio de sesión ya validado por `loginRequestSchema`; el correo aún sin normalizar. */
export interface LoginCommand {
  readonly email: string;
  readonly password: string;
}

/** La clave lleva el SHA-256 del correo, nunca el correo (plan §6.4). */
const loginLockoutKey = (email: EmailAddress): string =>
  `identity:lockout:login:${createHash('sha256').update(email.value).digest('hex')}`;

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

  async login(command: LoginCommand, _client: ClientContext): Promise<OpenedSession> {
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
    throw new Error('Inicio de sesión con la contraseña correcta: pendiente de T-35.');
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
    const state = await this.lockout.recordFailure(key, LOGIN_POLICY);
    const account = user === null ? {} : { userId: user.id };
    this.logger.info({ event: 'identity.login.failed', reason: 'invalid_credentials', ...account });
    if (state.locked) {
      this.logger.warn({ event: 'identity.lockout.engaged', scope: 'login', ...account });
    }
    throw new InvalidCredentialsError();
  }

  private dummyPasswordHash(): Promise<PasswordHash> {
    this.dummyHash ??= this.hasher.hash(randomBytes(DUMMY_PASSWORD_BYTES).toString('base64url'));
    return this.dummyHash;
  }
}

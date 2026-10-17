import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { IClock, ITransactionRunner } from '../../../shared';
import { AccountStatus } from '../domain/account-status.enum';
import {
  IdentityWeakPasswordError,
  SetupLinkExpiredError,
  SetupLinkInvalidError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';
import type { VerificationToken } from '../domain/verification-token.entity';

import { findAccountToken } from './account-token-lookup';
import type { IdentityLogger } from './identity-logger';
import { weakPasswordIssues } from './password-policy-issues';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';

/** Primera contraseña ya validada por `accountSetupRequestSchema` (sin la regla «igual al correo»). */
export interface SetFirstPasswordCommand {
  readonly token: string;
  readonly password: string;
}

/** Campo que marca `IdentityWeakPasswordError` en `POST /auth/account-setup`. */
const PASSWORD_FIELD = 'password';
const REJECTED = 'identity.account_setup.rejected';
const COMPLETED = 'identity.account_setup.completed';

type RejectionReason = 'expired' | 'invalid' | 'weak';

/** El enlace vigente y la cuenta interna activa a la que apunta. */
interface SetupTarget {
  readonly token: VerificationToken;
  readonly account: InternalUser;
}

/** Solo una cuenta interna `activa` usa su enlace de alta (RN-7: suspendida, ni lo revisa ni fija la contraseña). */
const canSetFirstPassword = (account: User | null): account is InternalUser =>
  account instanceof InternalUser && account.status === AccountStatus.ACTIVE;

/**
 * Enlace de alta interna (011 CA-5): revisarlo y fijar con él la primera contraseña. Público, sin `actor`. Reutiliza el
 * modelo de 002 (token de 256 bits, solo hash, consumo atómico); no toca sesiones (la cuenta nunca abrió una). Las
 * bitácoras, como las de la recuperación, identifican la cuenta solo por su `userId`.
 */
@Injectable()
export class AccountSetupService {
  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /** Al abrir el enlace se revisa sin consumirlo, también que la cuenta siga activa. */
  async checkLink(tokenValue: string): Promise<void> {
    await this.findSetupTarget(tokenValue);
  }

  /** Una contraseña débil deja el enlace vigente; el hash se calcula fuera de la transacción, como en 002. */
  async setFirstPassword(command: SetFirstPasswordCommand): Promise<void> {
    const { token, account } = await this.findSetupTarget(command.token);
    this.enforceStrongPassword(command.password, account);
    const passwordHash = await this.hasher.hash(command.password);
    const applied = await this.transactions.run(() => this.applyInTransaction(token, passwordHash));
    if (!applied) {
      return this.reject('invalid', account.id);
    }
    this.logger.info({ event: COMPLETED, userId: account.id });
  }

  private async findSetupTarget(tokenValue: string): Promise<SetupTarget> {
    const token = await this.findValidToken(tokenValue);
    const account = await this.users.findById(token.userId);
    if (!canSetFirstPassword(account)) {
      return this.reject('invalid', token.userId);
    }
    return { token, account };
  }

  /** Mal formado, desconocido, de otro tipo, usado o reemplazado → inválido; pasadas las 24 h → vencido. */
  private async findValidToken(tokenValue: string): Promise<VerificationToken> {
    const token = await findAccountToken(this.tokens, tokenValue, 'alta_interna');
    if (token === null) {
      return this.reject('invalid');
    }
    const state = token.stateAt(this.clock.now());
    if (state === 'valid') {
      return token;
    }
    return this.reject(state === 'expired' ? 'expired' : 'invalid', token.userId);
  }

  private enforceStrongPassword(password: string, account: InternalUser): void {
    const issues = weakPasswordIssues(password, account.email, PASSWORD_FIELD);
    if (issues.length > 0) {
      this.logRejection('weak', account.id);
      throw new IdentityWeakPasswordError(issues);
    }
  }

  /**
   * `false` si, con la fila bloqueada, la cuenta ya no está activa o si otro envío consumió el enlace antes (consumo
   * atómico); entonces nada cambia.
   */
  private async applyInTransaction(token: VerificationToken, hash: PasswordHash): Promise<boolean> {
    const account = await this.users.findByIdForUpdate(token.userId);
    if (!canSetFirstPassword(account) || !(await this.tokens.consume(token.id, this.clock.now()))) {
      return false;
    }
    await this.users.updatePasswordHash(account.id, account.setFirstPassword(hash).passwordHash);
    return true;
  }

  private reject(reason: Exclude<RejectionReason, 'weak'>, userId?: string): never {
    this.logRejection(reason, userId);
    throw reason === 'expired' ? new SetupLinkExpiredError() : new SetupLinkInvalidError();
  }

  private logRejection(reason: RejectionReason, userId?: string): void {
    this.logger.info({ event: REJECTED, reason, ...(userId === undefined ? {} : { userId }) });
  }
}

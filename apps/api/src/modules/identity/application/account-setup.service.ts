import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { IClock, ITransactionRunner } from '../../../shared';
import {
  IdentityWeakPasswordError,
  SetupLinkExpiredError,
  SetupLinkInvalidError,
} from '../domain/errors';
import { InternalUser } from '../domain/internal-user.entity';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { VerificationToken } from '../domain/verification-token.entity';

import { findAccountToken } from './account-token-lookup';
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

/**
 * Enlace de alta interna (011 CA-5): revisarlo y fijar con él la primera contraseña. Público, sin `actor`. Reutiliza el
 * modelo de 002 (token de 256 bits, solo hash, consumo atómico); no toca sesiones (la cuenta nunca abrió una).
 */
@Injectable()
export class AccountSetupService {
  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  /** Al abrir el enlace se revisa sin consumirlo. */
  async checkLink(tokenValue: string): Promise<void> {
    await this.findValidToken(tokenValue);
  }

  /** Una contraseña débil deja el enlace vigente; el hash se calcula fuera de la transacción, como en 002. */
  async setFirstPassword(command: SetFirstPasswordCommand): Promise<void> {
    const token = await this.findValidToken(command.token);
    const user = await this.users.findById(token.userId);
    if (!(user instanceof InternalUser)) {
      throw new SetupLinkInvalidError();
    }
    const issues = weakPasswordIssues(command.password, user.email, PASSWORD_FIELD);
    if (issues.length > 0) {
      throw new IdentityWeakPasswordError(issues);
    }
    const passwordHash = await this.hasher.hash(command.password);
    await this.transactions.run(() => this.applyInTransaction(token, passwordHash));
  }

  /** Mal formado, desconocido, de otro tipo, usado o reemplazado → inválido; pasadas las 24 h → vencido. */
  private async findValidToken(tokenValue: string): Promise<VerificationToken> {
    const token = await findAccountToken(this.tokens, tokenValue, 'alta_interna');
    if (token === null) {
      throw new SetupLinkInvalidError();
    }
    const state = token.stateAt(this.clock.now());
    if (state === 'expired') {
      throw new SetupLinkExpiredError();
    }
    if (state !== 'valid') {
      throw new SetupLinkInvalidError();
    }
    return token;
  }

  /** Si otro envío consumió el enlace antes, inválido y nada cambia (consumo atómico). */
  private async applyInTransaction(token: VerificationToken, hash: PasswordHash): Promise<void> {
    const user = await this.users.findByIdForUpdate(token.userId);
    if (
      !(user instanceof InternalUser) ||
      !(await this.tokens.consume(token.id, this.clock.now()))
    ) {
      throw new SetupLinkInvalidError();
    }
    await this.users.updatePasswordHash(user.id, user.setFirstPassword(hash).passwordHash);
  }
}

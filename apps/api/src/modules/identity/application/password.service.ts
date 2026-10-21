import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { RESET_LINK_TTL_MINUTES } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner } from '../../../shared';
import { I_MAILER } from '../../notifications';
import type { IMailer, MailMessage } from '../../notifications';
import { ClientUser } from '../domain/client-user.entity';
import { EmailAddress } from '../domain/email-address.vo';
import {
  IdentityTooManyRequestsError,
  IdentityWeakPasswordError,
  PasswordChangeLockedError,
  ResetLinkExpiredError,
  ResetLinkInvalidError,
  WrongPasswordError,
} from '../domain/errors';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';
import type { VerificationToken } from '../domain/verification-token.entity';

import { issueAccountToken } from './account-token-issuer';
import { findAccountToken } from './account-token-lookup';
import { IDENTITY_CONFIG } from './identity-config';
import type { IdentityConfig } from './identity-config';
import {
  EMAIL_REQUEST_RULES,
  loginLockoutKey,
  PASSWORD_CHANGE_LOCKOUT_POLICY,
  passwordChangeLockoutKey,
  passwordResetRequestKey,
} from './identity-limit-keys';
import type { IdentityLogger } from './identity-logger';
import { passwordChangedMail } from './mail/password-changed-mail.template';
import { passwordResetMail } from './mail/password-reset-mail.template';
import { logMassRevocation } from './mass-session-revocation';
import { weakPasswordIssues } from './password-policy-issues';
import { I_ATTEMPT_LOCKOUT } from './ports/i-attempt-lockout.port';
import type { IAttemptLockout } from './ports/i-attempt-lockout.port';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_SESSION_REPOSITORY } from './ports/i-session-repository.port';
import type { ISessionRepository } from './ports/i-session-repository.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';
import { VerificationLinkIssuer } from './verification-link-issuer';
import { tokenLink, WEB_PATHS, webUrl } from './web-links';

const MS_PER_MINUTE = 60_000;
const RESET_TAG = 'identity.password-reset';
const CHANGED_TAG = 'identity.password-changed';
const REQUESTED = 'identity.password_reset.requested';
const REJECTED = 'identity.password_reset.rejected';
const CHANGE_REJECTED = 'identity.password_change.rejected';

/** Pedido de recuperación ya validado por `forgotPasswordRequestSchema`; el correo aún sin normalizar. */
export interface RequestResetCommand {
  readonly email: string;
}

/** Restablecimiento ya validado por `resetPasswordRequestSchema` (sin la regla «igual al correo», CA-21). */
export interface ResetPasswordCommand {
  readonly token: string;
  readonly password: string;
}

/** Qué se hizo con un pedido de recuperación (plan §7, `identity.password_reset.requested`). */
type RequestKind = 'reset_link' | 'verification_link' | 'ignored';

/** Lo que deja la transacción del pedido: la bitácora y el correo, ambos después del commit. */
interface RequestOutcome {
  readonly kind: RequestKind;
  readonly userId?: string;
  readonly mail: MailMessage | null;
}

type RejectionReason = 'expired' | 'invalid' | 'weak';

/** Cambio de contraseña ya validado por `changePasswordRequestSchema` (sin la regla «igual al correo», CA-22). */
export interface ChangePasswordCommand {
  readonly currentPassword: string;
  readonly newPassword: string;
}

/** Campo que marca `IdentityWeakPasswordError` y evento que registra el rechazo, según la ruta (plan §5, §7). */
interface NewPasswordTarget {
  readonly field: string;
  readonly rejectedEvent: string;
}

const RESET_TARGET: NewPasswordTarget = { field: 'password', rejectedEvent: REJECTED };
const CHANGE_TARGET: NewPasswordTarget = { field: 'newPassword', rejectedEvent: CHANGE_REJECTED };

/**
 * Recuperación y cambio de contraseña (plan 002 §6.3, design-model M1). Pedir el enlace, revisarlo y aplicarlo son
 * públicos, sin `actor`; el pedido responde igual exista o no la cuenta y aplica el límite antes de buscarla (CA-18).
 * El cambio recibe el `actor` y solo toca su propia cuenta. Los correos, las bitácoras y la limpieza de bloqueos van
 * después del commit.
 */
@Injectable()
export class PasswordService {
  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_MAILER) private readonly mailer: IMailer,
    @Inject(I_ATTEMPT_LOCKOUT) private readonly lockout: IAttemptLockout,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityConfig,
    private readonly verificationLinks: VerificationLinkIssuer,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /** CA-18: enlace de 1 hora a la cuenta verificada (cliente o interna, también suspendida, DT-6); nada si no existe. */
  async requestReset(command: RequestResetCommand): Promise<void> {
    const email = EmailAddress.of(command.email);
    await this.enforceRequestLimit(email);
    const outcome = await this.transactions.run(() => this.requestInTransaction(email));
    this.logger.info({
      event: REQUESTED,
      kind: outcome.kind,
      ...(outcome.userId === undefined ? {} : { userId: outcome.userId }),
    });
    if (outcome.mail !== null) {
      await this.mailer.send(outcome.mail);
    }
  }

  /** CA-20: al abrir el enlace se revisa sin consumirlo. */
  async checkResetLink(tokenValue: string): Promise<void> {
    await this.findValidResetToken(tokenValue, this.clock.now());
  }

  /**
   * CA-19 a CA-21: cambia la contraseña y revoca **todas** las sesiones (RN-6). Sin sesión nueva: la persona entra
   * con la contraseña nueva. Una contraseña débil deja el enlace vigente.
   */
  async resetPassword(command: ResetPasswordCommand): Promise<void> {
    const token = await this.findValidResetToken(command.token, this.clock.now());
    const user = await this.users.findById(token.userId);
    if (user === null) {
      return this.reject('invalid', token.userId);
    }
    this.enforceStrongPassword(command.password, user, RESET_TARGET);
    // Fuera de la transacción: el hash tarda ~100 ms que no deben retener los bloqueos de fila.
    const passwordHash = await this.hasher.hash(command.password);
    const now = this.clock.now();
    const revokedCount = await this.transactions.run(() =>
      this.resetInTransaction(token, passwordHash, now),
    );
    if (revokedCount === null) {
      return this.reject('invalid', user.id);
    }
    await this.completeReset(user, revokedCount, now);
  }

  /**
   * CA-22, CA-23: cambia la contraseña de la propia cuenta (cualquier rol) y revoca las **demás** sesiones; la actual
   * sigue abierta. El intento se reserva en el bloqueo antes de comprobar la contraseña actual y nunca cierra la
   * sesión (D-7).
   */
  async changePassword(
    actor: Actor,
    currentSessionId: string,
    command: ChangePasswordCommand,
  ): Promise<void> {
    const user = await this.verifyCurrentPassword(actor.id, command.currentPassword);
    this.enforceStrongPassword(command.newPassword, user, CHANGE_TARGET);
    // Fuera de la transacción, como al restablecer.
    const passwordHash = await this.hasher.hash(command.newPassword);
    const now = this.clock.now();
    const revokedCount = await this.transactions.run(async () => {
      await this.users.updatePasswordHash(user.id, passwordHash);
      return this.sessions.revokeAllExcept(user.id, currentSessionId, now);
    });
    await this.completeChange(user, revokedCount, now);
  }

  /** El límite va antes de cualquier consulta, así la secuencia 202/429 no delata la cuenta (CA-18). */
  private async enforceRequestLimit(email: EmailAddress): Promise<void> {
    const decision = await this.rateLimiter.consume(
      passwordResetRequestKey(email),
      EMAIL_REQUEST_RULES,
    );
    if (decision.allowed) {
      return;
    }
    this.logger.warn({
      event: 'identity.rate_limited',
      scope: 'password_reset',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    throw new IdentityTooManyRequestsError(decision.retryAfterSeconds, 'password_reset');
  }

  private async requestInTransaction(email: EmailAddress): Promise<RequestOutcome> {
    const user = await this.users.findByEmailForUpdate(email);
    if (user === null) {
      // Sin `userId`: el correo no tiene cuenta y la bitácora no debe delatar nada más.
      return { kind: 'ignored', mail: null };
    }
    if (user instanceof ClientUser && !user.emailVerified) {
      return this.resendVerification(user);
    }
    return { kind: 'reset_link', userId: user.id, mail: await this.issueResetLink(user) };
  }

  /**
   * D-15, DT-7: la cuenta sin verificar recibe un enlace de verificación nuevo. No consulta ni gasta el límite de 001:
   * el de recuperación, ya gastado antes de buscar la cuenta, es el único que la acota (SEC-1).
   */
  private async resendVerification(user: ClientUser): Promise<RequestOutcome> {
    return {
      kind: 'verification_link',
      userId: user.id,
      mail: await this.verificationLinks.issue(user),
    };
  }

  /** Invalida los enlaces vigentes y guarda solo el hash del nuevo; el valor en claro solo va en el correo (D-6). */
  private async issueResetLink(user: User): Promise<MailMessage> {
    const issued = await issueAccountToken(this.tokens, {
      userId: user.id,
      type: 'recuperacion',
      issuedAt: this.clock.now(),
      ttlMs: RESET_LINK_TTL_MINUTES * MS_PER_MINUTE,
    });
    const resetUrl = tokenLink(this.config, WEB_PATHS.passwordReset, issued.value);
    return this.mailTo(
      user,
      `${RESET_TAG}.${issued.id}`,
      RESET_TAG,
      passwordResetMail({ resetUrl }),
    );
  }

  /** Mal formado, desconocido, de otro tipo, usado o reemplazado → inválido; pasada la hora → vencido (CA-20). */
  private async findValidResetToken(tokenValue: string, now: Date): Promise<VerificationToken> {
    const token = await findAccountToken(this.tokens, tokenValue, 'recuperacion');
    if (token === null) {
      return this.reject('invalid');
    }
    const state = token.stateAt(now);
    if (state === 'valid') {
      return token;
    }
    return this.reject(state === 'expired' ? 'expired' : 'invalid', token.userId);
  }

  /** CA-21, CA-22: la política D-6 de 001 con el correo de la cuenta, que el esquema no conoce. */
  private enforceStrongPassword(password: string, user: User, target: NewPasswordTarget): void {
    const issues = weakPasswordIssues(password, user.email, target.field);
    if (issues.length > 0) {
      this.logRejection(target.rejectedEvent, 'weak', user.id);
      throw new IdentityWeakPasswordError(issues);
    }
  }

  /**
   * CA-23, I-1: el intento cuenta como fallo **antes** de verificar, en un paso atómico, así una ráfaga concurrente no
   * prueba más de 5 contraseñas. Bloqueado → rechazo aunque la actual sea correcta. Devuelve si este intento, el
   * quinto, activó el bloqueo.
   */
  private async reserveChangeAttempt(userId: string): Promise<boolean> {
    const reservation = await this.lockout.reserveAttempt(
      passwordChangeLockoutKey(userId),
      PASSWORD_CHANGE_LOCKOUT_POLICY,
    );
    if (reservation.allowed) {
      return reservation.engagedLock;
    }
    this.logRejection(CHANGE_REJECTED, 'locked', userId);
    throw new PasswordChangeLockedError(reservation.retryAfterSeconds);
  }

  /** CA-23: el quinto fallo todavía responde `WrongPasswordError`; un acierto libera la reserva y los fallos previos. */
  private async verifyCurrentPassword(userId: string, currentPassword: string): Promise<User> {
    const engagedLock = await this.reserveChangeAttempt(userId);
    const user = await this.users.findById(userId);
    if (user !== null && (await this.hasher.verify(user.passwordHash, currentPassword))) {
      await this.lockout.clear(passwordChangeLockoutKey(userId));
      return user;
    }
    this.logRejection(CHANGE_REJECTED, 'wrong_password', userId);
    if (engagedLock) {
      this.logger.warn({ event: 'identity.lockout.engaged', scope: 'password_change', userId });
    }
    throw new WrongPasswordError();
  }

  /**
   * `null` si otro envío consumió el enlace antes (consumo atómico, CA-20); si no, las sesiones revocadas. También
   * invalida la invitación de alta pendiente de una cuenta interna (011 RN-7): ya tiene contraseña.
   */
  private async resetInTransaction(
    token: VerificationToken,
    passwordHash: PasswordHash,
    now: Date,
  ): Promise<number | null> {
    const user = await this.users.findByIdForUpdate(token.userId);
    if (user === null || !(await this.tokens.consume(token.id, now))) {
      return null;
    }
    await this.users.updatePasswordHash(user.id, passwordHash);
    await this.tokens.invalidateActive(user.id, 'alta_interna', now);
    return this.sessions.revokeAllExcept(user.id, null, now);
  }

  /** Después del commit: quita los dos bloqueos (D-6, DT-5), registra y avisa «Tu contraseña cambió». */
  private async completeReset(user: User, revokedCount: number, changedAt: Date): Promise<void> {
    await this.lockout.clear(loginLockoutKey(user.email));
    await this.lockout.clear(passwordChangeLockoutKey(user.id));
    logMassRevocation(this.logger, {
      userId: user.id,
      reason: 'password_reset',
      count: revokedCount,
    });
    this.logger.info({ event: 'identity.password_reset.completed', userId: user.id, revokedCount });
    await this.sendPasswordChangedMail(user, changedAt);
  }

  /** CA-22, después del commit: registra y avisa «Tu contraseña cambió» (el bloqueo ya se quitó al verificar). */
  private async completeChange(user: User, revokedCount: number, changedAt: Date): Promise<void> {
    logMassRevocation(this.logger, {
      userId: user.id,
      reason: 'password_change',
      count: revokedCount,
    });
    this.logger.info({ event: 'identity.password.changed', userId: user.id, revokedCount });
    await this.sendPasswordChangedMail(user, changedAt);
  }

  private async sendPasswordChangedMail(user: User, changedAt: Date): Promise<void> {
    await this.mailer.send(
      this.mailTo(
        user,
        `${CHANGED_TAG}.${randomUUID()}`,
        CHANGED_TAG,
        passwordChangedMail({
          changedAt,
          passwordRecoveryUrl: webUrl(this.config, WEB_PATHS.passwordRecovery),
        }),
      ),
    );
  }

  private reject(reason: Exclude<RejectionReason, 'weak'>, userId?: string): never {
    this.logRejection(REJECTED, reason, userId);
    throw reason === 'expired' ? new ResetLinkExpiredError() : new ResetLinkInvalidError();
  }

  private logRejection(event: string, reason: string, userId?: string): void {
    this.logger.info({ event, reason, ...(userId === undefined ? {} : { userId }) });
  }

  private mailTo(
    user: User,
    idempotencyKey: string,
    tag: string,
    content: Pick<MailMessage, 'subject' | 'text' | 'html'>,
  ): MailMessage {
    return { to: user.email.value, ...content, idempotencyKey, tag, recipientId: user.id };
  }
}

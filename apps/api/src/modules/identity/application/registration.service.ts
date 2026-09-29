import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  LEGAL_DOCUMENTS,
} from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_RATE_LIMITER, I_TRANSACTION_RUNNER } from '../../../shared';
import type { IClock, IRateLimiter, ITransactionRunner, RateLimitRule } from '../../../shared';
import { I_MAILER } from '../../notifications';
import type { IMailer, MailMessage } from '../../notifications';
import { ClientUser } from '../domain/client-user.entity';
import { EmailAddress } from '../domain/email-address.vo';
import {
  IdentityTooManyRequestsError,
  VerificationLinkExpiredError,
  VerificationLinkInvalidError,
} from '../domain/errors';
import { LegalAcceptance } from '../domain/legal-acceptance.vo';
import { OpaqueToken } from '../domain/opaque-token.vo';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';
import type { VerificationToken } from '../domain/verification-token.entity';

import type { IdentityLogger } from './identity-logger';
import { I_ACCOUNT_EVENTS_PUBLISHER } from './ports/i-account-events-publisher.port';
import type { IAccountEventsPublisher } from './ports/i-account-events-publisher.port';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { I_VERIFICATION_TOKEN_REPOSITORY } from './ports/i-verification-token-repository.port';
import type { IVerificationTokenRepository } from './ports/i-verification-token-repository.port';
import { RegistrationAttemptNotifier } from './registration-attempt-notifier';
import { VerificationLinkIssuer } from './verification-link-issuer';

const SECONDS_PER_HOUR = 3600;
/** D-8: una solicitud cada 60 s y 5 por hora por correo, contando juntos el registro y el reenvío (CA-15). */
const EMAIL_REQUEST_RULES: readonly RateLimitRule[] = [
  { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
  { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
];
const VERIFICATION_REJECTED = 'identity.verification.rejected';
/** Transacciones de alta: la original y un reintento si el alta chocó y la cuenta no aparece (plan §6.3). */
const MAX_REGISTRATION_RUNS = 2;

/** Registro ya validado por `registerRequestSchema` (la casilla de términos ya es `true`); el correo aún sin normalizar. */
export interface RegisterCommand {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
}

/** Reenvío ya validado por `resendVerificationRequestSchema`. */
export interface ResendVerificationCommand {
  readonly email: string;
}

interface Registration {
  readonly fullName: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
}

/** Resultado de abrir un enlace de verificación; `VERIFIED` ocurre una sola vez por cuenta (CA-8, CA-29 d). */
export type VerifyEmailResult =
  | { readonly outcome: 'VERIFIED'; readonly userId: string }
  | { readonly outcome: 'ALREADY_VERIFIED' };

/** Lo que decide la transacción de verificación; bitácora, error y evento van después del commit. */
type VerificationDecision =
  | { readonly kind: 'verified'; readonly userId: string }
  | { readonly kind: 'already_verified'; readonly userId: string }
  | { readonly kind: 'rejected'; readonly reason: 'invalid' | 'expired'; readonly userId: string };

/** Lo que deja una transacción: la bitácora y el correo a enviar, ambos después del commit. */
interface Outcome {
  readonly log: Record<string, unknown>;
  readonly mail: MailMessage | null;
}

/**
 * Registro de cuentas de cliente y verificación del correo (plan §6.3, design-model M1). Sin `actor`: las tres
 * operaciones son públicas. Los correos y el evento de cuenta verificada salen solo después del commit, así nunca
 * sale un enlace ni un evento de una transacción revertida.
 */
@Injectable()
export class RegistrationService {
  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: IVerificationTokenRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_MAILER) private readonly mailer: IMailer,
    @Inject(I_ACCOUNT_EVENTS_PUBLISHER) private readonly events: IAccountEventsPublisher,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_CLOCK) private readonly clock: IClock,
    private readonly linkIssuer: VerificationLinkIssuer,
    private readonly attemptNotifier: RegistrationAttemptNotifier,
    @Inject(PinoLogger) private readonly logger: IdentityLogger,
  ) {}

  /** CA-1 a CA-4: la respuesta es la misma exista o no la cuenta; el hash se calcula siempre (spec §10). */
  async register(command: RegisterCommand): Promise<void> {
    const email = EmailAddress.of(command.email);
    await this.enforceEmailRequestLimit(email);
    const registration: Registration = {
      fullName: command.fullName.trim(),
      email,
      passwordHash: await this.hasher.hash(command.password),
    };
    const outcome = await this.runRegistration(registration);
    await this.complete(outcome);
  }

  /** CA-13, CA-14: solo un cliente sin verificar recibe enlace; el resto, la misma respuesta sin efecto. */
  async resendVerification(command: ResendVerificationCommand): Promise<void> {
    const email = EmailAddress.of(command.email);
    await this.enforceEmailRequestLimit(email);
    const outcome = await this.transactions.run(() => this.resendInTransaction(email));
    await this.complete(outcome);
  }

  private async resendInTransaction(email: EmailAddress): Promise<Outcome> {
    const user = await this.users.findByEmailForUpdate(email);
    if (!(user instanceof ClientUser) || user.emailVerified) {
      // Sin `userId`: el correo puede no existir y la bitácora no debe distinguir los casos (CA-14).
      return { log: { event: 'identity.verification.resend_ignored' }, mail: null };
    }
    return {
      log: { event: 'identity.verification.resend_requested', userId: user.id },
      mail: await this.linkIssuer.issue(user),
    };
  }

  /**
   * CA-8 a CA-12, CA-29 d: la fila bloqueada de la cuenta serializa las aperturas simultáneas, así que solo una llega
   * a `VERIFIED` y el evento se publica una vez, después del commit.
   */
  async verifyEmail(tokenValue: string): Promise<VerifyEmailResult> {
    const token = await this.findVerificationToken(tokenValue);
    if (token === null) {
      // Sin `userId`: el token no existía (plan §7).
      this.logger.info({ event: VERIFICATION_REJECTED, reason: 'invalid' });
      throw new VerificationLinkInvalidError();
    }
    const decision = await this.transactions.run(() => this.verifyInTransaction(token));
    return this.completeVerification(decision);
  }

  /** `null` si el valor está mal formado (sin consultar, CA-11 b), no existe o es de otro tipo (CA-12). */
  private async findVerificationToken(tokenValue: string): Promise<VerificationToken | null> {
    if (!OpaqueToken.isWellFormed(tokenValue)) {
      return null;
    }
    const token = await this.tokens.findByHash(OpaqueToken.hashOf(tokenValue), 'verificacion');
    return token !== null && OpaqueToken.matchesHash(tokenValue, token.tokenHash) ? token : null;
  }

  private async verifyInTransaction(token: VerificationToken): Promise<VerificationDecision> {
    const user = await this.users.findByIdForUpdate(token.userId);
    if (!(user instanceof ClientUser)) {
      return { kind: 'rejected', reason: 'invalid', userId: token.userId };
    }
    if (user.emailVerified) {
      return { kind: 'already_verified', userId: user.id };
    }
    const now = this.clock.now();
    const state = token.stateAt(now);
    if (state !== 'valid') {
      return {
        kind: 'rejected',
        reason: state === 'expired' ? 'expired' : 'invalid',
        userId: user.id,
      };
    }
    if (!(await this.tokens.consume(token.id, now))) {
      return { kind: 'already_verified', userId: user.id };
    }
    await this.users.update(user.verifyEmail());
    await this.tokens.invalidateActive(user.id, 'verificacion', now);
    return { kind: 'verified', userId: user.id };
  }

  /** Después del commit: bitácora y, según la decisión, el evento o el error público. */
  private completeVerification(decision: VerificationDecision): VerifyEmailResult {
    const { userId } = decision;
    if (decision.kind === 'verified') {
      this.logger.info({ event: 'identity.verification.succeeded', userId });
      this.events.clientAccountVerified({ userId });
      return { outcome: 'VERIFIED', userId };
    }
    if (decision.kind === 'already_verified') {
      this.logger.info({ event: VERIFICATION_REJECTED, reason: 'already_verified', userId });
      return { outcome: 'ALREADY_VERIFIED' };
    }
    this.logger.info({ event: VERIFICATION_REJECTED, reason: decision.reason, userId });
    throw decision.reason === 'expired'
      ? new VerificationLinkExpiredError()
      : new VerificationLinkInvalidError();
  }

  /** El límite va antes de cualquier consulta, así la secuencia 202/429 no delata la cuenta (D-8, CA-15). */
  private async enforceEmailRequestLimit(email: EmailAddress): Promise<void> {
    const key = `identity:email-request:${createHash('sha256').update(email.value).digest('hex')}`;
    const decision = await this.rateLimiter.consume(key, EMAIL_REQUEST_RULES);
    if (decision.allowed) {
      return;
    }
    this.logger.warn({
      event: 'identity.rate_limited',
      scope: 'email',
      retryAfterSeconds: decision.retryAfterSeconds,
    });
    throw new IdentityTooManyRequestsError(decision.retryAfterSeconds, 'email');
  }

  private async runRegistration(registration: Registration): Promise<Outcome> {
    for (let run = 1; run <= MAX_REGISTRATION_RUNS; run += 1) {
      const outcome = await this.transactions.run(() => this.registerInTransaction(registration));
      if (outcome !== null) {
        return outcome;
      }
    }
    throw new Error(
      'El alta chocó con otra cuenta que no se pudo leer; se agotaron los reintentos.',
    );
  }

  /** `null` si el alta chocó con otra transacción y la cuenta aún no se ve: hay que reintentar (CA-3). */
  private async registerInTransaction(registration: Registration): Promise<Outcome | null> {
    const existing = await this.users.findByEmailForUpdate(registration.email);
    if (existing !== null) {
      return this.registerOverExisting(existing, registration);
    }
    const user = ClientUser.register({
      id: randomUUID(),
      fullName: registration.fullName,
      email: registration.email,
      passwordHash: registration.passwordHash,
      acceptance: this.currentAcceptance(),
    });
    if (await this.users.insertIfAbsent(user)) {
      return this.accepted(user, 'new');
    }
    const concurrent = await this.users.findByEmailForUpdate(registration.email);
    return concurrent === null ? null : this.registerOverExisting(concurrent, registration);
  }

  private async registerOverExisting(existing: User, registration: Registration): Promise<Outcome> {
    if (existing instanceof ClientUser && !existing.emailVerified) {
      return this.replacePending(existing, registration);
    }
    return {
      log: { event: 'identity.registration.existing_account', userId: existing.id },
      mail: await this.attemptNotifier.maybeNotify(existing),
    };
  }

  /** D-10, CA-4: los datos nuevos reemplazan a los anteriores y el enlace nuevo invalida los vigentes. */
  private async replacePending(pending: ClientUser, registration: Registration): Promise<Outcome> {
    const replaced = pending.replacePendingRegistration({
      fullName: registration.fullName,
      passwordHash: registration.passwordHash,
      acceptance: this.currentAcceptance(),
    });
    await this.users.update(replaced);
    return this.accepted(replaced, 'pending_replaced');
  }

  private async accepted(user: ClientUser, kind: 'new' | 'pending_replaced'): Promise<Outcome> {
    return {
      log: { event: 'identity.registration.accepted', userId: user.id, kind },
      mail: await this.linkIssuer.issue(user),
    };
  }

  /** La versión vigente la fija el servidor, nunca el navegador (CA-1, CA-7). */
  private currentAcceptance(): LegalAcceptance {
    return LegalAcceptance.of({
      termsVersion: LEGAL_DOCUMENTS.terms.version,
      privacyVersion: LEGAL_DOCUMENTS.privacy.version,
      acceptedAt: this.clock.now(),
    });
  }

  /** Después del commit: bitácora del resultado y, si lo hay, el correo. */
  private async complete(outcome: Outcome): Promise<void> {
    this.logger.info(outcome.log);
    if (outcome.mail !== null) {
      await this.mailer.send(outcome.mail);
    }
  }
}

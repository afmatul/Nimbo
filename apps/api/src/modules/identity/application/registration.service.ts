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
import { IdentityTooManyRequestsError } from '../domain/errors';
import { LegalAcceptance } from '../domain/legal-acceptance.vo';
import type { PasswordHash } from '../domain/password-hash.vo';
import type { User } from '../domain/user.entity';

import type { IdentityLogger } from './identity-logger';
import { I_PASSWORD_HASHER } from './ports/i-password-hasher.port';
import type { IPasswordHasher } from './ports/i-password-hasher.port';
import { I_USER_REPOSITORY } from './ports/i-user-repository.port';
import type { IUserRepository } from './ports/i-user-repository.port';
import { RegistrationAttemptNotifier } from './registration-attempt-notifier';
import { VerificationLinkIssuer } from './verification-link-issuer';

const SECONDS_PER_HOUR = 3600;
/** D-8: una solicitud cada 60 s y 5 por hora por correo, contando juntos el registro y el reenvío (CA-15). */
const EMAIL_REQUEST_RULES: readonly RateLimitRule[] = [
  { limit: 1, windowSeconds: EMAIL_REQUEST_COOLDOWN_SECONDS },
  { limit: EMAIL_REQUESTS_PER_HOUR, windowSeconds: SECONDS_PER_HOUR },
];
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

/** Lo que deja una transacción: la bitácora y el correo a enviar, ambos después del commit. */
interface Outcome {
  readonly log: Record<string, unknown>;
  readonly mail: MailMessage | null;
}

/**
 * Registro de cuentas de cliente y verificación del correo (plan §6.3, design-model M1). Sin `actor`: las tres
 * operaciones son públicas. Los correos se envían solo después del commit, así nunca sale un enlace de una
 * transacción revertida.
 */
@Injectable()
export class RegistrationService {
  constructor(
    @Inject(I_USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_MAILER) private readonly mailer: IMailer,
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

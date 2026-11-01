import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  I_CLOCK,
  I_PASSWORD_HASHER,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  RateLimitExceededError,
} from '../../../shared';
import type {
  Actor,
  IClock,
  IPasswordHasher,
  IRateLimiter,
  ITransactionRunner,
  PasswordHash,
} from '../../../shared';
import { Action, PermissionResolver } from '../../access';
import { I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { LinkedFileGateway, NodeNotFoundError, WritableAccountPolicy } from '../../storage';
import type { LinkToken } from '../domain/link-token';
import { PublicLink } from '../domain/public-link';
import type { PublicLinkExpiryDays, PublicLinkStatus } from '../domain/public-link';

import { I_PUBLIC_LINK_REPOSITORY } from './ports/i-public-link.repository.port';
import type { IPublicLinkRepository } from './ports/i-public-link.repository.port';
import { linkCreatedEvent, linkRevokedEvent, logLink } from './public-link-records';
import { SHARING_CONFIG } from './sharing-config';
import type { SharingConfig } from './sharing-config';
import type { SharingLogger } from './sharing-logger';

const RATE_LIMIT_WINDOW_SECONDS = 60;
/** Clave del límite de CA-6: una por propietario, aparte de la de compartir (plan §5, S-8). */
const LINK_RATE_KEY_PREFIX = 'sharing:link:';

/** `POST /public-links` ya validado por el contrato (CA-2). */
export interface CreatePublicLinkCommand {
  readonly fileId: string;
  readonly expiresInDays: PublicLinkExpiryDays;
  readonly password?: string | undefined;
}

/** Un enlace sin revocar visto por su propietario (CA-7): nunca el token ni la URL (RN-3). */
export interface PublicLinkSummary {
  readonly id: string;
  readonly fileId: string;
  readonly expiresAt: Date;
  readonly hasPassword: boolean;
  readonly status: PublicLinkStatus;
  readonly createdAt: Date;
}

/** El enlace recién generado y su token, que solo se entrega esta vez (CA-1). */
export interface IssuedPublicLink {
  readonly link: PublicLinkSummary;
  readonly token: LinkToken;
}

const summaryOf = (link: PublicLink, now: Date): PublicLinkSummary => {
  const { id, fileId, expiresAt, createdAt } = link.toSnapshot();
  return {
    id,
    fileId,
    expiresAt,
    hasPassword: link.requiresPassword,
    status: link.statusAt(now),
    createdAt,
  };
};

/**
 * Enlaces públicos del propietario (M3b, plan 013 §1). La autorización no se duplica: `PermissionResolver.can` con
 * `CREATE_PUBLIC_LINK` (solo `OWNER`, RN-1) y el archivo propio y vivo de `LinkedFileGateway`; lo demás es el 404 de
 * lo inexistente (003 D-6).
 */
@Injectable()
export class PublicLinkService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(PermissionResolver) private readonly permissions: Pick<PermissionResolver, 'can'>,
    @Inject(LinkedFileGateway) private readonly files: Pick<LinkedFileGateway, 'findOwnedFile'>,
    @Inject(I_PUBLIC_LINK_REPOSITORY) private readonly links: IPublicLinkRepository,
    @Inject(WritableAccountPolicy)
    private readonly writable: Pick<WritableAccountPolicy, 'assertWritable'>,
    @Inject(I_PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(SHARING_CONFIG) private readonly config: SharingConfig,
    @Inject(PinoLogger) private readonly logger: SharingLogger,
  ) {}

  /**
   * CA-1, CA-3 a CA-6 (plan §2): límite → archivo propio y vivo → solo lectura → hash de la contraseña fuera de la
   * transacción → reemplazo con `public_link.revoked` (`replaced`) y `public_link.created` en la misma. Las bitácoras
   * salen tras el commit.
   */
  async createLink(actor: Actor, command: CreatePublicLinkCommand): Promise<IssuedPublicLink> {
    await this.assertWithinRate(actor);
    await this.requireOwnedFile(actor, command.fileId);
    await this.writable.assertWritable(actor);
    const now = this.clock.now();
    const { link, token } = PublicLink.create({
      id: randomUUID(),
      fileId: command.fileId,
      ownerId: actor.id,
      expiresInDays: command.expiresInDays,
      passwordHash: await this.hashOf(command.password),
      now,
    });
    const previous = await this.transactions.withActor(actor, () =>
      this.replaceInScope(actor, link, command.expiresInDays),
    );
    if (previous !== null) logLink(this.logger, 'public_link.revoked', previous);
    logLink(this.logger, 'public_link.created', link);
    return { link: summaryOf(link, now), token };
  }

  /** CA-4, CA-15: el anterior se revoca y se audita antes de auditar el nuevo; si el archivo ya no es propio, 404. */
  private async replaceInScope(
    actor: Actor,
    link: PublicLink,
    expiresInDays: PublicLinkExpiryDays,
  ): Promise<PublicLink | null> {
    const replacement = await this.links.replace(actor, link);
    if (replacement === null) throw new NodeNotFoundError();
    const { previous } = replacement;
    if (previous !== null) {
      await this.audit.recordInTransaction(linkRevokedEvent(actor, previous, 'replaced'));
    }
    await this.audit.recordInTransaction(linkCreatedEvent(actor, link, expiresInDays));
    return previous;
  }

  /** RN-1, RN-2, CA-3: carpeta, ajeno, inexistente, en la papelera, Editor o Lector son el mismo 404. */
  private async requireOwnedFile(actor: Actor, fileId: string): Promise<void> {
    await this.transactions.withActor(actor, async () => {
      const allowed = await this.permissions.can(actor, fileId, Action.CREATE_PUBLIC_LINK);
      if (!allowed || (await this.files.findOwnedFile(actor, fileId)) === null) {
        throw new NodeNotFoundError();
      }
    });
  }

  /** RN-8: la contraseña solo se guarda como hash Argon2id; sin contraseña, `null`. */
  private hashOf(password: string | undefined): Promise<PasswordHash | null> {
    return password === undefined ? Promise.resolve(null) : this.hasher.hash(password);
  }

  /** CA-6: antes de resolver el archivo, así el `429` no revela nada (plan §5). */
  private async assertWithinRate(actor: Actor): Promise<void> {
    const decision = await this.rateLimiter.consume(`${LINK_RATE_KEY_PREFIX}${actor.id}`, [
      { limit: this.config.shareAttemptsPerMinute, windowSeconds: RATE_LIMIT_WINDOW_SECONDS },
    ]);
    if (decision.allowed) return;
    this.logger.warn({ event: 'sharing.rate_limited', actorId: actor.id });
    throw new RateLimitExceededError(decision.retryAfterSeconds);
  }
}

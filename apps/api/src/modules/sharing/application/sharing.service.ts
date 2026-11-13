import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import {
  consumeOrThrow,
  I_CLOCK,
  I_RATE_LIMITER,
  I_TRANSACTION_RUNNER,
  RateLimitExceededError,
  settleEach,
} from '../../../shared';
import type { Actor, IClock, IRateLimiter, ITransactionRunner, Settlement } from '../../../shared';
import { Action, PermissionResolver } from '../../access';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { NodeNotFoundError, WritableAccountPolicy } from '../../storage';
import { AccessList } from '../domain/access-list';
import type { DirectAccess } from '../domain/access-list';
import { RecipientNotFoundError, ShareNotFoundError } from '../domain/errors';
import { UserShare } from '../domain/user-share';
import type { SharedNodeRef, ShareNodeType, UserShareSnapshot } from '../domain/user-share';

import { I_SHARE_REPOSITORY } from './ports/i-share.repository.port';
import type { AccessGrants, IShareRepository } from './ports/i-share.repository.port';
import { I_SHAREE_DIRECTORY } from './ports/i-sharee-directory.port';
import type { IShareeDirectory, Sharee } from './ports/i-sharee-directory.port';
import { logEntryOf, logShare, REVOKED_LOG_EVENT, shareEvent } from './share-records';
import { SHARING_CONFIG } from './sharing-config';
import type { SharingConfig } from './sharing-config';
import type { SharingLogger } from './sharing-logger';

/** Clave del límite de CA-7: una por propietario (plan §5). */
const SHARE_RATE_KEY_PREFIX = 'sharing:share:';

/** `POST /shares` ya validado por el contrato; `level` llega como texto y la regla de DF-31 la aplica el dominio. */
export interface ShareCommand {
  readonly nodeType: ShareNodeType;
  readonly nodeId: string;
  readonly email: string;
  readonly level: string;
}

/** `POST /shares/batch`: varios nodos con la misma persona y el mismo nivel. */
export interface BatchShareCommand {
  readonly items: readonly SharedNodeRef[];
  readonly email: string;
  readonly level: string;
}

/** Qué hizo `share`: alta (`201`), cambio de nivel o nada (ambos `200`, CA-5). */
export type ShareChange = 'granted' | 'level_changed' | 'unchanged';

export interface ShareOutcome {
  readonly access: DirectAccess;
  readonly change: ShareChange;
}

/** El nodo, la persona ya resuelta y el nivel pedido. */
interface ShareTarget {
  readonly node: SharedNodeRef;
  readonly recipient: Sharee;
  readonly level: string;
}

const directAccessOf = (share: UserShareSnapshot, recipient: Sharee): DirectAccess => ({
  shareId: share.id,
  grantee: recipient,
  level: share.level,
  createdAt: share.createdAt,
});

/** Un acceso con el id de quien lo tiene, antes de sumarle su perfil. */
type WithGranteeId = { readonly granteeId: string };

/** El acceso con el perfil de su destinatario; sin perfil (no debería pasar: FK a `usuario`), se omite. */
const withGrantee = <T extends WithGranteeId>(
  profiles: ReadonlyMap<string, Sharee>,
  grant: T,
): (Omit<T, 'granteeId'> & { readonly grantee: Sharee })[] => {
  const { granteeId, ...rest } = grant;
  const grantee = profiles.get(granteeId);
  return grantee === undefined ? [] : [{ ...rest, grantee }];
};

const LOG_EVENTS: Readonly<Record<Exclude<ShareChange, 'unchanged'>, string>> = {
  granted: 'sharing.granted',
  level_changed: 'sharing.level_changed',
};

/**
 * Compartir con otro cliente y ver o revocar accesos (M3b, plan 012 §1). La autorización no se duplica:
 * `PermissionResolver.can` dentro de `withActor`, con un nivel insuficiente igual a lo inexistente (404, 003 D-6).
 */
@Injectable()
export class SharingService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(PermissionResolver) private readonly permissions: Pick<PermissionResolver, 'can'>,
    @Inject(I_SHARE_REPOSITORY) private readonly shares: IShareRepository,
    @Inject(I_SHAREE_DIRECTORY) private readonly directory: IShareeDirectory,
    @Inject(WritableAccountPolicy)
    private readonly writable: Pick<WritableAccountPolicy, 'assertWritable'>,
    @Inject(I_RATE_LIMITER) private readonly rateLimiter: IRateLimiter,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(SHARING_CONFIG) private readonly config: SharingConfig,
    @Inject(PinoLogger) private readonly logger: SharingLogger,
  ) {}

  /**
   * CA-1 a CA-7 (plan §5): límite → nodo con `SHARE` → destinatario → solo lectura si crea o sube a `EDITOR` →
   * alta o cambio con su evento en la misma transacción. La bitácora sale tras el commit.
   */
  /** Lote del explorador: cada nodo pasa por `share` (permiso, tasa, auditoría); un error solo marca ese nodo. */
  shareMany(actor: Actor, command: BatchShareCommand): Promise<Settlement<SharedNodeRef>> {
    const { email, level } = command;
    return settleEach(command.items, (node) =>
      this.share(actor, { nodeType: node.type, nodeId: node.id, email, level }),
    );
  }

  async share(actor: Actor, command: ShareCommand): Promise<ShareOutcome> {
    await this.assertWithinRate(actor);
    const outcome = await this.transactions.withActor(actor, () =>
      this.shareInScope(actor, command),
    );
    this.logChange(outcome, command.nodeId);
    return outcome;
  }

  /** CA-8, CA-9: solo el propietario (`VIEW_ACCESS_LIST`); lo demás es el 404 de lo inexistente. */
  listAccess(actor: Actor, node: SharedNodeRef): Promise<AccessList> {
    return this.transactions.withActor(actor, async () => {
      await this.assertAllowed(actor, node.id, Action.VIEW_ACCESS_LIST);
      const grants = await this.shares.listAccess(actor, node);
      if (grants === null) throw new NodeNotFoundError();
      return this.accessListOf(grants);
    });
  }

  /**
   * CA-10, CA-11: solo el propietario (la consulta borra con `propietario_id` = actor); ajeno, inexistente o ya revocado
   * es el mismo 404. Sin `WritableAccountPolicy`: revocar se permite en solo lectura (CA-6). `share.revoked` en la
   * misma transacción; la bitácora tras el commit.
   */
  async revoke(actor: Actor, shareId: string): Promise<void> {
    const revoked = await this.transactions.withActor(actor, async () => {
      const share = await this.shares.revoke(actor, shareId);
      if (share === null) throw new ShareNotFoundError();
      const snapshot = share.toSnapshot();
      await this.audit.recordInTransaction(shareEvent(AuditAction.SHARE_REVOKED, actor, snapshot));
      return snapshot;
    });
    logShare(this.logger, REVOKED_LOG_EVENT, logEntryOf(revoked));
  }

  private async accessListOf(grants: AccessGrants): Promise<AccessList> {
    const ids = [...grants.direct, ...grants.inherited].map((grant) => grant.granteeId);
    const profiles = await this.directory.profiles(ids);
    return AccessList.of({
      direct: grants.direct.flatMap((grant) => withGrantee(profiles, grant)),
      inherited: grants.inherited.flatMap((grant) => withGrantee(profiles, grant)),
    });
  }

  private async shareInScope(actor: Actor, command: ShareCommand): Promise<ShareOutcome> {
    const node: SharedNodeRef = { type: command.nodeType, id: command.nodeId };
    await this.assertAllowed(actor, node.id, Action.SHARE);
    const recipient = await this.requireRecipient(command.email);
    const existing = await this.shares.findDirect(actor, node, recipient.id);
    const target = { node, recipient, level: command.level };
    return existing === null
      ? this.grant(actor, target)
      : this.changeLevel(actor, existing, target);
  }

  private async grant(actor: Actor, target: ShareTarget): Promise<ShareOutcome> {
    const share = UserShare.grant({
      id: randomUUID(),
      ownerId: actor.id,
      recipientId: target.recipient.id,
      node: target.node,
      level: target.level,
      now: this.clock.now(),
    });
    await this.writable.assertWritable(actor);
    if (!(await this.shares.insert(actor, share))) throw new NodeNotFoundError();
    await this.audit.recordInTransaction(
      shareEvent(AuditAction.SHARE_GRANTED, actor, share.toSnapshot()),
    );
    return { access: directAccessOf(share.toSnapshot(), target.recipient), change: 'granted' };
  }

  /** CA-5, CA-6: con el mismo nivel no escribe; subir a `EDITOR` exige una cuenta escribible, bajar no. */
  private async changeLevel(
    actor: Actor,
    share: UserShare,
    target: ShareTarget,
  ): Promise<ShareOutcome> {
    if (!share.changeLevel(target.level)) {
      return { access: directAccessOf(share.toSnapshot(), target.recipient), change: 'unchanged' };
    }
    if (share.level === 'EDITOR') await this.writable.assertWritable(actor);
    await this.shares.updateLevel(actor, share);
    await this.audit.recordInTransaction(
      shareEvent(AuditAction.SHARE_LEVEL_CHANGED, actor, share.toSnapshot()),
    );
    return {
      access: directAccessOf(share.toSnapshot(), target.recipient),
      change: 'level_changed',
    };
  }

  /** RN-1, CA-4, CA-9: sin el permiso es el 404 de lo inexistente (ajeno, papelera, Editor o Lector). */
  private async assertAllowed(actor: Actor, nodeId: string, action: Action): Promise<void> {
    if (!(await this.permissions.can(actor, nodeId, action))) throw new NodeNotFoundError();
  }

  /** CA-3, RN-8: los cuatro motivos (no existe, interna, sin verificar, suspendida) llegan aquí como `null`. */
  private async requireRecipient(email: string): Promise<Sharee> {
    const recipient = await this.directory.findClientByEmail(email);
    if (recipient === null) throw new RecipientNotFoundError();
    return recipient;
  }

  /** CA-7: antes de resolver el nodo o el correo, así el `429` no revela nada (plan §5). */
  private async assertWithinRate(actor: Actor): Promise<void> {
    const key = `${SHARE_RATE_KEY_PREFIX}${actor.id}`;
    try {
      await consumeOrThrow(this.rateLimiter, key, this.config.shareAttemptsPerMinute);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        this.logger.warn({ event: 'sharing.rate_limited', actorId: actor.id });
      }
      throw error;
    }
  }

  private logChange({ access, change }: ShareOutcome, nodeId: string): void {
    if (change === 'unchanged') return;
    logShare(this.logger, LOG_EVENTS[change], {
      shareId: access.shareId,
      nodeId,
      level: access.level,
    });
  }
}

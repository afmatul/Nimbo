import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { SubscriptionAdministration } from '../../billing';
import type {
  AdjustQuotaCommand,
  AdjustValidityCommand,
  SubscriptionLimits,
  ValidityAdjustment,
} from '../../billing';
import { AccountDirectory, AccountNotFoundError } from '../../identity';
import type { AccountView } from '../../identity';

import type { BackofficeLogger } from './backoffice-logger';
import { InternalActionService } from './internal-action.service';

/** Límites de una cuenta de cliente (011b HU-5): el usado de `identity` y la suscripción de `billing`, o `null`. */
export interface AccountLimitsDetail {
  readonly usedBytes: bigint;
  readonly subscription: SubscriptionLimits | null;
}

/** Una cuenta de cliente: siempre tiene espacio usado (las internas no). */
type ClientAccount = AccountView & { readonly usedBytes: bigint };

/** Con suscripción, el usado sale de la misma vista que la cuota: una sola fuente para la ficha. */
const detailOf = (limits: SubscriptionLimits): AccountLimitsDetail => ({
  usedBytes: limits.usedBytes,
  subscription: limits,
});

/** RN-4: el extra vigente en bytes y, si hay, el instante en que deja de regir; recurso y afectado, la cuenta. */
const quotaEvent = (actor: Actor, clientId: string, limits: SubscriptionLimits): AuditRecord => ({
  action: AuditAction.ACCOUNT_QUOTA_ADJUSTED,
  actor,
  targetUserId: clientId,
  resourceId: clientId,
  attributes: {
    extraBytes: Number(limits.extraQuotaBytes),
    ...(limits.extraQuotaUntil === null ? {} : { until: limits.extraQuotaUntil.toISOString() }),
  },
});

/**
 * RN-4, CA-9: el `vence_en` nuevo contra la cuenta y, si salió de solo lectura, el evento de la 010, ambos con el rol
 * del Administrador.
 */
const validityEvents = (
  actor: Actor,
  clientId: string,
  { limits, exitedReadOnly }: ValidityAdjustment,
): AuditRecord[] => [
  {
    action: AuditAction.ACCOUNT_VALIDITY_ADJUSTED,
    actor,
    targetUserId: clientId,
    resourceId: clientId,
    attributes: { expiresAt: limits.expiresAt.toISOString() },
  },
  ...(exitedReadOnly
    ? [{ action: AuditAction.SUBSCRIPTION_READ_ONLY_EXITED, actor, targetUserId: clientId }]
    : []),
];

/**
 * Límites, cuota y vigencia de una cuenta para el Administrador (011b plan §2; DF-81). Compone fachadas: la cuenta es
 * de `identity` (`404` si no existe o es interna) y las reglas de la suscripción, de `billing`; la transacción, el
 * actor activo y el evento los pone `InternalActionService`. No autoriza por rol: eso es `@Roles(ADMIN)`.
 */
@Injectable()
export class AccountAdjustmentsService {
  constructor(
    @Inject(InternalActionService)
    private readonly internal: Pick<InternalActionService, 'read' | 'run'>,
    @Inject(AccountDirectory) private readonly directory: Pick<AccountDirectory, 'get'>,
    @Inject(SubscriptionAdministration)
    private readonly subscriptions: Pick<
      SubscriptionAdministration,
      'limitsOf' | 'adjustQuota' | 'adjustValidity'
    >,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'info'>,
  ) {}

  /** HU-5, CA-3: sin suscripción, `subscription` es `null` y el usado es el de la cuenta (`status: none`). */
  limits(actor: Actor, clientId: string): Promise<AccountLimitsDetail> {
    return this.internal.read(actor, async () => {
      const account = await this.requireClient(actor, clientId);
      const subscription = await this.subscriptions.limitsOf(actor, clientId);
      return subscription === null
        ? { usedBytes: account.usedBytes, subscription }
        : detailOf(subscription);
    });
  }

  /** CA-1 a CA-4: el ajuste y su evento en la misma transacción; un rechazo no cambia ni audita nada. */
  async adjustQuota(actor: Actor, cmd: AdjustQuotaCommand): Promise<AccountLimitsDetail> {
    const limits = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: async () => {
        await this.requireClient(actor, cmd.clientId);
        return this.subscriptions.adjustQuota(actor, cmd);
      },
      event: (result) => quotaEvent(actor, cmd.clientId, result),
    });
    this.logger.info({
      event: 'backoffice.account.quota_adjusted',
      actorId: actor.id,
      accountId: cmd.clientId,
    });
    return detailOf(limits);
  }

  /**
   * CA-6 a CA-8: solo extiende; si la cuenta estaba en solo lectura vuelve a `vigente` y su evento sale en la misma
   * transacción. Sin cobro, factura, renovación ni cambio programado.
   */
  async adjustValidity(actor: Actor, cmd: AdjustValidityCommand): Promise<AccountLimitsDetail> {
    const { limits, exitedReadOnly } = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: async () => {
        await this.requireClient(actor, cmd.clientId);
        return this.subscriptions.adjustValidity(actor, cmd);
      },
      event: (result) => validityEvents(actor, cmd.clientId, result),
    });
    this.logger.info({
      event: 'backoffice.account.validity_adjusted',
      actorId: actor.id,
      accountId: cmd.clientId,
      exitedReadOnly,
    });
    return detailOf(limits);
  }

  /** Solo una cuenta de cliente tiene suscripción: una interna es el mismo `404` que una inexistente (CA-3). */
  private async requireClient(actor: Actor, clientId: string): Promise<ClientAccount> {
    const account = await this.directory.get(actor, clientId);
    if (account.role !== Role.CLIENT || account.usedBytes === null) {
      throw new AccountNotFoundError();
    }
    return { ...account, usedBytes: account.usedBytes };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { SubscriptionAdministration } from '../../billing';
import type { AdjustQuotaCommand, SubscriptionLimits } from '../../billing';
import { AccountDirectory, AccountNotFoundError } from '../../identity';

import type { BackofficeLogger } from './backoffice-logger';
import { InternalActionService } from './internal-action.service';

/** Límites de una cuenta de cliente (011b HU-5): el usado de `identity` y la suscripción de `billing`, o `null`. */
export interface AccountLimitsDetail {
  readonly usedBytes: bigint;
  readonly subscription: SubscriptionLimits | null;
}

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
    private readonly subscriptions: Pick<SubscriptionAdministration, 'limitsOf' | 'adjustQuota'>,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'info'>,
  ) {}

  /** HU-5, CA-3: sin suscripción, `subscription` es `null` (la ficha muestra `status: none`). */
  limits(actor: Actor, clientId: string): Promise<AccountLimitsDetail> {
    return this.internal.read(actor, async () => {
      const usedBytes = await this.clientUsage(actor, clientId);
      return { usedBytes, subscription: await this.subscriptions.limitsOf(actor, clientId) };
    });
  }

  /** CA-1 a CA-4: el ajuste y su evento en la misma transacción; un rechazo no cambia ni audita nada. */
  async adjustQuota(actor: Actor, cmd: AdjustQuotaCommand): Promise<AccountLimitsDetail> {
    const limits = await this.internal.run(actor, {
      locksAdminRoster: false,
      work: async () => {
        await this.clientUsage(actor, cmd.clientId);
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

  /** Solo una cuenta de cliente tiene suscripción: una interna es el mismo `404` que una inexistente (CA-3). */
  private async clientUsage(actor: Actor, clientId: string): Promise<bigint> {
    const account = await this.directory.get(actor, clientId);
    if (account.role !== Role.CLIENT || account.usedBytes === null) {
      throw new AccountNotFoundError();
    }
    return account.usedBytes;
  }
}

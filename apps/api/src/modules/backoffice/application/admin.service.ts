import { Inject, Injectable } from '@nestjs/common';
import { BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';
import type { ListAccountsQuery } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { AuditAction } from '../../audit';
import type { AuditRecord } from '../../audit';
import { SubscriptionAdministration } from '../../billing';
import { AccountAdministration, AccountDirectory, InternalAccountEnrollment } from '../../identity';
import type { AccountListRequest, AccountView, EnrollInternalCommand } from '../../identity';

import type { BackofficeLogger } from './backoffice-logger';
import { InternalActionService } from './internal-action.service';

/** Una cuenta con el plan del cliente (011 CA-1): `null` en internas y en clientes sin suscripción («—»). */
export interface AccountDetail extends AccountView {
  readonly planName: string | null;
}

/** Una página de cuentas (`BACKOFFICE_PAGE_SIZE` por página) con el total de la búsqueda (DF-66). */
export interface AccountDetailPage {
  readonly items: readonly AccountDetail[];
  readonly page: number;
  readonly total: number;
}

/** Suspender, reactivar y el alta quedan en la auditoría de la cuenta afectada, que es también el recurso (RN-2). */
const accountEvent = (action: AuditAction, actor: Actor, accountId: string): AuditRecord => ({
  action,
  actor,
  targetUserId: accountId,
  resourceId: accountId,
});

/** El contrato ya normalizó el prefijo (Q-5); sin prefijo, la lista no filtra por correo. */
const listRequestOf = (query: ListAccountsQuery): AccountListRequest => ({
  ...(query.email === undefined ? {} : { emailPrefix: query.email }),
  page: query.page,
  pageSize: BACKOFFICE_PAGE_SIZE,
});

/**
 * Cuentas y altas internas para el Administrador (011 CA-1 a CA-6; plan §2; nombre de M8). Compone fachadas: las
 * cuentas son de `identity` y el plan de cada cliente, de `billing`; la transacción, el actor activo, el candado del
 * padrón (RN-7) y el evento los pone `InternalActionService`. No autoriza por rol: eso es `@Roles(ADMIN)`.
 */
@Injectable()
export class AdminService {
  constructor(
    @Inject(InternalActionService)
    private readonly internal: Pick<InternalActionService, 'read' | 'run'>,
    @Inject(AccountDirectory) private readonly directory: Pick<AccountDirectory, 'list' | 'get'>,
    @Inject(AccountAdministration)
    private readonly administration: Pick<AccountAdministration, 'suspend' | 'reactivate'>,
    @Inject(InternalAccountEnrollment)
    private readonly enrollment: Pick<InternalAccountEnrollment, 'enroll'>,
    @Inject(SubscriptionAdministration)
    private readonly subscriptions: Pick<SubscriptionAdministration, 'planNamesFor'>,
    @Inject(PinoLogger) private readonly logger: Pick<BackofficeLogger, 'info'>,
  ) {}

  /** CA-1: de la más nueva a la más vieja, con el plan de cada cliente. */
  list(actor: Actor, query: ListAccountsQuery): Promise<AccountDetailPage> {
    return this.internal.read(actor, async () => {
      const { items, total } = await this.directory.list(actor, listRequestOf(query));
      return { items: await this.withPlanNames(actor, items), page: query.page, total };
    });
  }

  /** CA-1 a CA-4: la ficha, o `AccountNotFoundError`. */
  get(actor: Actor, id: string): Promise<AccountDetail> {
    return this.internal.read(actor, () => this.detailOf(actor, id));
  }

  /**
   * CA-2, CA-4: la ficha ya suspendida. La bitácora de las sesiones revocadas (002 D-10) la escribe `identity`, después
   * del commit, como el correo del alta.
   */
  async suspend(actor: Actor, id: string): Promise<AccountDetail> {
    const { account, suspension } = await this.internal.run(actor, {
      locksAdminRoster: true,
      work: async () => {
        const suspension = await this.administration.suspend(actor, id);
        return { account: await this.detailOf(actor, id), suspension };
      },
      event: () => accountEvent(AuditAction.ACCOUNT_SUSPENDED, actor, id),
    });
    this.logger.info({ event: 'backoffice.account.suspended', actorId: actor.id, accountId: id });
    suspension.logRevokedSessions();
    return account;
  }

  /** CA-3, CA-4: la ficha ya activa; las sesiones revocadas no vuelven. */
  async reactivate(actor: Actor, id: string): Promise<AccountDetail> {
    const account = await this.internal.run(actor, {
      locksAdminRoster: true,
      work: async () => {
        await this.administration.reactivate(actor, id);
        return this.detailOf(actor, id);
      },
      event: () => accountEvent(AuditAction.ACCOUNT_REACTIVATED, actor, id),
    });
    this.logger.info({ event: 'backoffice.account.reactivated', actorId: actor.id, accountId: id });
    return account;
  }

  /**
   * CA-5, CA-6: el alta y su evento (solo con el `role`) en una transacción; el correo con el enlace sale **después**
   * del commit (plan R-4), así una alta revertida no deja un enlace en camino.
   */
  async enroll(actor: Actor, command: EnrollInternalCommand): Promise<AccountDetail> {
    const { account, deliverInvitation } = await this.internal.run(actor, {
      locksAdminRoster: true,
      work: async () => {
        const enrolled = await this.enrollment.enroll(actor, command);
        const detail = await this.detailOf(actor, enrolled.account.id);
        return { account: detail, deliverInvitation: enrolled.deliverInvitation };
      },
      event: (result) => ({
        ...accountEvent(AuditAction.ACCOUNT_INTERNAL_CREATED, actor, result.account.id),
        attributes: { role: result.account.role },
      }),
    });
    await deliverInvitation();
    this.logger.info({
      event: 'backoffice.account.enrolled',
      actorId: actor.id,
      accountId: account.id,
      role: account.role,
    });
    return account;
  }

  private async detailOf(actor: Actor, id: string): Promise<AccountDetail> {
    const account = await this.directory.get(actor, id);
    return withPlanName(account, await this.planNamesOf(actor, [account]));
  }

  private async withPlanNames(
    actor: Actor,
    accounts: readonly AccountView[],
  ): Promise<AccountDetail[]> {
    const planNames = await this.planNamesOf(actor, accounts);
    return accounts.map((account) => withPlanName(account, planNames));
  }

  /** `billing` solo recibe ids de clientes: una interna no tiene suscripción. */
  private planNamesOf(
    actor: Actor,
    accounts: readonly AccountView[],
  ): Promise<ReadonlyMap<string, string>> {
    const clientIds = accounts
      .filter((account) => account.role === Role.CLIENT)
      .map((account) => account.id);
    return this.subscriptions.planNamesFor(actor, clientIds);
  }
}

const withPlanName = (
  account: AccountView,
  planNames: ReadonlyMap<string, string>,
): AccountDetail => ({ ...account, planName: planNames.get(account.id) ?? null });

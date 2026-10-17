import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER, SYSTEM_ACTOR } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import { InternalAccountEnrollment } from '../../identity';
import type { EnrolledAccount, InitialAdminCommand } from '../../identity';

/** El alta inicial la registra el sistema, sin afectado; el recurso es la cuenta creada (`evento_auditoria_alta_sistema`). */
const bootstrapEvent = (account: EnrolledAccount): AuditRecord => ({
  action: AuditAction.ACCOUNT_BOOTSTRAP_ADMIN,
  actor: SYSTEM_ACTOR,
  targetUserId: null,
  resourceId: account.id,
});

/**
 * Alta del primer Administrador por comando (011 CA-7, RN-3): no es una ruta HTTP ni un permiso de rol, así que no pasa
 * por `InternalActionService` (no hay actor que comprobar; nota del `architect`, plan §8). Cuenta, enlace y evento de
 * sistema van en **un solo** `run` sin actor (T1); si ya hay un Administrador activo, `enrollInitialAdmin` lanza
 * `AdminAlreadyExistsError` y no se crea nada. El correo sale después del commit (plan R-4).
 */
@Injectable()
export class InitialAdminBootstrapper {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(InternalAccountEnrollment) private readonly enrollment: InternalAccountEnrollment,
    @Inject(I_AUDIT_LOGGER) private readonly audit: Pick<IAuditLogger, 'recordInTransaction'>,
  ) {}

  async bootstrap(command: InitialAdminCommand): Promise<EnrolledAccount> {
    const { account, deliverInvitation } = await this.transactions.run(async () => {
      const enrolled = await this.enrollment.enrollInitialAdmin(command);
      await this.audit.recordInTransaction(bootstrapEvent(enrolled.account));
      return enrolled;
    });
    await deliverInvitation();
    return account;
  }
}

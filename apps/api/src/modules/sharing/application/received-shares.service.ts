import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { ShareNotFoundError } from '../domain/errors';
import type { UserShareSnapshot } from '../domain/user-share';

import { I_SHARE_REPOSITORY } from './ports/i-share.repository.port';
import type { IShareRepository, ReceivedGrant } from './ports/i-share.repository.port';
import { I_SHAREE_DIRECTORY } from './ports/i-sharee-directory.port';
import type { IShareeDirectory } from './ports/i-sharee-directory.port';
import { logEntryOf, logShare, REVOKED_LOG_EVENT, shareEvent } from './share-records';
import type { SharingLogger } from './sharing-logger';

/** Un acceso recibido con el nombre visible de quien lo comparte (CA-22). */
export type ReceivedShareView = Omit<ReceivedGrant, 'ownerId'> & {
  readonly owner: { readonly displayName: string };
};

/** El acceso con el nombre de su propietario; sin nombre (no debería pasar: FK a `usuario`), se omite. */
const withOwner = (
  names: ReadonlyMap<string, string>,
  grant: ReceivedGrant,
): ReceivedShareView[] => {
  const { ownerId, ...rest } = grant;
  const displayName = names.get(ownerId);
  return displayName === undefined ? [] : [{ ...rest, owner: { displayName } }];
};

/**
 * Lo compartido conmigo (CA-22; plan 012 §2): los casos del destinatario, aparte de los del propietario en
 * `SharingService` (SRP). Salir (CA-23) no pasa por `WritableAccountPolicy` (010 RN-6).
 */
@Injectable()
export class ReceivedSharesService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SHARE_REPOSITORY) private readonly shares: IShareRepository,
    @Inject(I_SHAREE_DIRECTORY) private readonly directory: IShareeDirectory,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(PinoLogger) private readonly logger: SharingLogger,
  ) {}

  /** CA-22: directos vigentes, más recientes primero (el orden lo da el repositorio); `[]` si no hay. */
  listReceived(actor: Actor): Promise<ReceivedShareView[]> {
    return this.transactions.withActor(actor, async () => {
      const grants = await this.shares.listReceived(actor);
      const names = await this.directory.displayNames([
        ...new Set(grants.map((grant) => grant.ownerId)),
      ]);
      return grants.flatMap((grant) => withOwner(names, grant));
    });
  }

  /**
   * CA-23: el destinatario borra su acceso directo; ajeno, inexistente o ya usado es el mismo 404. `share.revoked` va a
   * la actividad del propietario y se escribe **antes** de borrar: la política `evento_auditoria_salir_comparticion`
   * exige que la compartición exista en ese momento. Si otra petición la borró entre medias, se revierte todo.
   */
  async leave(actor: Actor, shareId: string): Promise<void> {
    const left = await this.transactions.withActor(actor, () => this.leaveInScope(actor, shareId));
    logShare(this.logger, REVOKED_LOG_EVENT, logEntryOf(left));
  }

  private async leaveInScope(actor: Actor, shareId: string): Promise<UserShareSnapshot> {
    const share = await this.shares.findReceived(actor, shareId);
    if (share === null) throw new ShareNotFoundError();
    const snapshot = share.toSnapshot();
    await this.audit.recordInTransaction(shareEvent(AuditAction.SHARE_REVOKED, actor, snapshot));
    if ((await this.shares.leave(actor, shareId)) === null) throw new ShareNotFoundError();
    return snapshot;
  }
}

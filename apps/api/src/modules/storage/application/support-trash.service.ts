import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { FOLDER_CONFIG } from './folder-config';
import type { FolderConfig } from './folder-config';
import { I_SUPPORT_TRASH_REPOSITORY } from './ports/i-support-trash.repository.port';
import type {
  ISupportTrashRepository,
  SupportRestoreCommand,
  SupportRestoreResult,
  SupportTrashQuery,
} from './ports/i-support-trash.repository.port';
import type { TrashPage } from './ports/i-trash.repository.port';

/**
 * Fachada de `storage` para que Soporte vea y restaure la papelera de un cliente (spec 011b CA-10, CA-11; plan §2;
 * DF-81). No reutiliza `TrashService` (del actor dueño, audita fuera de la transacción) ni `WritableAccountPolicy`: la
 * restauración se permite en solo lectura (RN-3). No audita: `backoffice` lo hace en la misma transacción. Las reglas
 * de raíz, retención, destino y nombre viven en `restaurar_raiz_papelera` (ADR-0035).
 */
@Injectable()
export class SupportTrashService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUPPORT_TRASH_REPOSITORY) private readonly trash: ISupportTrashRepository,
    @Inject(FOLDER_CONFIG) private readonly config: FolderConfig,
  ) {}

  /** CA-10: raíces con retención vigente, más recientes primero. */
  list(actor: Actor, query: SupportTrashQuery): Promise<TrashPage> {
    return this.transactions.withActor(actor, () => this.trash.listRoots(actor, query));
  }

  /** CA-11, CA-12: 006 CA-13 a CA-15 con la profundidad máxima de `FOLDER_MAX_DEPTH`. */
  restore(actor: Actor, cmd: SupportRestoreCommand): Promise<SupportRestoreResult> {
    const request = { ...cmd, maxDepth: this.config.maxDepth };
    return this.transactions.withActor(actor, () => this.trash.restoreRoot(actor, request));
  }
}

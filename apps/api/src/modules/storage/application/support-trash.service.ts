import { Inject, Injectable } from '@nestjs/common';
import type { RestoreResponse, TrashItem } from '@nimbo/contracts';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import { FOLDER_CONFIG } from './folder-config';
import type { FolderConfig } from './folder-config';
import { toNodeSummary } from './node-summary';
import { I_SUPPORT_TRASH_REPOSITORY } from './ports/i-support-trash.repository.port';
import type {
  ISupportTrashRepository,
  SupportRestoreCommand,
  SupportRestoreResult,
  SupportTrashQuery,
} from './ports/i-support-trash.repository.port';
import { toTrashItem } from './trash-item';

/** CA-10: una página de la papelera ya en la forma de lectura de 006 (contracts); `backoffice` no ve `TrashEntry`. */
export interface SupportTrashPage {
  readonly items: readonly TrashItem[];
  readonly nextCursor: string | null;
}

/**
 * CA-11: la restauración en la misma forma de lectura que ve el cliente (006 §4) y lo que audita `node.restored`
 * (cuántos nodos volvieron y sus bytes); `backoffice` no ve el `StorageNode` de dominio.
 */
export interface SupportRestoreView extends RestoreResponse {
  readonly itemCount: number;
  readonly sizeBytes: bigint;
}

const toRestoreView = (result: SupportRestoreResult): SupportRestoreView => ({
  item: toNodeSummary(result.node),
  outcome: result.outcome,
  originalName: result.originalName,
  itemCount: result.itemCount,
  sizeBytes: result.sizeBytes,
});

/**
 * Fachada de `storage` para que Soporte vea y restaure la papelera de un cliente (spec 011b CA-10, CA-11; plan §2;
 * DF-81). No reutiliza `TrashService` (del actor dueño, audita fuera de la transacción) ni `WritableAccountPolicy`: la
 * restauración se permite en solo lectura (RN-3). No audita: `backoffice` lo hace en la misma transacción. Las reglas
 * de raíz, retención, destino y nombre viven en `restaurar_raiz_papelera` (ADR-0035). Devuelve vistas de lectura,
 * no entidades: `backoffice` no depende de la forma interna de `storage` (M-2 del PR #85).
 */
@Injectable()
export class SupportTrashService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_SUPPORT_TRASH_REPOSITORY) private readonly trash: ISupportTrashRepository,
    @Inject(FOLDER_CONFIG) private readonly config: FolderConfig,
  ) {}

  /** CA-10: raíces con retención vigente, más recientes primero. */
  async list(actor: Actor, query: SupportTrashQuery): Promise<SupportTrashPage> {
    const page = await this.transactions.withActor(actor, () => this.trash.listRoots(actor, query));
    return { items: page.items.map(toTrashItem), nextCursor: page.nextCursor };
  }

  /** CA-11, CA-12: 006 CA-13 a CA-15 con la profundidad máxima de `FOLDER_MAX_DEPTH`. */
  async restore(actor: Actor, cmd: SupportRestoreCommand): Promise<SupportRestoreView> {
    const request = { ...cmd, maxDepth: this.config.maxDepth };
    const result = await this.transactions.withActor(actor, () =>
      this.trash.restoreRoot(actor, request),
    );
    return toRestoreView(result);
  }
}

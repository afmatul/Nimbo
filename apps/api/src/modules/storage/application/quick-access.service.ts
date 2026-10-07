import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { NodeNotFoundError, QuickAccessLimitError } from '../domain/errors';
import type { QuickAccessItem, QuickAccessList } from '../domain/quick-access';

import { I_QUICK_ACCESS_REPOSITORY } from './ports/i-quick-access.repository.port';
import type {
  IQuickAccessRepository,
  QuickAccessNode,
  QuickAccessNodeRef,
} from './ports/i-quick-access.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { QUICK_ACCESS_CONFIG, RECENTS_STORED } from './quick-access-config';
import type { QuickAccessConfig } from './quick-access-config';

/**
 * Accesos rápidos del actor (spec 006 CA-27 y CA-28, plan §9.2): listar, fijar, quitar y registrar aperturas. Todo
 * corre en `withActor`; solo `pin` toma `lockUsage` (el punto de serialización por dueño) para que dos fijados
 * concurrentes no pasen del tope. Lo ajeno, inexistente o en la papelera es el mismo `NodeNotFoundError` (CA-22). No
 * se audita y no escribe bitácoras (sin nombres).
 */
@Injectable()
export class QuickAccessService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_QUICK_ACCESS_REPOSITORY) private readonly quickAccess: IQuickAccessRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(QUICK_ACCESS_CONFIG) private readonly config: QuickAccessConfig,
  ) {}

  /** CA-27, CA-28: hasta `maxPinned` fijados (R-10) y `recentVisible` recientes, con «Ver más» si hay otros. */
  async list(actor: Actor): Promise<QuickAccessList> {
    const { recentVisible } = this.config;
    const rows = await this.transactions.withActor(actor, () =>
      this.quickAccess.list(actor, { pinned: this.config.maxPinned, recent: recentVisible + 1 }),
    );
    return {
      pinned: rows.pinned,
      recent: rows.recent.slice(0, recentVisible),
      hasMoreRecent: rows.recent.length > recentVisible,
    };
  }

  /** CA-28: idempotente; sobre un nodo ya fijado no mira el tope ni cambia su orden. */
  pin(actor: Actor, ref: QuickAccessNodeRef): Promise<QuickAccessItem> {
    return this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const node = await this.requireNode(actor, ref);
      if (node.pinned) return node.item;
      const pinned = await this.quickAccess.countPinned(actor);
      if (pinned >= this.config.maxPinned) throw new QuickAccessLimitError(this.config.maxPinned);
      await this.quickAccess.upsertPin(actor, ref, this.clock.now());
      return node.item;
    });
  }

  /** CA-28: idempotente si no estaba fijado; si se abrió alguna vez, queda como reciente. */
  unpin(actor: Actor, ref: QuickAccessNodeRef): Promise<void> {
    return this.transactions.withActor(actor, async () => {
      const node = await this.requireNode(actor, ref);
      if (node.pinned) await this.quickAccess.removePin(actor, ref, this.clock.now());
    });
  }

  /** CA-27: abrir una carpeta o pedir la descarga de un archivo; conserva los `RECENTS_STORED` más nuevos. */
  recordOpen(actor: Actor, ref: QuickAccessNodeRef): Promise<void> {
    return this.transactions.withActor(actor, async () => {
      await this.requireNode(actor, ref);
      await this.quickAccess.touchRecent(actor, ref, this.clock.now());
      await this.quickAccess.pruneRecents(actor, RECENTS_STORED);
    });
  }

  private async requireNode(actor: Actor, ref: QuickAccessNodeRef): Promise<QuickAccessNode> {
    const node = await this.quickAccess.findAccessibleNode(actor, ref);
    if (node === null) throw new NodeNotFoundError();
    return node;
  }
}

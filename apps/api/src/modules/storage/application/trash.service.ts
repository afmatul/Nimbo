import { Inject, Injectable } from '@nestjs/common';
import type { RestoreOutcome } from '@nimbo/contracts';
import { PinoLogger } from 'nestjs-pino';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import { AuditAction, I_AUDIT_LOGGER } from '../../audit';
import type { IAuditLogger } from '../../audit';
import { FolderDepthExceededError, NodeNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { Folder } from '../domain/folder';
import { FolderPath } from '../domain/folder-path';
import type { StorageNode } from '../domain/storage-node';
import { TrashState } from '../domain/trash-state';

import { FOLDER_CONFIG } from './folder-config';
import type { FolderConfig } from './folder-config';
import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider } from './plan-limits';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_TRASH_PURGE_QUEUE } from './ports/i-trash-purge-queue.port';
import type { ITrashPurgeQueue } from './ports/i-trash-purge-queue.port';
import { I_TRASH_REPOSITORY } from './ports/i-trash.repository.port';
import type {
  ITrashRepository,
  TrashedFolder,
  TrashEntry,
  TrashItemRef,
  TrashItemType,
  TrashListQuery,
  TrashPage,
  TrashTotals,
} from './ports/i-trash.repository.port';
import { recordAudit } from './record-audit';
import type { StorageLogger } from './storage-logger';
import { TrashPurgeIncompleteError, TrashPurger } from './trash-purger';
import type { PurgeReport } from './trash-purger';

/** Cómo volvió un elemento de la papelera (CA-13 a CA-15), con el nombre que tenía al eliminarse. */
export interface RestoreResult {
  readonly node: StorageNode;
  readonly outcome: RestoreOutcome;
  readonly originalName: string;
}

/** Papelera resumida (CA-12): cantidad, bytes y la retención del plan vigente. */
export interface TrashOverview {
  readonly itemCount: number;
  readonly totalBytes: bigint;
  readonly retentionDays: number;
}

/** Dónde vuelve un elemento: su carpeta original viva o la raíz (`movedToRoot` si la original ya no está, CA-15). */
interface RestorePlace {
  readonly parent: Folder | null;
  readonly movedToRoot: boolean;
}

/** Lo que se audita de una operación sobre un elemento (CA-24): nunca nombres. */
interface AuditedChange {
  readonly action: AuditAction;
  readonly nodeType: TrashItemType;
  readonly nodeId: string;
  readonly itemCount: number;
  readonly sizeBytes: bigint;
  /** Solo en `node.purged`. */
  readonly trigger?: PurgeTrigger;
}

/** Quién disparó una purga (CA-24): «Eliminar definitivamente» o el trabajo `trash-purge`. */
type PurgeTrigger = 'manual' | 'scheduled';

function outcomeOf(place: RestorePlace, renamed: boolean): RestoreOutcome {
  if (place.movedToRoot) return 'moved_to_root';
  return renamed ? 'renamed' : 'restored';
}

/**
 * Papelera del actor (plan 006 §2): eliminar, listar, restaurar y purgar. Cada mutación corre en `withActor` y toma primero
 * `lockUsage` (la fila del dueño), como `FolderService`. Lo ajeno, inexistente o arrastrado por una carpeta es el
 * mismo `NodeNotFoundError` (CA-16, CA-22). Eliminar no cambia `espacio_usado` (RN-2); eso es de la purga.
 */
@Injectable()
export class TrashService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_TRASH_REPOSITORY) private readonly trash: ITrashRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly plans: IPlanLimitsProvider,
    @Inject(I_AUDIT_LOGGER) private readonly audit: IAuditLogger,
    @Inject(I_CLOCK) private readonly clock: IClock,
    @Inject(FOLDER_CONFIG) private readonly config: FolderConfig,
    @Inject(PinoLogger) private readonly logger: StorageLogger,
    @Inject(TrashPurger) private readonly purger: TrashPurger,
    @Inject(I_TRASH_PURGE_QUEUE) private readonly purgeQueue: ITrashPurgeQueue,
  ) {}

  /** CA-10, CA-19: el archivo sale del explorador con la purga a la retención del plan vigente. */
  async trashFile(actor: Actor, fileId: string): Promise<TrashEntry> {
    const state = await this.newTrashState(actor);
    const entry = await this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.nodes.findAccessibleById(actor, fileId);
      if (file === null) throw new NodeNotFoundError();
      await this.trash.markFileTrashed(actor, file.id, state);
      return this.requireEntry(actor, 'file', file.id);
    });
    await this.recordChange(actor, this.trashedChange(entry, 1));
    return entry;
  }

  /** CA-11, RN-3: la carpeta y todo su subárbol vivo, con la misma fecha; en la papelera es un solo elemento. */
  async trashFolder(actor: Actor, folderId: string): Promise<TrashEntry> {
    const state = await this.newTrashState(actor);
    const { entry, itemCount } = await this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const folder = await this.nodes.findAccessibleFolder(actor, folderId);
      if (folder === null) throw new NodeNotFoundError();
      const marked = await this.trash.markFolderSubtreeTrashed(actor, folder, state);
      return { entry: await this.requireEntry(actor, 'folder', folder.id), itemCount: marked };
    });
    await this.recordChange(actor, this.trashedChange(entry, itemCount));
    return entry;
  }

  /** CA-12: raíces de la papelera, de la más reciente a la más antigua. */
  list(actor: Actor, query: TrashListQuery): Promise<TrashPage> {
    return this.transactions.withActor(actor, () => this.trash.listTrash(actor, query));
  }

  /** CA-12: cantidad y bytes de la papelera, con la retención del plan vigente. */
  async summary(actor: Actor): Promise<TrashOverview> {
    const { trashRetentionDays } = await this.plans.limitsFor(actor);
    const totals = await this.transactions.withActor(actor, () => this.trash.trashSummary(actor));
    return { ...totals, retentionDays: trashRetentionDays };
  }

  /** CA-13 a CA-15: a su carpeta si sigue viva, si no a la raíz; con «nombre (n)» si el suyo está ocupado. */
  async restoreFile(actor: Actor, fileId: string): Promise<RestoreResult> {
    const restored = await this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const file = await this.trash.findTrashedFile(actor, fileId);
      if (file === null) throw new NodeNotFoundError();
      const place = await this.placeFor(actor, file.folderId);
      const taken = await this.nodes.findTakenNames(actor, file.name, place.parent?.id ?? null);
      const name = file.name.firstFree(taken);
      const node = File.rehydrate({
        ...file.snapshot(),
        folderId: place.parent?.id ?? null,
        name,
        updatedAt: this.clock.now(),
        trash: null,
      });
      await this.trash.restoreFile(actor, node);
      const outcome = outcomeOf(place, name.value !== file.name.value);
      return { node, outcome, originalName: file.name.value };
    });
    await this.recordChange(actor, {
      action: AuditAction.NODE_RESTORED,
      nodeType: 'file',
      nodeId: restored.node.id,
      itemCount: 1,
      sizeBytes: restored.node.sizeBytes,
    });
    return restored;
  }

  /**
   * CA-13 a CA-15: la carpeta vuelve con lo que arrastró (no con lo eliminado antes por separado). Si su lugar haría
   * que el subárbol supere `FOLDER_MAX_DEPTH`, `422` y nada cambia.
   */
  async restoreFolder(actor: Actor, folderId: string): Promise<RestoreResult> {
    const { result, itemCount, sizeBytes } = await this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const trashed = await this.trash.findTrashedFolder(actor, folderId);
      if (trashed === null) throw new NodeNotFoundError();
      const place = await this.placeFor(actor, trashed.parentId);
      this.assertRestorableUnder(trashed, place.parent);
      const restored = await this.restoredFolder(actor, trashed, place.parent);
      const count = await this.trash.restoreFolderSubtree(actor, trashed, restored);
      const renamed = restored.name.value !== trashed.name.value;
      return {
        result: {
          node: restored,
          outcome: outcomeOf(place, renamed),
          originalName: trashed.name.value,
        },
        itemCount: count,
        sizeBytes: trashed.sizeBytes,
      };
    });
    await this.recordChange(actor, {
      action: AuditAction.NODE_RESTORED,
      nodeType: 'folder',
      nodeId: folderId,
      itemCount,
      sizeBytes,
    });
    return result;
  }

  /**
   * CA-18: «Eliminar definitivamente» un elemento, al momento; devuelve los bytes liberados. Inexistente, ajeno, vivo
   * o ya purgado es `404` (CA-16). Si un objeto no se pudo borrar, lanza `TrashPurgeIncompleteError` (CA-20).
   */
  async purge(actor: Actor, item: TrashItemRef): Promise<bigint> {
    const report = await this.purgeAndRecord(actor, item, 'manual');
    if (report === null) throw new NodeNotFoundError();
    return report.freedBytes;
  }

  /**
   * CA-19: purga programada de una raíz vencida (la usa el `worker` como el dueño). Vuelve a comprobar el vencimiento
   * con el reloj y no mira el estado de la cuenta. Lo ya purgado o restaurado no hace nada (idempotente).
   */
  async purgeExpired(actor: Actor, item: TrashItemRef): Promise<void> {
    await this.purgeAndRecord(actor, item, 'scheduled');
  }

  /**
   * CA-18: «Vaciar papelera» no purga en la petición: adelanta la purga de todas las raíces a «ahora» y encola el
   * trabajo `trash-purge`; el espacio baja cuando termina. Devuelve lo que quedó programado.
   */
  async empty(actor: Actor): Promise<TrashTotals> {
    const now = this.clock.now();
    const totals = await this.transactions.withActor(actor, async () => {
      await this.quotas.lockUsage(actor);
      const current = await this.trash.trashSummary(actor);
      if (current.itemCount > 0) await this.trash.schedulePurgeOfAll(actor, now);
      return current;
    });
    if (totals.itemCount === 0) return totals;
    await this.enqueuePurge();
    await this.record(actor, AuditAction.TRASH_EMPTIED, null, {
      itemCount: totals.itemCount,
      sizeBytes: Number(totals.totalBytes),
    });
    return totals;
  }

  /** Fecha de purga con la retención del plan vigente al eliminar (CA-19); se lee fuera de la transacción. */
  private async newTrashState(actor: Actor): Promise<TrashState> {
    const { trashRetentionDays } = await this.plans.limitsFor(actor);
    return TrashState.start(this.clock.now(), trashRetentionDays);
  }

  private async requireEntry(actor: Actor, type: TrashItemType, id: string): Promise<TrashEntry> {
    const entry = await this.trash.findTrashedItem(actor, type, id);
    if (entry === null) throw new NodeNotFoundError();
    return entry;
  }

  /** `parentId` `null` es la raíz; una carpeta que el actor ya no ve viva (en la papelera o purgada) también (CA-15). */
  private async placeFor(actor: Actor, parentId: string | null): Promise<RestorePlace> {
    if (parentId === null) return { parent: null, movedToRoot: false };
    const parent = await this.nodes.findAccessibleFolder(actor, parentId);
    return { parent, movedToRoot: parent === null };
  }

  /** CA-15: la carpeta más honda que vuelve no puede superar `FOLDER_MAX_DEPTH` bajo `parent`. */
  private assertRestorableUnder(trashed: TrashedFolder, parent: Folder | null): void {
    const deepest = trashed.storedPath.subtreeDepthUnder(
      parent?.path ?? null,
      trashed.deepestCarriedDepth,
    );
    if (deepest > this.config.maxDepth) {
      throw new FolderDepthExceededError(this.config.maxDepth, 'restore');
    }
  }

  /** La carpeta tal como vuelve: bajo `parent` (ruta rehecha, también tras R-5) y con el primer nombre libre. */
  private async restoredFolder(
    actor: Actor,
    trashed: TrashedFolder,
    parent: Folder | null,
  ): Promise<Folder> {
    const taken = await this.nodes.findTakenFolderNames(actor, trashed.name, parent?.id ?? null);
    return Folder.rehydrate({
      id: trashed.id,
      ownerId: trashed.ownerId,
      parentId: parent?.id ?? null,
      name: trashed.name.firstFree(taken),
      path: FolderPath.childOf(parent?.path ?? null, trashed.id),
      createdAt: trashed.createdAt,
      updatedAt: this.clock.now(),
      trash: null,
    });
  }

  private trashedChange(entry: TrashEntry, itemCount: number): AuditedChange {
    return {
      action: AuditAction.NODE_TRASHED,
      nodeType: entry.type,
      nodeId: entry.id,
      itemCount,
      sizeBytes: entry.sizeBytes,
    };
  }

  /** Purga `item` y audita lo que se borró; si quedaron archivos, lanza para que se reintente (CA-20). */
  private async purgeAndRecord(
    actor: Actor,
    item: TrashItemRef,
    trigger: PurgeTrigger,
  ): Promise<PurgeReport | null> {
    const dueBy = trigger === 'scheduled' ? this.clock.now() : null;
    const report = await this.purger.purge(actor, item, dueBy);
    if (report === null) return null;
    if (report.itemCount > 0) {
      await this.recordChange(actor, {
        action: AuditAction.NODE_PURGED,
        nodeType: item.type,
        nodeId: item.id,
        itemCount: report.itemCount,
        sizeBytes: report.freedBytes,
        trigger,
      });
    }
    if (report.failedFiles > 0) throw new TrashPurgeIncompleteError(report.failedFiles);
    return report;
  }

  /** Encolar es de mejor esfuerzo: si falla, el ciclo programado purga lo que ya venció (CA-18). */
  private async enqueuePurge(): Promise<void> {
    try {
      await this.purgeQueue.enqueueNow();
    } catch (error) {
      this.logger.error({
        event: 'trash.empty_enqueue_failed',
        errorName: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /** Auditoría de un elemento (CA-24): tipo, cantidad, bytes y, en la purga, quién la disparó. */
  private recordChange(actor: Actor, change: AuditedChange): Promise<void> {
    return this.record(actor, change.action, change.nodeId, {
      nodeType: change.nodeType,
      itemCount: change.itemCount,
      sizeBytes: Number(change.sizeBytes),
      ...(change.trigger === undefined ? {} : { trigger: change.trigger }),
    });
  }

  /** Auditoría de mejor esfuerzo después del commit y bitácora solo con UUID y conteos (CA-24). */
  private async record(
    actor: Actor,
    action: AuditAction,
    resourceId: string | null,
    attributes: Readonly<Record<string, string | number>>,
  ): Promise<void> {
    const ids = resourceId === null ? {} : { nodeId: resourceId };
    await recordAudit(
      this.audit,
      this.logger,
      {
        action,
        actor,
        targetUserId: actor.id,
        ...(resourceId === null ? {} : { resourceId }),
        attributes,
      },
      ids,
    );
    this.logger.info({ event: action, ...ids, ...attributes });
  }
}

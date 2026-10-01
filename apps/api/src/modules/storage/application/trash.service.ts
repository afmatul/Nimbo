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
import { I_TRASH_REPOSITORY } from './ports/i-trash.repository.port';
import type {
  ITrashRepository,
  TrashedFolder,
  TrashEntry,
  TrashItemType,
  TrashListQuery,
  TrashPage,
} from './ports/i-trash.repository.port';
import { recordAudit } from './record-audit';
import type { StorageLogger } from './storage-logger';

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
}

function outcomeOf(place: RestorePlace, renamed: boolean): RestoreOutcome {
  if (place.movedToRoot) return 'moved_to_root';
  return renamed ? 'renamed' : 'restored';
}

/**
 * Papelera del actor (plan 006 §2): eliminar, listar y restaurar. Cada mutación corre en `withActor` y toma primero
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

  /** Auditoría de mejor esfuerzo después del commit y bitácora solo con UUID y conteos (CA-24). */
  private async recordChange(actor: Actor, change: AuditedChange): Promise<void> {
    const attributes = {
      nodeType: change.nodeType,
      itemCount: change.itemCount,
      sizeBytes: Number(change.sizeBytes),
    };
    await recordAudit(
      this.audit,
      this.logger,
      {
        action: change.action,
        actor,
        targetUserId: actor.id,
        resourceId: change.nodeId,
        attributes,
      },
      { nodeId: change.nodeId },
    );
    this.logger.info({ event: change.action, nodeId: change.nodeId, ...attributes });
  }
}

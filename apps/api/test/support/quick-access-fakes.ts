import type {
  IQuickAccessRepository,
  QuickAccessNode,
  QuickAccessNodeRef,
  QuickAccessRows,
  QuickAccessTake,
} from '../../src/modules/storage/application/ports/i-quick-access.repository.port';
import type { QuickAccessItem } from '../../src/modules/storage/domain/quick-access';
import type { Actor } from '../../src/shared';

import type { Journal } from './storage-fakes';

/** Nodo del mundo en memoria: su dueño y si está en la papelera (entonces `accessibleNodes` no lo da). */
interface FakeNode {
  readonly ownerId: string;
  readonly item: QuickAccessItem;
  trashed: boolean;
}

/** Fila de `acceso_rapido` en memoria. */
export interface FakeQuickAccessRow {
  readonly userId: string;
  readonly ref: QuickAccessNodeRef;
  pinnedAt: Date | null;
  openedAt: Date | null;
}

const keyOf = (ref: QuickAccessNodeRef): string => `${ref.type}:${ref.id}`;

const newestFirst =
  (field: 'pinnedAt' | 'openedAt') =>
  (a: FakeQuickAccessRow, b: FakeQuickAccessRow): number =>
    (b[field]?.getTime() ?? 0) - (a[field]?.getTime() ?? 0);

/**
 * `IQuickAccessRepository` en memoria con la semántica del SQL de `TypeOrmQuickAccessRepository`: solo se ven los nodos
 * vivos del actor, los recientes excluyen los fijados y quitar un fijado nunca abierto borra la fila.
 */
export class FakeQuickAccessRepository implements IQuickAccessRepository {
  readonly nodes = new Map<string, FakeNode>();
  rows: FakeQuickAccessRow[] = [];
  readonly takes: QuickAccessTake[] = [];
  readonly prunedTo: number[] = [];

  constructor(private readonly journal: Journal) {}

  /** Agrega un nodo vivo de `owner` y devuelve su referencia. */
  addNode(owner: Actor, item: QuickAccessItem): QuickAccessNodeRef {
    this.nodes.set(keyOf(item), { ownerId: owner.id, item, trashed: false });
    return { type: item.type, id: item.id };
  }

  rowOf(actor: Actor, ref: QuickAccessNodeRef): FakeQuickAccessRow | undefined {
    return this.rows.find((row) => row.userId === actor.id && keyOf(row.ref) === keyOf(ref));
  }

  list(actor: Actor, take: QuickAccessTake): Promise<QuickAccessRows> {
    this.journal.add('quickAccess:list');
    this.takes.push(take);
    const visible = this.visibleRows(actor);
    const pinned = visible.filter((row) => row.pinnedAt !== null).sort(newestFirst('pinnedAt'));
    const recent = visible.filter((row) => row.pinnedAt === null).sort(newestFirst('openedAt'));
    return Promise.resolve({
      pinned: pinned.slice(0, take.pinned).map((row) => this.itemOf(row)),
      recent: recent.slice(0, take.recent).map((row) => this.itemOf(row)),
    });
  }

  countPinned(actor: Actor): Promise<number> {
    this.journal.add('quickAccess:countPinned');
    return Promise.resolve(this.visibleRows(actor).filter((row) => row.pinnedAt !== null).length);
  }

  findAccessibleNode(actor: Actor, ref: QuickAccessNodeRef): Promise<QuickAccessNode | null> {
    this.journal.add('quickAccess:findAccessibleNode');
    if (!this.isVisible(actor, ref)) return Promise.resolve(null);
    const node = this.nodes.get(keyOf(ref));
    if (node === undefined) return Promise.resolve(null);
    return Promise.resolve({ item: node.item, pinned: this.rowOf(actor, ref)?.pinnedAt != null });
  }

  upsertPin(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void> {
    this.journal.add('quickAccess:upsertPin');
    const row = this.ensureRow(actor, ref);
    row.pinnedAt ??= at;
    return Promise.resolve();
  }

  removePin(actor: Actor, ref: QuickAccessNodeRef): Promise<void> {
    this.journal.add('quickAccess:removePin');
    const row = this.rowOf(actor, ref);
    if (row === undefined) return Promise.resolve();
    row.pinnedAt = null;
    if (row.openedAt === null) this.rows = this.rows.filter((other) => other !== row);
    return Promise.resolve();
  }

  touchRecent(actor: Actor, ref: QuickAccessNodeRef, at: Date): Promise<void> {
    this.journal.add('quickAccess:touchRecent');
    this.ensureRow(actor, ref).openedAt = at;
    return Promise.resolve();
  }

  pruneRecents(actor: Actor, keep: number): Promise<void> {
    this.journal.add('quickAccess:pruneRecents');
    this.prunedTo.push(keep);
    const recent = this.rows
      .filter((row) => row.userId === actor.id && row.pinnedAt === null)
      .sort(newestFirst('openedAt'));
    const dropped = new Set(recent.slice(keep));
    this.rows = this.rows.filter((row) => !dropped.has(row));
    return Promise.resolve();
  }

  private ensureRow(actor: Actor, ref: QuickAccessNodeRef): FakeQuickAccessRow {
    const existing = this.rowOf(actor, ref);
    if (existing !== undefined) return existing;
    const created: FakeQuickAccessRow = { userId: actor.id, ref, pinnedAt: null, openedAt: null };
    this.rows.push(created);
    return created;
  }

  private isVisible(actor: Actor, ref: QuickAccessNodeRef): boolean {
    const node = this.nodes.get(keyOf(ref));
    return node !== undefined && node.ownerId === actor.id && !node.trashed;
  }

  private visibleRows(actor: Actor): FakeQuickAccessRow[] {
    return this.rows.filter((row) => row.userId === actor.id && this.isVisible(actor, row.ref));
  }

  private itemOf(row: FakeQuickAccessRow): QuickAccessItem {
    const node = this.nodes.get(keyOf(row.ref));
    if (node === undefined) throw new Error('fila sin nodo');
    return node.item;
  }
}

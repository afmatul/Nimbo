/** Tope de ids por lista en `index.reconcile_completed`: la línea no crece con el número de archivos (019 review I-3). */
export const MAX_LOGGED_IDS = 100;

/** Qué hizo la conciliación con una versión vigente indexable. */
export type Repair = 'scheduled' | 'requeued' | 'none';

/** Cuenta todos los ids que recibe y guarda solo los primeros `MAX_LOGGED_IDS`. */
class BoundedIds {
  private total = 0;
  private readonly kept: string[] = [];

  add(id: string): void {
    this.total += 1;
    if (this.kept.length < MAX_LOGGED_IDS) this.kept.push(id);
  }

  get count(): number {
    return this.total;
  }

  get ids(): readonly string[] {
    return [...this.kept];
  }

  get truncated(): boolean {
    return this.total > this.kept.length;
  }
}

/**
 * Resultado de una conciliación mientras avanza: conteos totales y, como mucho, `MAX_LOGGED_IDS` ids de versión o de
 * cuenta por lista. Las versiones que no necesitaron nada solo suman a `files`. Sin nombres ni texto.
 */
export class ReconcileTally {
  private accounts = 0;
  private files = 0;
  private readonly scheduled = new BoundedIds();
  private readonly requeued = new BoundedIds();
  private readonly failed = new BoundedIds();

  accountVisited(): void {
    this.accounts += 1;
  }

  accountFailed(ownerId: string): void {
    this.failed.add(ownerId);
  }

  fileReconciled(versionId: string, repair: Repair): void {
    this.files += 1;
    if (repair === 'scheduled') this.scheduled.add(versionId);
    if (repair === 'requeued') this.requeued.add(versionId);
  }

  get failedAccounts(): number {
    return this.failed.count;
  }

  /** Campos de `index.reconcile_completed`; `idsTruncated` dice si alguna lista quedó más corta que su conteo. */
  toLog(): Record<string, unknown> {
    const lists = [this.scheduled, this.requeued, this.failed];
    return {
      accounts: this.accounts,
      failedAccounts: this.failed.count,
      files: this.files,
      scheduled: this.scheduled.count,
      requeued: this.requeued.count,
      scheduledVersionIds: this.scheduled.ids,
      requeuedVersionIds: this.requeued.ids,
      failedAccountIds: this.failed.ids,
      idsTruncated: lists.some((list) => list.truncated),
    };
  }
}

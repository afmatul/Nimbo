const DAY_MS = 86_400_000;

export interface TrashStateSnapshot {
  readonly deletedAt: Date;
  /** Fijada al eliminar con la retención del plan vigente; no cambia si luego cambia el plan (CA-19). */
  readonly purgeAt: Date;
  /** Carpeta cuya eliminación arrastró a este nodo; `null` si se eliminó por sí mismo (raíz de la papelera). */
  readonly trashedWithFolderId: string | null;
}

/** Estado de papelera de un archivo o carpeta (`eliminado_en`, `purgar_en`, `eliminado_con_carpeta_id`), inmutable. */
export class TrashState {
  private readonly data: TrashStateSnapshot;

  private constructor(snapshot: TrashStateSnapshot) {
    if (snapshot.purgeAt.getTime() < snapshot.deletedAt.getTime()) {
      throw new TypeError('La fecha de purga no puede ser anterior a la de eliminación.');
    }
    this.data = Object.freeze({
      ...snapshot,
      deletedAt: new Date(snapshot.deletedAt.getTime()),
      purgeAt: new Date(snapshot.purgeAt.getTime()),
    });
    Object.freeze(this);
  }

  /** Eliminación de un nodo por sí mismo: purga a `retentionDays` días (CA-10, CA-19). */
  static start(now: Date, retentionDays: number): TrashState {
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
      throw new TypeError('La retención en papelera debe ser un entero positivo de días.');
    }
    return new TrashState({
      deletedAt: now,
      purgeAt: new Date(now.getTime() + retentionDays * DAY_MS),
      trashedWithFolderId: null,
    });
  }

  static rehydrate(snapshot: TrashStateSnapshot): TrashState {
    return new TrashState(snapshot);
  }

  get deletedAt(): Date {
    return new Date(this.data.deletedAt.getTime());
  }

  get purgeAt(): Date {
    return new Date(this.data.purgeAt.getTime());
  }

  get trashedWithFolderId(): string | null {
    return this.data.trashedWithFolderId;
  }

  /** Elemento propio de la papelera (se lista, restaura y purga); lo arrastrado viaja con su carpeta (CA-11). */
  get isTrashRoot(): boolean {
    return this.data.trashedWithFolderId === null;
  }

  /** Estado de un nodo del subárbol de `folderId`: misma fecha de eliminación y de purga (RN-3). */
  carriedBy(folderId: string): TrashState {
    return new TrashState({ ...this.snapshot(), trashedWithFolderId: folderId });
  }

  /** Vencido desde `purgeAt` inclusive (CA-19). */
  isExpired(now: Date): boolean {
    return now.getTime() >= this.data.purgeAt.getTime();
  }

  snapshot(): TrashStateSnapshot {
    return { ...this.data, deletedAt: this.deletedAt, purgeAt: this.purgeAt };
  }
}

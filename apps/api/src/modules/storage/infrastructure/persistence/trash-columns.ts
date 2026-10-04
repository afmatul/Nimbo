import { TrashState } from '../../domain/trash-state';

/** Columnas de papelera comunes a `archivo` y `carpeta` (plan 006 §3, `ck_*_papelera`). */
export interface TrashColumns {
  eliminadoEn: Date | null;
  purgarEn: Date | null;
  eliminadoConCarpetaId: string | null;
}

/** Fila → `TrashState`; `null` si el nodo está vivo. */
export function toTrashState(row: TrashColumns): TrashState | null {
  if (row.eliminadoEn === null) return null;
  if (row.purgarEn === null) {
    throw new TypeError('Un nodo en la papelera siempre tiene fecha de purga.');
  }
  return TrashState.rehydrate({
    deletedAt: row.eliminadoEn,
    purgeAt: row.purgarEn,
    trashedWithFolderId: row.eliminadoConCarpetaId,
  });
}

/** `TrashState` → columnas; todas `null` si el nodo está vivo. */
export function trashColumns(trash: TrashState | null): TrashColumns {
  return {
    eliminadoEn: trash?.deletedAt ?? null,
    purgarEn: trash?.purgeAt ?? null,
    eliminadoConCarpetaId: trash?.trashedWithFolderId ?? null,
  };
}

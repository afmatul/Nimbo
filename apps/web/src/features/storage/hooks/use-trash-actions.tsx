'use client';

import type { RestoreResponse, TrashItem } from '@nimbo/contracts';
import Link from 'next/link';
import * as React from 'react';

import { buttonVariants } from '../../../components/ui/button';
import { showNotice } from '../../../components/ui/sonner';
import type { PurgeTarget } from '../components/purge-confirm-dialog';
import {
  originalPlaceName,
  restoreFailureLine,
  restoreSuccessLine,
  type RestoreLine,
} from '../components/restore-result';
import { locationPath } from '../routes';
import { isStorageNotFound } from '../storage-request-error';
import type { TrashApi } from '../trash-api';

import type { useTrash } from './use-trash';

type TrashState = Pick<
  ReturnType<typeof useTrash>,
  'removeItems' | 'refreshSummary' | 'startEmptying'
>;

const NO_SELECTION: ReadonlySet<string> = new Set();

interface RestoreAttempt {
  readonly item: TrashItem;
  readonly line: RestoreLine;
  readonly response?: RestoreResponse;
  /** Ya no está en la papelera (`404`): la fila se quita igual. */
  readonly gone: boolean;
}

/** Una llamada por elemento (plan 006 §4, CA-17); cada una informa su resultado. */
function restoreEach(
  api: Pick<TrashApi, 'restore'>,
  items: readonly TrashItem[],
): Promise<RestoreAttempt[]> {
  return Promise.all(
    items.map((item) =>
      api.restore(item.type, item.id).then(
        (response) => ({ item, response, line: restoreSuccessLine(item, response), gone: false }),
        (error: unknown) => ({
          item,
          line: restoreFailureLine(item, error),
          gone: isStorageNotFound(error),
        }),
      ),
    ),
  );
}

function containerOf(response: RestoreResponse): string | null {
  return response.item.type === 'file' ? response.item.folderId : response.item.parentId;
}

/** Uno sin cambios: aviso con «Abrir carpeta» (se cierra solo). Lo demás va al panel persistente (CA-17). */
function announceRestore(attempts: readonly RestoreAttempt[]): readonly RestoreLine[] | null {
  const [only] = attempts;
  if (attempts.length === 1 && only?.response && only.line.status === 'restored') {
    showNotice(`Restauramos «${only.response.originalName}» en ${originalPlaceName(only.item)}.`, {
      action: (
        <Link
          href={locationPath(containerOf(only.response))}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Abrir carpeta
        </Link>
      ),
    });
    return null;
  }
  return attempts.map((attempt) => attempt.line);
}

/** Elementos marcados; `forget` los quita de la lista y de la selección (ya no están en la papelera). */
function useSelection(removeItems: TrashState['removeItems']) {
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(NO_SELECTION);
  const forget = React.useCallback(
    (ids: ReadonlySet<string>): void => {
      removeItems(ids);
      setSelectedIds((previous) => new Set([...previous].filter((id) => !ids.has(id))));
    },
    [removeItems],
  );
  return { selectedIds, setSelectedIds, forget };
}

type Selection = ReturnType<typeof useSelection>;

/** Restaurar uno o varios: quita lo restaurado (o ya inexistente) y anuncia el resultado (CA-15 a CA-17). */
function useRestore(
  api: Pick<TrashApi, 'restore'>,
  selection: Selection,
  refreshSummary: TrashState['refreshSummary'],
) {
  const [restoring, setRestoring] = React.useState(false);
  const [result, setResult] = React.useState<readonly RestoreLine[] | null>(null);
  const restore = async (items: readonly TrashItem[]): Promise<void> => {
    setRestoring(true);
    setResult(null);
    const attempts = await restoreEach(api, items);
    selection.forget(new Set(attempts.filter((a) => a.response || a.gone).map((a) => a.item.id)));
    selection.setSelectedIds(NO_SELECTION);
    refreshSummary();
    setResult(announceRestore(attempts));
    setRestoring(false);
  };
  return { restoring, result, dismissResult: () => setResult(null), restore };
}

/** Eliminar definitivamente un elemento o vaciar la papelera, tras confirmar (CA-13, CA-14, CA-18). */
function usePurge(
  api: Pick<TrashApi, 'purge' | 'emptyTrash'>,
  selection: Selection,
  { refreshSummary, startEmptying }: Omit<TrashState, 'removeItems'>,
) {
  const [purgeTarget, setPurgeTarget] = React.useState<PurgeTarget | null>(null);
  const purgeItem = async (item: TrashItem): Promise<void> => {
    try {
      await api.purge(item.type, item.id);
    } catch (error) {
      if (isStorageNotFound(error)) selection.forget(new Set([item.id]));
      throw error;
    }
    selection.forget(new Set([item.id]));
    refreshSummary();
  };
  const confirmPurge = async (): Promise<void> => {
    if (purgeTarget === null) return;
    if (purgeTarget.scope === 'item') return purgeItem(purgeTarget.item);
    startEmptying(await api.emptyTrash());
    selection.setSelectedIds(NO_SELECTION);
  };
  return { purgeTarget, setPurgeTarget, confirmPurge };
}

export interface TrashActions {
  readonly selectedIds: ReadonlySet<string>;
  readonly setSelectedIds: (ids: ReadonlySet<string>) => void;
  readonly restoring: boolean;
  readonly result: readonly RestoreLine[] | null;
  readonly dismissResult: () => void;
  readonly restore: (items: readonly TrashItem[]) => Promise<void>;
  readonly purgeTarget: PurgeTarget | null;
  readonly setPurgeTarget: (target: PurgeTarget | null) => void;
  readonly confirmPurge: () => Promise<void>;
}

/** Selección, restaurar (uno o varios), eliminar definitivamente y vaciar (CA-13 a CA-18). */
export function useTrashActions(
  api: Pick<TrashApi, 'restore' | 'purge' | 'emptyTrash'>,
  trash: TrashState,
): TrashActions {
  const selection = useSelection(trash.removeItems);
  const { selectedIds, setSelectedIds } = selection;
  return {
    selectedIds,
    setSelectedIds,
    ...useRestore(api, selection, trash.refreshSummary),
    ...usePurge(api, selection, trash),
  };
}

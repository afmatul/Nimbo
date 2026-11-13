'use client';

import type { BatchDownloadResponse, BatchResult, ShareLevel } from '@nimbo/contracts';
import * as React from 'react';

import type { BatchApi } from '../batch-api';
import {
  BATCH_REQUEST_FAILED,
  batchOutcomeOf,
  downloadOutcomeOf,
  failureLinesOf,
  type BatchAction,
  type BatchOutcome,
} from '../batch-outcome';

import { batchItemOf, type NodeSelection } from './use-node-selection';

/** Diálogo abierto desde la barra de selección. */
export type BatchDialog = 'share' | 'move' | 'trash';

export interface BatchActionsOptions {
  readonly api: BatchApi;
  readonly selection: NodeSelection;
  /** Algo cambió en el servidor: releer la lista y la barra lateral. */
  readonly onChanged: () => void;
}

/** Cada URL prefirmada se descarga con un enlace temporal (`download`), uno por archivo. */
function startDownloads({ downloads }: BatchDownloadResponse): void {
  for (const { name, url } of downloads) {
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
  }
}

interface BatchState {
  readonly dialog: BatchDialog | null;
  readonly setDialog: (dialog: BatchDialog | null) => void;
  readonly pending: boolean;
  readonly setPending: (pending: boolean) => void;
  readonly outcome: BatchOutcome | null;
  readonly setOutcome: (outcome: BatchOutcome | null) => void;
}

export interface BatchActions extends BatchState {
  readonly trash: () => Promise<void>;
  readonly move: (targetFolderId: string | null) => Promise<void>;
  readonly share: (email: string, level: ShareLevel) => Promise<void>;
  readonly download: () => Promise<void>;
}

function useBatchState(): BatchState {
  const [dialog, setDialog] = React.useState<BatchDialog | null>(null);
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<BatchOutcome | null>(null);
  return { dialog, setDialog, pending, setPending, outcome, setOutcome };
}

/**
 * Acciones de la barra de selección (Compartir, Descargar, Mover, Eliminar) con `POST …/batch`: cada una muestra su
 * resultado, parcial si algunos fallaron, y vacía la selección; si la petición entera falla, la conserva.
 */
export function useBatchActions({ api, selection, onChanged }: BatchActionsOptions): BatchActions {
  const state = useBatchState();
  const { selected } = selection;
  const items = selected.map(batchItemOf);
  const settle = async (request: () => Promise<BatchOutcome>, changes: boolean) => {
    state.setPending(true);
    try {
      state.setOutcome(await request());
      selection.clear();
      if (changes) onChanged();
    } catch {
      state.setOutcome(BATCH_REQUEST_FAILED);
    } finally {
      state.setPending(false);
      state.setDialog(null);
    }
  };
  const run = (action: BatchAction, request: () => Promise<BatchResult>) =>
    settle(async () => batchOutcomeOf(action, await request(), selected), true);
  const download = () =>
    settle(async () => {
      const response = await api.download(items);
      startDownloads(response);
      return downloadOutcomeOf(
        response.downloads.length,
        failureLinesOf(response.failed, selected),
      );
    }, false);
  return {
    ...state,
    trash: () => run('trash', () => api.trash(items)),
    move: (targetFolderId: string | null) => run('move', () => api.move(items, targetFolderId)),
    share: (email: string, level: ShareLevel) =>
      run('share', () => api.share({ items, email, level })),
    download,
  };
}

'use client';

import {
  SHARING_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type BatchResult,
  type NodeSummary,
  type ShareLevel,
} from '@nimbo/contracts';
import * as React from 'react';

import { shareCodeMessage, shareMessageOf } from '../../sharing';
import type { BatchApi } from '../batch-api';
import { startDownloads } from '../batch-downloads';
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

interface BatchState {
  readonly dialog: BatchDialog | null;
  /** Abrir un diálogo borra el error de compartir del intento anterior. */
  readonly setDialog: (dialog: BatchDialog | null) => void;
  readonly pending: boolean;
  readonly setPending: (pending: boolean) => void;
  readonly outcome: BatchOutcome | null;
  readonly setOutcome: (outcome: BatchOutcome | null) => void;
  /** Error de «Compartir» que se muestra dentro del diálogo (correo o nivel): el diálogo sigue abierto con lo escrito. */
  readonly shareError: string | null;
  readonly setShareError: (error: string | null) => void;
}

export interface BatchActions extends BatchState {
  readonly trash: () => Promise<void>;
  readonly move: (targetFolderId: string | null) => Promise<void>;
  readonly share: (email: string, level: ShareLevel) => Promise<void>;
  readonly download: () => Promise<void>;
}

function useBatchState(): BatchState {
  const [dialog, setDialogState] = React.useState<BatchDialog | null>(null);
  const [pending, setPending] = React.useState(false);
  const [outcome, setOutcome] = React.useState<BatchOutcome | null>(null);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const setDialog = (next: BatchDialog | null): void => {
    setShareError(null);
    setDialogState(next);
  };
  return { dialog, setDialog, pending, setPending, outcome, setOutcome, shareError, setShareError };
}

const parentOf = (node: NodeSummary): string | null =>
  node.type === 'file' ? node.folderId : node.parentId;

/** Lo que va a la API: sin lo que está dentro de una carpeta también seleccionada (ya viaja con ella). */
function topLevelOf(selected: readonly NodeSummary[]): readonly NodeSummary[] {
  const ids = new Set(selected.map((node) => node.id));
  return selected.filter((node) => {
    const parent = parentOf(node);
    return parent === null || !ids.has(parent);
  });
}

/** Códigos que no dependen del elemento: si todos fallan por uno de ellos, el problema es el correo o la cuenta. */
const RECIPIENT_CODES: ReadonlySet<string> = new Set([
  SHARING_ERROR_CODES.SHARING_RECIPIENT_NOT_FOUND,
  SHARING_ERROR_CODES.SHARING_CANNOT_SHARE_WITH_SELF,
  SHARING_ERROR_CODES.SHARING_INVALID_LEVEL,
  STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY,
]);

/** Mensaje para el diálogo si nada se compartió por un motivo del correo o la cuenta; si no, `null`. */
function recipientProblemOf(result: BatchResult): string | null {
  if (result.succeeded.length > 0) return null;
  const code = result.failed.find((failure) => RECIPIENT_CODES.has(failure.code))?.code;
  return code === undefined ? null : shareCodeMessage(code);
}

interface Settler {
  /** Muestra el resultado, vacía la selección y cierra el diálogo. */
  readonly finish: (outcome: BatchOutcome, changes: boolean) => void;
  /** Con la petición en curso; si falla entera, avisa y conserva la selección. */
  readonly settle: (request: () => Promise<BatchOutcome>, changes: boolean) => Promise<void>;
}

function settlerOf(state: BatchState, selection: NodeSelection, onChanged: () => void): Settler {
  const finish = (outcome: BatchOutcome, changes: boolean): void => {
    state.setOutcome(outcome);
    selection.clear();
    state.setDialog(null);
    if (changes) onChanged();
  };
  const settle = async (request: () => Promise<BatchOutcome>, changes: boolean) => {
    state.setPending(true);
    try {
      finish(await request(), changes);
    } catch {
      state.setOutcome(BATCH_REQUEST_FAILED);
      state.setDialog(null);
    } finally {
      state.setPending(false);
    }
  };
  return { finish, settle };
}

interface ShareContext {
  readonly api: BatchApi;
  readonly state: BatchState;
  readonly finish: Settler['finish'];
}

/** «Compartir»: un correo que no sirve (o la petición rechazada) deja el diálogo abierto con el motivo. */
function shareActionOf({ api, state, finish }: ShareContext, selected: readonly NodeSummary[]) {
  return async (email: string, level: ShareLevel): Promise<void> => {
    state.setPending(true);
    state.setShareError(null);
    try {
      const result = await api.share({ items: selected.map(batchItemOf), email, level });
      const problem = recipientProblemOf(result);
      if (problem === null) finish(batchOutcomeOf('share', result, selected), true);
      else state.setShareError(problem);
    } catch (error) {
      state.setShareError(shareMessageOf(error).title);
    } finally {
      state.setPending(false);
    }
  };
}

/** Pide las URL, inicia cada descarga y arma el resultado con lo que no se pudo. */
async function downloadOutcome(api: BatchApi, selected: readonly NodeSummary[]) {
  const response = await api.download(selected.map(batchItemOf));
  startDownloads(response.downloads.map(({ url }) => url));
  const failures = failureLinesOf(response.failed, selected);
  return downloadOutcomeOf(response.downloads.length, failures);
}

/**
 * Acciones de la barra de selección (Compartir, Descargar, Mover, Eliminar) con `POST …/batch`: cada una muestra su
 * resultado, parcial si algunos fallaron, y vacía la selección; si la petición entera falla, la conserva.
 */
export function useBatchActions({ api, selection, onChanged }: BatchActionsOptions): BatchActions {
  const state = useBatchState();
  const selected = topLevelOf(selection.selected);
  const items = selected.map(batchItemOf);
  const { finish, settle } = settlerOf(state, selection, onChanged);
  const run = (action: BatchAction, request: () => Promise<BatchResult>) =>
    settle(async () => batchOutcomeOf(action, await request(), selected), true);
  return {
    ...state,
    trash: () => run('trash', () => api.trash(items)),
    move: (targetFolderId: string | null) => run('move', () => api.move(items, targetFolderId)),
    share: shareActionOf({ api, state, finish }, selected),
    download: () => settle(() => downloadOutcome(api, selected), false),
  };
}

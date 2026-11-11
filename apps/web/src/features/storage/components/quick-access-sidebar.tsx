'use client';

import type { DownloadUrlResponse, NodeSummary, QuickAccessItem } from '@nimbo/contracts';
import * as React from 'react';

import { storageMessage } from '../../../lib/error-catalog';
import { openInBrowser } from '../../../lib/use-preparing-download';
import {
  useQuickAccess,
  type QuickAccess,
  type QuickAccessFailure,
} from '../hooks/use-quick-access';
import type { QuickAccessApi } from '../quick-access-api';
import { isStorageNotFound, StorageRequestError } from '../storage-request-error';

import { downloadFailureNotice, type DownloadNotice, type PinToggle } from './file-row-menu';
import { QuickAccessSection } from './quick-access-section';

export interface QuickAccessSidebarOptions {
  readonly api: QuickAccessApi & {
    downloadUrl(fileId: string): Promise<DownloadUrlResponse>;
  };
  /** Carpeta cuya página se montó (se registra como reciente, Q-3); `null` en otras páginas. */
  readonly openedFolderId: string | null;
  /** Aviso de una descarga, un fijado o un quitado fallidos, arriba del contenido (como en 005). */
  readonly onNotice: (notice: DownloadNotice | null) => void;
}

export interface QuickAccessSidebar {
  readonly quickAccess: QuickAccess;
  /** `POST /files/:id/download-url` que, si responde, registra el archivo como reciente (Q-3). */
  readonly requestUrl: (fileId: string) => Promise<DownloadUrlResponse>;
  /** Para `AppLayout.sidebarSection`: barra de escritorio y cajón móvil. */
  readonly sidebarSection: React.ReactNode;
  /** «Fijar…» o «Quitar de la barra lateral» en el menú de una fila (CA-27). */
  readonly pinToggleFor: (node: NodeSummary) => PinToggle;
}

const NOT_FOUND_DESCRIPTION =
  'Puede que ya no esté en Mis archivos. Actualiza la lista para ver tus archivos.';
const NETWORK_DESCRIPTION = 'Revisa tu conexión e inténtalo de nuevo.';

function failureTitle({ action, name }: QuickAccessFailure): string {
  return action === 'pin'
    ? `No pudimos fijar «${name}» en la barra lateral.`
    : `No pudimos quitar «${name}» de la barra lateral.`;
}

/** Causa y acción con `storageMessage`; el 404 dice que ya no está (el texto del catálogo habla de un destino). */
function failureDescription(error: unknown): string {
  if (isStorageNotFound(error)) return NOT_FOUND_DESCRIPTION;
  const known =
    error instanceof StorageRequestError ? storageMessage(error.code, error.details) : null;
  return known === null ? NETWORK_DESCRIPTION : `${known.cause} ${known.fix}`;
}

/** Aviso de un fijado o quitado fallido (CA-27): si ya no existe, «Actualizar lista»; si no, «Reintentar». */
function quickAccessFailureNotice(failure: QuickAccessFailure): DownloadNotice {
  const gone = isStorageNotFound(failure.error);
  return {
    title: failureTitle(failure),
    description: failureDescription(failure.error),
    actionLabel: gone ? 'Actualizar lista' : 'Reintentar',
    onAction: gone ? failure.refresh : failure.retry,
  };
}

function pinToggle(quickAccess: QuickAccess, node: NodeSummary): PinToggle {
  const pinned = quickAccess.isPinned(node);
  return {
    pinned,
    onToggle: () => void (pinned ? quickAccess.unpin(node) : quickAccess.pin(node)),
  };
}

/** Descarga como en 005 (fila o barra) que registra el archivo como reciente si la URL llega (Q-3). */
function useRecordedDownload(
  { api, onNotice }: Omit<QuickAccessSidebarOptions, 'openedFolderId'>,
  quickAccess: QuickAccess,
) {
  const { recordOpen } = quickAccess;
  const requestUrl = React.useCallback(
    async (fileId: string) => {
      const response = await api.downloadUrl(fileId);
      recordOpen({ type: 'file', id: fileId });
      return response;
    },
    [api, recordOpen],
  );

  const openFile = async (item: QuickAccessItem): Promise<void> => {
    onNotice(null);
    try {
      openInBrowser((await requestUrl(item.id)).url);
    } catch (error) {
      const actions = { retry: () => void openFile(item), refresh: quickAccess.reload };
      onNotice(downloadFailureNotice(item.name, error, actions));
    }
  };

  return { requestUrl, openFile };
}

/** Accesos rápidos de una página con barra lateral (006 CA-27, CA-28): estado, descarga y menús de fila. */
export function useQuickAccessSidebar(options: QuickAccessSidebarOptions): QuickAccessSidebar {
  const { onNotice } = options;
  const quickAccess = useQuickAccess(options.api, options.openedFolderId, (failure) =>
    onNotice(failure && quickAccessFailureNotice(failure)),
  );
  const { requestUrl, openFile } = useRecordedDownload(options, quickAccess);
  return {
    quickAccess,
    requestUrl,
    sidebarSection: (
      <QuickAccessSection quickAccess={quickAccess} onOpenFile={(item) => void openFile(item)} />
    ),
    pinToggleFor: (node) => pinToggle(quickAccess, node),
  };
}

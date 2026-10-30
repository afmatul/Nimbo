'use client';

import { formatBytes } from '@nimbo/contracts';
import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createStorageApi, type StorageApi } from '../api';
import { useFileDropGuard } from '../hooks/use-file-drop-guard';
import { UploadsContext, useUploadManager, useUploads } from '../hooks/use-upload-manager';
import type { UploadManagerOptions } from '../upload/upload-manager';

import { CancelUploadDialog } from './cancel-upload-dialog';
import { NameConflictDialog } from './name-conflict-dialog';
import { UploadPanel } from './upload-panel';

export interface UploadsProviderProps {
  readonly api: StorageApi;
  /** Solo para pruebas: `put`, reloj y azar falsos del manager. */
  readonly managerOptions?: UploadManagerOptions;
  readonly children: React.ReactNode;
}

/** Cargas de la pestaña con su panel y sus diálogos, por encima de las páginas de `(cliente)`. */
export function UploadsProvider({
  api,
  managerOptions,
  children,
}: UploadsProviderProps): React.JSX.Element {
  const value = useUploadManager(api, managerOptions);
  useFileDropGuard();
  return (
    <UploadsContext.Provider value={value}>
      {children}
      <UploadCenter />
    </UploadsContext.Provider>
  );
}

/**
 * Proveedor del layout de `(cliente)`: arma el cliente de `storage` con `auth-fetch` y el token en memoria de la
 * sesión (002). El token se lee en cada petición, así una renovación no recrea el manager ni pierde cargas.
 */
export function SessionUploadsProvider({
  apiPublicUrl,
  children,
}: {
  readonly apiPublicUrl: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  const api = React.useMemo(
    () => createStorageApi(apiPublicUrl, authFetch),
    [apiPublicUrl, authFetch],
  );
  return <UploadsProvider api={api}>{children}</UploadsProvider>;
}

/** Panel flotante (abajo a la derecha; en móvil, al pie a todo el ancho) y los diálogos que pide el manager. */
function UploadCenter(): React.JSX.Element | null {
  const { manager, rows, closePanel, fileInputRef } = useUploads();
  if (rows.length === 0) return null;
  const conflict = rows.find((row) => row.phase === 'conflict');
  const cancelling = rows.find((row) => row.awaitingCancel);

  return (
    <>
      {/* Reserva al pie el alto del panel (lista incluida) para que no tape las últimas filas de la página (UI-4). */}
      <div data-testid="upload-panel-spacer" aria-hidden="true" className="h-80 sm:h-120" />
      <div className="fixed inset-x-0 bottom-0 z-30 pb-safe sm:inset-x-auto sm:bottom-6 sm:right-[calc(1.5rem+var(--agent-panel-width,0px))] sm:pb-0">
        <UploadPanel
          rows={rows}
          onPause={(id) => manager.pause(id)}
          onResume={(id) => manager.resume(id)}
          onRetry={(id) => manager.retry(id)}
          onRequestCancel={(id) => manager.requestCancel(id)}
          onUploadAgain={() => fileInputRef.current?.click()}
          onClose={closePanel}
        />
      </div>
      {conflict ? (
        <NameConflictDialog
          open
          fileName={conflict.name}
          finalName={conflict.suggestedName ?? conflict.name}
          othersCount={manager.pendingConflictsInBatch(conflict.id)}
          wouldPruneVersion={conflict.wouldPruneVersion}
          onKeepBoth={({ applyToRest }) =>
            manager.resolveConflict(conflict.id, 'keep_both', applyToRest)
          }
          onReplace={({ applyToRest }) =>
            manager.resolveConflict(conflict.id, 'replace', applyToRest)
          }
          onDiscard={({ applyToRest }) =>
            manager.resolveConflict(conflict.id, 'discard', applyToRest)
          }
        />
      ) : null}
      {cancelling ? (
        <CancelUploadDialog
          open
          uploadedLabel={formatBytes(cancelling.loadedBytes)}
          totalLabel={formatBytes(cancelling.sizeBytes)}
          fileName={cancelling.name}
          onConfirm={() => manager.confirmCancel(cancelling.id)}
          onDismiss={() => manager.dismissCancel(cancelling.id)}
        />
      ) : null}
    </>
  );
}

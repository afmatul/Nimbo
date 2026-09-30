'use client';

import { formatBytes } from '@nimbo/contracts';
import * as React from 'react';

import { createAuthFetch } from '../../identity/session/auth-fetch';
import { useSession } from '../../identity/session/session-provider';
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

interface TokenHolder {
  readonly get: () => string | null;
  readonly set: (token: string | null) => void;
}

/** Último token de acceso, leído en el momento de cada petición (no durante el render). */
function createTokenHolder(initial: string | null): TokenHolder {
  let current = initial;
  return {
    get: () => current,
    set: (token) => {
      current = token;
    },
  };
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
  const { accessToken, renew } = useSession();
  const [token] = React.useState(() => createTokenHolder(accessToken));
  React.useEffect(() => token.set(accessToken), [token, accessToken]);
  const api = React.useMemo(
    () => createStorageApi(apiPublicUrl, createAuthFetch({ getAccessToken: token.get, renew })),
    [apiPublicUrl, token, renew],
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
      <div className="fixed inset-x-0 bottom-0 z-30 sm:inset-x-auto sm:bottom-6 sm:right-6">
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
          onKeepBoth={({ applyToRest }) =>
            manager.resolveConflict(conflict.id, 'keep_both', applyToRest)
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

'use client';

import { STORAGE_ERROR_CODES, type FileVersionSummary } from '@nimbo/contracts';
import * as React from 'react';

import { showNotice } from '../../../components/ui/sonner';
import { storageMessage } from '../../../lib/error-catalog';
import { retryAdvice, type DownloadNotice } from '../components/file-row-menu';
import type { RestoreTarget } from '../components/restore-version-dialog';
import { StorageRequestError } from '../storage-request-error';
import type { VersionsApi } from '../versions-api';

import { useVersionDownload } from './use-version-download';

/** Lo que las acciones necesitan del resto de la ficha. */
export interface VersionActionsContext {
  readonly api: Pick<VersionsApi, 'restoreVersion' | 'versionDownloadUrl'>;
  readonly fileId: string;
  /** Vuelve a pedir el historial (tras restaurar o con «Actualizar historial»). */
  readonly reload: () => void;
  /** El espacio usado cambió (007 D-16). */
  readonly onSpaceChanged: () => void;
  readonly openUrl: (url: string) => void;
}

export interface VersionActions {
  /** Aviso arriba del historial (descarga fallida o historial desactualizado); `null` sin aviso. */
  readonly notice: DownloadNotice | null;
  readonly dismissNotice: () => void;
  /** Versión restaurada en esta visita: lleva «NUEVA». */
  readonly highlightedId: string | null;
  readonly restoreTarget: RestoreTarget | null;
  readonly openRestore: (target: RestoreTarget) => void;
  readonly closeRestore: () => void;
  readonly confirmRestore: () => Promise<void>;
  readonly preparingId: string | null;
  readonly download: (version: FileVersionSummary) => Promise<void>;
}

function codeOf(error: unknown): string | null {
  return error instanceof StorageRequestError ? error.code : null;
}

const STALE_CODES: ReadonlySet<string> = new Set([
  STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND,
  STORAGE_ERROR_CODES.STORAGE_VERSION_ALREADY_CURRENT,
]);

/** La versión ya no está (`404`, CA-11) o ya es la actual (`409`, CA-10): el historial visible quedó viejo. */
function staleNotice(
  code: string,
  version: FileVersionSummary,
  reload: () => void,
): DownloadNotice {
  const missing = code === STORAGE_ERROR_CODES.STORAGE_VERSION_NOT_FOUND;
  const message = storageMessage(code);
  return {
    title: missing
      ? `No encontramos la versión ${String(version.number)}.`
      : (message?.cause ?? ''),
    description: message?.fix ?? '',
    actionLabel: 'Actualizar historial',
    onAction: reload,
  };
}

/**
 * Trata los errores que invalidan lo que se ve: versión que ya no está o ya es actual (aviso con «Actualizar
 * historial») y archivo que ya no está (se relee y la ficha pasa a «No encontramos este archivo»). `false` si es otro.
 */
function handleStale(
  error: unknown,
  version: FileVersionSummary,
  context: { reload: () => void; setNotice: (notice: DownloadNotice) => void },
): boolean {
  const code = codeOf(error);
  if (code !== null && STALE_CODES.has(code)) {
    context.setNotice(staleNotice(code, version, context.reload));
    return true;
  }
  if (code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND) {
    context.reload();
    return true;
  }
  return false;
}

/** Restaurar (CA-9 a CA-12): confirma, avisa con un toast, marca la nueva, relee el historial y el espacio. */
function useRestoreFlow(
  context: VersionActionsContext,
  setNotice: (notice: DownloadNotice | null) => void,
) {
  const [target, setTarget] = React.useState<RestoreTarget | null>(null);
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);
  const { api, fileId, reload, onSpaceChanged } = context;

  const confirmRestore = async (): Promise<void> => {
    if (target === null) return;
    const { version } = target;
    try {
      const restored = await api.restoreVersion(fileId, version.id);
      showNotice(
        `Restauraste la versión ${String(version.number)} como versión ${String(restored.number)}.`,
      );
      setHighlightedId(restored.id);
      onSpaceChanged();
      reload();
    } catch (error) {
      if (!handleStale(error, version, { reload, setNotice })) throw error;
    }
  };

  return {
    highlightedId,
    restoreTarget: target,
    openRestore: (next: RestoreTarget) => {
      setNotice(null);
      setTarget(next);
    },
    closeRestore: () => setTarget(null),
    confirmRestore,
  };
}

/** Descargar una versión (CA-8); un fallo deja el aviso de 005 con «Reintentar». */
function useDownloadFlow(
  context: VersionActionsContext,
  setNotice: (notice: DownloadNotice | null) => void,
) {
  const { api, fileId, reload, openUrl } = context;
  const onFailure = (version: FileVersionSummary, error: unknown, retry: () => void): void => {
    if (handleStale(error, version, { reload, setNotice })) return;
    setNotice({
      title: `No pudimos preparar la descarga de la versión ${String(version.number)}.`,
      description: retryAdvice(error),
      actionLabel: 'Reintentar',
      onAction: retry,
    });
  };
  const flow = useVersionDownload(
    (version) => api.versionDownloadUrl(fileId, version.id),
    openUrl,
    onFailure,
  );
  return {
    preparingId: flow.preparingId,
    download: (version: FileVersionSummary) => {
      setNotice(null);
      return flow.download(version);
    },
  };
}

/** Acciones de la ficha de archivo sobre sus versiones: restaurar y descargar, con sus avisos. */
export function useVersionActions(context: VersionActionsContext): VersionActions {
  const [notice, setNotice] = React.useState<DownloadNotice | null>(null);
  /** La acción del aviso también lo cierra: «Actualizar historial» y «Reintentar» empiezan de nuevo. */
  const showClosingNotice = (next: DownloadNotice | null): void =>
    setNotice(
      next && {
        ...next,
        onAction: () => {
          setNotice(null);
          next.onAction();
        },
      },
    );
  return {
    notice,
    dismissNotice: () => setNotice(null),
    ...useRestoreFlow(context, showClosingNotice),
    ...useDownloadFlow(context, showClosingNotice),
  };
}

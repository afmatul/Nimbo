'use client';

import type { FileSummary } from '@nimbo/contracts';
import * as React from 'react';

import type { StorageApi } from '../api';
import {
  UploadManager,
  type LocalFile,
  type UploadManagerOptions,
  type UploadView,
} from '../upload/upload-manager';

export interface UploadsContextValue {
  readonly api: StorageApi;
  readonly manager: UploadManager;
  /** Filas del panel: todas las de la pestaña salvo las que se quitaron al cerrarlo. */
  readonly rows: readonly UploadView[];
  /** Archivos que terminaron de subir en esta pestaña, del más reciente al más antiguo (CA-1). */
  readonly uploadedFiles: readonly FileSummary[];
  /** Último estado de un archivo subido que se renombró o movió (006): así no reaparece en su carpeta anterior. */
  readonly reviseUploaded: (file: FileSummary) => void;
  /** Encola en la carpeta abierta (`null` es la raíz, 006 CA-6). */
  readonly enqueue: (files: readonly LocalFile[], folderId: string | null) => void;
  /** «Cerrar» del panel: quita las filas terminadas hasta la próxima carga. */
  readonly closePanel: () => void;
  /** Selector de archivos de la página; «Subir de nuevo» del panel lo abre. */
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const UploadsContext = React.createContext<UploadsContextValue | null>(null);

/** Cargas de la pestaña (plan §6 Frontend). Solo dentro de `<UploadsProvider>`. */
export function useUploads(): UploadsContextValue {
  const value = React.useContext(UploadsContext);
  if (value === null) throw new Error('useUploads debe usarse dentro de <UploadsProvider>.');
  return value;
}

/** Los archivos subidos, el más reciente primero; un reemplazo (014) repite el `id` y cuenta una sola vez. */
function uploadedFilesOf(rows: readonly UploadView[]): readonly FileSummary[] {
  const newestFirst = rows
    .flatMap((row) => (row.phase === 'done' && row.file !== null ? [row.file] : []))
    .reverse();
  return newestFirst.filter(
    (file, index) => newestFirst.findIndex((other) => other.id === file.id) === index,
  );
}

/** Los eventos `online`/`offline` del navegador reanudan o ponen en espera las cargas (CA-8). */
function useNetworkEvents(manager: UploadManager): void {
  React.useEffect(() => {
    const online = (): void => manager.networkOnline();
    const offline = (): void => manager.networkOffline();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [manager]);
}

/**
 * Crea un `UploadManager` por pestaña y lo expone a React. Vive en el layout de `(cliente)`: navegar dentro de la
 * pestaña conserva las cargas; recargar la página las pierde (RN-7) y no hay lista de pendientes.
 */
export function useUploadManager(
  api: StorageApi,
  managerOptions?: UploadManagerOptions,
): UploadsContextValue {
  const [manager] = React.useState(() => new UploadManager(api, managerOptions));
  const allRows = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => manager.subscribe(listener), [manager]),
    () => manager.snapshot(),
    () => manager.snapshot(),
  );
  const [closedIds, setClosedIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  useNetworkEvents(manager);

  const rows = React.useMemo(
    () => allRows.filter((row) => !closedIds.has(row.id)),
    [allRows, closedIds],
  );
  const [revisions, setRevisions] = React.useState<ReadonlyMap<string, FileSummary>>(
    () => new Map(),
  );
  const uploadedFiles = React.useMemo(
    () => uploadedFilesOf(allRows).map((file) => revisions.get(file.id) ?? file),
    [allRows, revisions],
  );
  const reviseUploaded = React.useCallback(
    (file: FileSummary) => setRevisions((previous) => new Map(previous).set(file.id, file)),
    [],
  );
  const enqueue = React.useCallback(
    (files: readonly LocalFile[], folderId: string | null) => manager.enqueue(files, folderId),
    [manager],
  );
  const closePanel = React.useCallback(
    () => setClosedIds(new Set(manager.snapshot().map((row) => row.id))),
    [manager],
  );

  return React.useMemo(
    () => ({
      api,
      manager,
      rows,
      uploadedFiles,
      reviseUploaded,
      enqueue,
      closePanel,
      fileInputRef,
    }),
    [api, manager, rows, uploadedFiles, reviseUploaded, enqueue, closePanel],
  );
}

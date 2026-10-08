'use client';

import type { FileVersionSummary } from '@nimbo/contracts';
import * as React from 'react';

import { isStorageNotFound } from '../storage-request-error';
import type { VersionsApi } from '../versions-api';

/** Historial de un archivo: cargando, error, archivo no encontrado (papelera, inexistente o ajeno) o listo. */
export type VersionsListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'not_found' }
  | {
      readonly status: 'ready';
      readonly items: readonly FileVersionSummary[];
      readonly retainedVersions: number;
      /** Momento de la lectura: referencia de «hoy» y «ayer». */
      readonly loadedAt: number;
    };

const LOADING: VersionsListing = { status: 'loading' };
const ERROR: VersionsListing = { status: 'error' };
const NOT_FOUND: VersionsListing = { status: 'not_found' };

/**
 * `GET /files/:fileId/versions` (014 CA-6). `reload` conserva el historial visible hasta la respuesta (tras restaurar o
 * con «Actualizar historial»); desde el error vuelve a «cargando». Una respuesta de un intento anterior se descarta.
 */
export function useFileVersions(
  api: Pick<VersionsApi, 'fileVersions'>,
  fileId: string,
  now: () => number = Date.now,
): { readonly listing: VersionsListing; readonly reload: () => void } {
  const [listing, setListing] = React.useState<VersionsListing>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    api.fileVersions(fileId).then(
      (history) => {
        if (current) setListing({ status: 'ready', ...history, loadedAt: now() });
      },
      (error: unknown) => {
        if (current) setListing(isStorageNotFound(error) ? NOT_FOUND : ERROR);
      },
    );
    return () => {
      current = false;
    };
  }, [api, fileId, attempt, now]);

  const reload = React.useCallback(() => {
    setListing((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  return { listing, reload };
}

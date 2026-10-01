'use client';

import {
  STORAGE_ERROR_CODES,
  type FolderContentsResponse,
  type FolderRef,
  type FolderSummary,
} from '@nimbo/contracts';
import * as React from 'react';

import { StorageRequestError } from '../storage-request-error';

const HTTP_NOT_FOUND = 404;

export type FolderListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'not_found' }
  | { readonly status: 'ready'; readonly contents: FolderContentsResponse };

export type LoadFolderContents = (folderId: string | null) => Promise<FolderContentsResponse>;

const LOADING: FolderListing = { status: 'loading' };

/**
 * Inexistente, ajena o en la papelera (`404`, CA-5 y CA-22) y un identificador que ni siquiera es UUID (`400` de la
 * consulta) se ven igual: «No encontramos esta carpeta».
 */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof StorageRequestError &&
    (error.status === HTTP_NOT_FOUND || error.code === STORAGE_ERROR_CODES.STORAGE_INVALID_QUERY)
  );
}

function withNewFolder(listing: FolderListing, folder: FolderSummary): FolderListing {
  if (listing.status !== 'ready') return listing;
  const { contents } = listing;
  return {
    status: 'ready',
    contents: { ...contents, items: [{ type: 'folder', ...folder }, ...contents.items] },
  };
}

interface KeyedListing {
  readonly key: string;
  readonly listing: FolderListing;
}

/**
 * Primera página de una carpeta o de la raíz (`null`). Cambiar de carpeta o pedir otra vez vuelve a «cargando» y la
 * respuesta de la petición anterior se descarta.
 */
export function useFolderContents(
  load: LoadFolderContents,
  folderId: string | null,
): {
  readonly listing: FolderListing;
  readonly reload: () => void;
  readonly addFolder: (folder: FolderSummary) => void;
} {
  const [attempt, setAttempt] = React.useState(0);
  const key = `${folderId ?? ''}#${String(attempt)}`;
  const [state, setState] = React.useState<KeyedListing>({ key: '', listing: LOADING });

  React.useEffect(() => {
    let current = true;
    const settle = (listing: FolderListing): void => {
      if (current) setState({ key, listing });
    };
    load(folderId).then(
      (contents) => settle({ status: 'ready', contents }),
      (error: unknown) => settle({ status: isNotFound(error) ? 'not_found' : 'error' }),
    );
    return () => {
      current = false;
    };
  }, [load, folderId, key]);

  const reload = React.useCallback(() => setAttempt((previous) => previous + 1), []);
  const addFolder = React.useCallback(
    (folder: FolderSummary) =>
      setState((previous) => ({ ...previous, listing: withNewFolder(previous.listing, folder) })),
    [],
  );

  return { listing: state.key === key ? state.listing : LOADING, reload, addFolder };
}

function foldersOf(contents: FolderContentsResponse): readonly FolderRef[] {
  return contents.items.flatMap((item) =>
    item.type === 'folder' ? [{ id: item.id, name: item.name }] : [],
  );
}

/**
 * Carpetas de primer nivel para la barra lateral (solo nombres). En la raíz salen del listado abierto; dentro de una
 * carpeta se piden aparte una vez. Si esa petición falla, la sección no se muestra.
 */
export function useRootFolders(
  load: LoadFolderContents,
  folderId: string | null,
  listing: FolderListing,
): readonly FolderRef[] {
  const [fetched, setFetched] = React.useState<readonly FolderRef[]>([]);
  const insideFolder = folderId !== null;

  React.useEffect(() => {
    if (!insideFolder) return undefined;
    let current = true;
    load(null).then(
      (contents) => {
        if (current) setFetched(foldersOf(contents));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [load, insideFolder]);

  if (insideFolder) return fetched;
  return listing.status === 'ready' ? foldersOf(listing.contents) : [];
}

'use client';

import type { FolderContentsResponse, NodeSummary } from '@nimbo/contracts';
import * as React from 'react';

import type { DisclosedLevel, FolderDisclosure } from '../components/node-table';

import type { LoadFolderContents } from './use-folder-contents';

/** Contenido de una carpeta desglosada en la lista (006 CA-26). */
export type DisclosedListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly contents: FolderContentsResponse };

export interface FolderDisclosureState {
  /** `undefined` si la carpeta está contraída. */
  readonly listingOf: (folderId: string) => DisclosedListing | undefined;
  readonly toggle: (folderId: string) => void;
  readonly retry: (folderId: string) => void;
  /** Vuelve a pedir cada carpeta desglosada («Actualizar lista»). */
  readonly refreshAll: () => void;
}

type Listings = ReadonlyMap<string, DisclosedListing>;

const LOADING: DisclosedListing = { status: 'loading' };

function withListing(listings: Listings, folderId: string, listing: DisclosedListing): Listings {
  return new Map(listings).set(folderId, listing);
}

function withoutListing(listings: Listings, folderId: string): Listings {
  const next = new Map(listings);
  next.delete(folderId);
  return next;
}

/**
 * Carpetas desglosadas de la lista con su primera página (`GET /folders/contents`). Cada petición lleva un turno: la
 * respuesta de una carpeta ya contraída o vuelta a pedir se descarta.
 */
export function useFolderDisclosure(load: LoadFolderContents): FolderDisclosureState {
  const [listings, setListings] = React.useState<Listings>(() => new Map());
  const turns = React.useRef(new Map<string, number>());
  const lastTurn = React.useRef(0);

  const fetchLevel = React.useCallback(
    (folderId: string) => {
      lastTurn.current += 1;
      const turn = lastTurn.current;
      turns.current.set(folderId, turn);
      setListings((previous) => withListing(previous, folderId, LOADING));
      const settle = (listing: DisclosedListing): void => {
        if (turns.current.get(folderId) !== turn) return;
        setListings((previous) => withListing(previous, folderId, listing));
      };
      load(folderId).then(
        (contents) => settle({ status: 'ready', contents }),
        () => settle({ status: 'error' }),
      );
    },
    [load],
  );

  const collapse = React.useCallback((folderId: string) => {
    turns.current.delete(folderId);
    setListings((previous) => withoutListing(previous, folderId));
  }, []);

  const refreshAll = React.useCallback(
    () => [...listings.keys()].forEach(fetchLevel),
    [listings, fetchLevel],
  );

  return {
    listingOf: (folderId) => listings.get(folderId),
    toggle: (folderId) => (listings.has(folderId) ? collapse(folderId) : fetchLevel(folderId)),
    retry: fetchLevel,
    refreshAll,
  };
}

/** Lo que se muestra de una carpeta desglosada a partir de su listado (p. ej. con los cambios hechos en la vista). */
export type PresentLevel = (
  folderId: string,
  contents: FolderContentsResponse,
) => readonly NodeSummary[];

/** Une el estado del desglose con la tabla: la tabla no sabe de peticiones ni de cambios locales. */
export function toFolderDisclosure(
  state: FolderDisclosureState,
  present: PresentLevel,
): FolderDisclosure {
  return {
    levelOf: (folderId): DisclosedLevel | undefined => {
      const listing = state.listingOf(folderId);
      if (listing?.status !== 'ready') return listing;
      return {
        status: 'ready',
        nodes: present(folderId, listing.contents),
        hasMore: listing.contents.nextCursor !== null,
      };
    },
    toggle: state.toggle,
    retry: state.retry,
  };
}

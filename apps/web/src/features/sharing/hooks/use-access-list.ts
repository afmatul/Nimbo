'use client';

import type { AccessEntry, ShareLevel } from '@nimbo/contracts';
import * as React from 'react';

import type { ShareNodeRef, SharingApi } from '../sharing-api';

/** Accesos de un nodo: cargando, error de carga o la lista (directos y heredados, 012 CA-8). */
export type AccessListing =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: readonly AccessEntry[] };

/** Compartir o cambiar el nivel: la misma llamada (012 S-2). El correo solo vive aquí y en el formulario. */
export interface ShareInput {
  readonly email: string;
  readonly level: ShareLevel;
}

export interface AccessListState {
  readonly listing: AccessListing;
  readonly reload: () => void;
  /** Rechaza con el error de la API; si sale bien, relee la lista (sin recargar la página). */
  readonly share: (input: ShareInput) => Promise<void>;
  readonly revoke: (shareId: string) => Promise<void>;
}

const LOADING: AccessListing = { status: 'loading' };

/** Una lectura por intento; una respuesta de un intento anterior se descarta. */
function useListing(api: SharingApi, node: ShareNodeRef) {
  const [listing, setListing] = React.useState<AccessListing>(LOADING);
  const [attempt, setAttempt] = React.useState(0);
  const { nodeType, nodeId } = node;

  React.useEffect(() => {
    let current = true;
    api.listAccess({ nodeType, nodeId }).then(
      ({ entries }) => {
        if (current) setListing({ status: 'ready', entries });
      },
      () => {
        if (current) setListing({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
  }, [api, nodeType, nodeId, attempt]);

  const reload = React.useCallback(() => {
    setListing((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  return { listing, reload };
}

/**
 * Quién tiene acceso a un nodo propio y sus mutaciones (spec 012b CA-1, CA-2, CA-4, CA-5). Tras cada mutación vuelve a
 * pedir la lista y conserva la visible hasta la respuesta.
 */
export function useAccessList(api: SharingApi, node: ShareNodeRef): AccessListState {
  const { listing, reload } = useListing(api, node);
  const { nodeType, nodeId } = node;

  const share = React.useCallback(
    async ({ email, level }: ShareInput) => {
      await api.share({ nodeType, nodeId, email, level });
      reload();
    },
    [api, nodeType, nodeId, reload],
  );

  const revoke = React.useCallback(
    async (shareId: string) => {
      await api.revoke(shareId);
      reload();
    },
    [api, reload],
  );

  return { listing, reload, share, revoke };
}

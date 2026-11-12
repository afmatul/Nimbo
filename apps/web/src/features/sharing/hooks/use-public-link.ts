'use client';

import type { CreatedPublicLink, PublicLinkSummary } from '@nimbo/contracts';
import * as React from 'react';

import type { PublicLinkInput, SharingApi } from '../sharing-api';

/** Enlace sin revocar de un archivo: cargando, error de carga (con el error, para su texto) o el enlace o `null`. */
export type PublicLinkReading =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'ready'; readonly link: PublicLinkSummary | null };

/** Lo que el propietario elige en el formulario; el archivo lo pone el hook. */
export type PublicLinkChoice = Omit<PublicLinkInput, 'fileId'>;

export interface PublicLinkState {
  readonly reading: PublicLinkReading;
  /** URL y resumen recién generados: solo en memoria, mientras el diálogo siga abierto (013c RN-1). */
  readonly generated: CreatedPublicLink | null;
  readonly reload: () => void;
  /** Rechaza con el error de la API; si sale bien, guarda la URL en memoria, relee el estado y la devuelve. */
  readonly create: (choice: PublicLinkChoice) => Promise<CreatedPublicLink>;
  /** Rechaza con el error de la API; si sale bien, descarta la URL, queda «sin enlace» y relee el estado. */
  readonly revoke: (linkId: string) => Promise<void>;
}

const LOADING: PublicLinkReading = { status: 'loading' };

/** Una lectura por intento y por archivo; una respuesta de un intento anterior se descarta. */
function useReading(api: SharingApi, fileId: string) {
  const [reading, setReading] = React.useState<PublicLinkReading>(LOADING);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let current = true;
    api.currentPublicLink(fileId).then(
      ({ link }) => {
        if (current) setReading({ status: 'ready', link });
      },
      (error: unknown) => {
        if (current) setReading({ status: 'error', error });
      },
    );
    return () => {
      current = false;
    };
  }, [api, fileId, attempt]);

  const reload = React.useCallback(() => {
    setReading((previous) => (previous.status === 'error' ? LOADING : previous));
    setAttempt((previous) => previous + 1);
  }, []);

  /** Fija un enlace conocido sin esperar la lectura (tras revocar, CA-9). */
  const settle = React.useCallback((link: PublicLinkSummary | null) => {
    setReading({ status: 'ready', link });
  }, []);

  return { reading, reload, settle };
}

/**
 * Enlace público de un archivo propio y sus mutaciones (spec 013c CA-1, CA-3, CA-7 a CA-9, CA-13). Tras generar
 * vuelve a pedir el estado y conserva el visible hasta la respuesta; tras revocar queda «sin enlace» de inmediato y
 * también relee. La URL nunca sale de la memoria.
 */
export function usePublicLink(api: SharingApi, fileId: string): PublicLinkState {
  const { reading, reload, settle } = useReading(api, fileId);
  const [generated, setGenerated] = React.useState<CreatedPublicLink | null>(null);

  const create = React.useCallback(
    async (choice: PublicLinkChoice) => {
      const created = await api.createPublicLink({ fileId, ...choice });
      setGenerated(created);
      reload();
      return created;
    },
    [api, fileId, reload],
  );

  const revoke = React.useCallback(
    async (linkId: string) => {
      await api.revokePublicLink(linkId);
      setGenerated(null);
      settle(null);
      reload();
    },
    [api, reload, settle],
  );

  return { reading, generated, reload, create, revoke };
}

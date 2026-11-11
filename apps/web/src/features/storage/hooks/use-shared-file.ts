'use client';

import type { FileDetailResponse } from '@nimbo/contracts';
import * as React from 'react';

import type { StorageApi } from '../api';
import { isOwner } from '../node-access';

import type { VersionsListing } from './use-file-versions';

/**
 * Archivo compartido conmigo (012b CA-9): el historial es solo del propietario (012 CA-14), así que su `404` se
 * confirma con `GET /files/:fileId`. `none` mientras el historial no diga «no encontrado».
 */
export type SharedFile =
  | { readonly status: 'none' }
  | { readonly status: 'loading' }
  | { readonly status: 'not_found' }
  | { readonly status: 'shared'; readonly detail: FileDetailResponse };

const NONE: SharedFile = { status: 'none' };
const LOADING: SharedFile = { status: 'loading' };
const NOT_FOUND: SharedFile = { status: 'not_found' };

function sharedOf(detail: FileDetailResponse): SharedFile {
  return isOwner(detail.accessLevel) ? NOT_FOUND : { status: 'shared', detail };
}

/** Sin respuesta (ajeno, en la papelera, revocado o sin red) queda «no encontrado», igual que sin compartir. */
export function useSharedFile(
  api: Pick<StorageApi, 'fileDetail'>,
  fileId: string,
  listing: VersionsListing,
): SharedFile {
  const [result, setResult] = React.useState<SharedFile | null>(null);
  const historyMissing = listing.status === 'not_found';

  React.useEffect(() => {
    if (!historyMissing) return;
    let current = true;
    api.fileDetail(fileId).then(
      (detail) => current && setResult(sharedOf(detail)),
      () => current && setResult(NOT_FOUND),
    );
    return () => {
      current = false;
    };
  }, [api, fileId, historyMissing]);

  if (!historyMissing) return NONE;
  return result ?? LOADING;
}

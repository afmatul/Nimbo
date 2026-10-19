'use client';

import * as React from 'react';

import { useAuthFetch } from '../../identity/session/use-auth-fetch';
import { createStorageHttp } from '../../storage/storage-http';
import { createEditingApi } from '../editing-api';

import { EditorView } from './editor-view';

/** Arma el cliente de `editing` con `auth-fetch` y el token en memoria de la sesión (002), como `storage`. */
export function SessionEditorView({
  apiPublicUrl,
  fileId,
}: {
  readonly apiPublicUrl: string;
  readonly fileId: string;
}): React.JSX.Element {
  const authFetch = useAuthFetch();
  const api = React.useMemo(
    () => createEditingApi(createStorageHttp(apiPublicUrl, authFetch)),
    [apiPublicUrl, authFetch],
  );
  return <EditorView fileId={fileId} api={api} />;
}

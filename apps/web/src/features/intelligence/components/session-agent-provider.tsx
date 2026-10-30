'use client';

import * as React from 'react';

import { createAuthFetch } from '../../identity/session/auth-fetch';
import { useAuthFetch, useAuthFetchDeps } from '../../identity/session/use-auth-fetch';
import { createStorageApi, type LoadFolderContents } from '../../storage';
import { getStatus } from '../agent-api';
import { streamAnswer } from '../agent-stream';
import type { AgentConversationDeps } from '../hooks/use-agent-conversation';

import { AgentPanelConnector } from './agent-panel-connector';
import { AgentProvider } from './agent-provider';

/** `getStatus` con `auth-fetch` y `streamAnswer` con el token en memoria de la sesión (002, D-1). */
function useSessionAgentDeps(apiPublicUrl: string): AgentConversationDeps {
  const auth = useAuthFetchDeps();
  return React.useMemo(() => {
    const authFetch = createAuthFetch(auth);
    return {
      loadStatus: () => getStatus(apiPublicUrl, authFetch),
      ask: (request, signal) => streamAnswer({ apiPublicUrl, request, signal, auth }),
    };
  }, [apiPublicUrl, auth]);
}

/** `GET /folders/contents` de `storage` con `auth-fetch`, para el árbol de «Una carpeta» (D-8). */
function useSessionFolderContents(apiPublicUrl: string): LoadFolderContents {
  const authFetch = useAuthFetch();
  return React.useMemo(() => {
    const api = createStorageApi(apiPublicUrl, authFetch);
    return (...args) => api.folderContents(...args);
  }, [apiPublicUrl, authFetch]);
}

/**
 * El proveedor con la API real de la sesión y el panel conectado al `AppLayout`, para el layout de `(cliente)`: solo el
 * Cliente lo monta (CA-18).
 */
export function SessionAgentProvider({
  apiPublicUrl,
  children,
}: {
  readonly apiPublicUrl: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AgentProvider deps={useSessionAgentDeps(apiPublicUrl)}>
      <AgentPanelConnector folderContents={useSessionFolderContents(apiPublicUrl)}>
        {children}
      </AgentPanelConnector>
    </AgentProvider>
  );
}

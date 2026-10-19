'use client';

import {
  EDITING_ERROR_CODES,
  EDITING_EVENTS,
  editingPresenceSchema,
  type EditingPresence,
  type OpenEditSessionResponse,
} from '@nimbo/contracts';
import * as React from 'react';

import { useRealtime } from '../../realtime/use-realtime';
import { isStorageNotFound, StorageRequestError } from '../../storage/storage-request-error';
import type { EditingApi } from '../editing-api';

/** Por qué no se pudo abrir: el servicio caído (CA-15), el archivo no visible (CA-2) u otro código de la API. */
export type EditorState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly session: OpenEditSessionResponse;
      readonly presence: EditingPresence;
      /** Conexión en vivo con la que se entró a la sala; si cambia (reconexión), se vuelve a entrar. */
      readonly joinedConnection: string | null;
    }
  | { readonly status: 'unavailable' }
  | { readonly status: 'not_found' }
  | { readonly status: 'failed'; readonly code: string | null };

type Ready = Extract<EditorState, { status: 'ready' }>;
type SetState = React.Dispatch<React.SetStateAction<EditorState>>;

const LOADING: EditorState = { status: 'loading' };

function presenceOf({ participants, editors, maxEditors }: EditingPresence): EditingPresence {
  return { participants, editors, maxEditors };
}

function readyState(session: OpenEditSessionResponse, joinedConnection: string | null): Ready {
  return { status: 'ready', session, presence: presenceOf(session), joinedConnection };
}

function failureState(caught: unknown): EditorState {
  if (isStorageNotFound(caught)) return { status: 'not_found' };
  if (!(caught instanceof StorageRequestError)) return { status: 'failed', code: null };
  if (caught.code === EDITING_ERROR_CODES.EDITING_UNAVAILABLE) return { status: 'unavailable' };
  return { status: 'failed', code: caught.code };
}

/** Solo cambia lo indicado de una pantalla ya abierta; en cualquier otro estado no hace nada. */
function updateReady(
  setState: SetState,
  change: Partial<Pick<Ready, 'presence' | 'joinedConnection'>>,
): void {
  setState((previous) => (previous.status === 'ready' ? { ...previous, ...change } : previous));
}

/** `editing.presence` por la sala del documento (CA-6); un aviso fuera del contrato se ignora (RN-9). */
function usePresenceUpdates(setState: SetState): void {
  const { on } = useRealtime();
  React.useEffect(
    () =>
      on(EDITING_EVENTS.PRESENCE, (payload) => {
        const parsed = editingPresenceSchema.safeParse(payload);
        if (parsed.success) updateReady(setState, { presence: parsed.data });
      }),
    [on, setState],
  );
}

interface RejoinInput {
  readonly api: EditingApi;
  readonly fileId: string;
  readonly state: EditorState;
  readonly setState: SetState;
}

/**
 * Tras reconectar, la conexión nueva no está en la sala (el cliente no elige salas, 015): se repite la apertura con su
 * id, que reutiliza la sesión, y solo se toma la presencia; el editor montado no cambia. Si falla, la presencia queda
 * sin avisos hasta la próxima reconexión y el editor sigue funcionando.
 */
function useRejoinOnReconnect({ api, fileId, state, setState }: RejoinInput): void {
  const { connectionId } = useRealtime();
  const joined = state.status === 'ready' ? state.joinedConnection : undefined;
  React.useEffect(() => {
    if (joined === undefined || connectionId === null || connectionId === joined) return;
    api.openSession(fileId, connectionId).then(
      (session) =>
        updateReady(setState, { presence: presenceOf(session), joinedConnection: connectionId }),
      () => undefined,
    );
  }, [api, fileId, joined, connectionId, setState]);
}

/**
 * Apertura del editor (CA-1, CA-3, CA-5, CA-7, CA-15, CA-21, CA-22) con la presencia en vivo (CA-6). `reopen` la repite
 * («Intentar editar», «Reintentar»); una respuesta vieja que llega después de otra más nueva se descarta.
 */
export function useEditSession(
  api: EditingApi,
  fileId: string,
): { readonly state: EditorState; readonly reopen: () => void } {
  const { connectionId } = useRealtime();
  const [state, setState] = React.useState<EditorState>(LOADING);
  const connection = React.useRef(connectionId);
  const latest = React.useRef(0);
  React.useEffect(() => {
    connection.current = connectionId;
  }, [connectionId]);

  const request = React.useCallback(() => {
    const id = ++latest.current;
    const used = connection.current;
    api.openSession(fileId, used).then(
      (session) => id === latest.current && setState(readyState(session, used)),
      (caught: unknown) => id === latest.current && setState(failureState(caught)),
    );
  }, [api, fileId]);

  React.useEffect(request, [request]);
  usePresenceUpdates(setState);
  useRejoinOnReconnect({ api, fileId, state, setState });
  const reopen = React.useCallback(() => {
    setState(LOADING);
    request();
  }, [request]);
  return { state, reopen };
}

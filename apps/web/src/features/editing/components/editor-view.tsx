'use client';

import * as React from 'react';
import { z } from 'zod';

import { StateView } from '../../../components/nimbo/state-view';
import { NotFoundState } from '../../access/components/not-found-state';
import { useSession } from '../../identity/session/session-provider';
import type { EditingApi } from '../editing-api';
import { useEditSession, type EditorState } from '../hooks/use-edit-session';
import { readOnlyCopy } from '../read-only-copy';

import { DocumentEditorFrame, LOADING_EDITOR_TITLE } from './document-editor-frame';
import { EditorFailedState, EditorUnavailableState } from './editor-failure';
import { EditorHeader, type PresenceToggle } from './editor-header';
import { editorCountLabel, PresencePanel, type Viewer } from './presence-panel';
import { ReadOnlyNotice } from './read-only-notice';

type Ready = Extract<EditorState, { status: 'ready' }>;

export interface EditorViewProps {
  readonly fileId: string;
  readonly api: EditingApi;
}

const PANEL_ID = 'participantes';
/** Mientras no llega el nombre del archivo (lo trae la configuración firmada). */
const GENERIC_TITLE = 'Editor de documentos';

/** El nombre del archivo viaja en la configuración del editor (`document.title`); el contrato no lo tipa. */
const titledConfigSchema = z.object({ document: z.object({ title: z.string().min(1) }) });

function titleOf(state: EditorState): string {
  if (state.status !== 'ready') return GENERIC_TITLE;
  const parsed = titledConfigSchema.safeParse(state.session.config);
  return parsed.success ? parsed.data.document.title : GENERIC_TITLE;
}

function useViewer(): Viewer {
  const { user } = useSession();
  return { id: user?.id ?? '', name: user?.fullName ?? '' };
}

/**
 * Pantalla del editor `.docx` (spec 016 §6): abre la sesión, monta ONLYOFFICE y muestra la presencia en vivo. Sin barra
 * lateral: es una pantalla de trabajo. Cada estado del mockup sale del modo y del motivo que da la API.
 */
export function EditorView({ fileId, api }: EditorViewProps): React.JSX.Element {
  const { state, reopen } = useEditSession(api, fileId);
  const [unavailable, setUnavailable] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const markUnavailable = React.useCallback(() => setUnavailable(true), []);
  const retry = React.useCallback(() => {
    setUnavailable(false);
    reopen();
  }, [reopen]);
  const shown: EditorState = unavailable ? { status: 'unavailable' } : state;
  const toggle = shown.status === 'ready' ? presenceToggle(shown, expanded, setExpanded) : null;

  return (
    <main className="flex min-h-dvh flex-col bg-background sm:p-4 lg:h-dvh">
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card shadow-card">
        <EditorHeader
          title={titleOf(shown)}
          mode={shown.status === 'ready' ? shown.session.mode : null}
          presence={toggle}
        />
        <EditorBody
          state={shown}
          expanded={expanded}
          onRetry={retry}
          onUnavailable={markUnavailable}
        />
      </div>
    </main>
  );
}

function presenceToggle(
  ready: Ready,
  expanded: boolean,
  setExpanded: (next: boolean) => void,
): PresenceToggle {
  const reason = ready.session.readOnlyReason;
  const blocked =
    reason === null ? null : readOnlyCopy(reason, ready.presence.maxEditors).blockedLabel;
  return {
    label: blocked === null ? editorCountLabel(ready.presence) : 'Participantes',
    controls: PANEL_ID,
    expanded,
    onToggle: () => setExpanded(!expanded),
  };
}

interface EditorBodyProps {
  readonly state: EditorState;
  readonly expanded: boolean;
  readonly onRetry: () => void;
  readonly onUnavailable: () => void;
}

function EditorBody({
  state,
  expanded,
  onRetry,
  onUnavailable,
}: EditorBodyProps): React.JSX.Element {
  switch (state.status) {
    case 'loading':
      return (
        <StateView
          type="loading"
          headingLevel="h2"
          title={LOADING_EDITOR_TITLE}
          className="m-4 flex-1"
        />
      );
    case 'not_found':
      return (
        <div className="m-4">
          <NotFoundState role="CLIENT" />
        </div>
      );
    case 'unavailable':
      return (
        <div className="flex flex-1 flex-col p-4">
          <EditorUnavailableState onRetry={onRetry} />
        </div>
      );
    case 'failed':
      return (
        <div className="flex flex-1 flex-col p-4">
          <EditorFailedState code={state.code} onRetry={onRetry} />
        </div>
      );
    case 'ready':
      return (
        <ReadyEditor
          ready={state}
          expanded={expanded}
          onRetry={onRetry}
          onUnavailable={onUnavailable}
        />
      );
  }
}

function ReadyEditor({
  ready,
  expanded,
  onRetry,
  onUnavailable,
}: Omit<EditorBodyProps, 'state'> & { readonly ready: Ready }): React.JSX.Element {
  const me = useViewer();
  const { session, presence } = ready;
  const copy =
    session.readOnlyReason === null
      ? null
      : readOnlyCopy(session.readOnlyReason, presence.maxEditors);
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section aria-label="Documento" className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        {copy ? <ReadOnlyNotice copy={copy} onRetry={onRetry} /> : null}
        <DocumentEditorFrame
          documentServerUrl={session.documentServerUrl}
          config={session.config}
          onUnavailable={onUnavailable}
        />
      </section>
      <PresencePanel
        id={PANEL_ID}
        presence={presence}
        readOnly={copy}
        me={me}
        expanded={expanded}
      />
    </div>
  );
}

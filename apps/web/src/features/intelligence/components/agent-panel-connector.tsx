'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { AgentEntryProvider } from '../../../components/nimbo/agent-entry';
import { AgentPanel } from '../../../components/nimbo/agent-panel';
import { MY_FILES_PATH, type LoadFolderContents } from '../../storage';
import { noticeFor } from '../agent-notice';
import type { AgentScope } from '../agent-scope';

import { useAgent, type AgentContextValue } from './agent-provider';
import { AgentScopePicker, type PinnedFile } from './agent-scope-picker';

export interface AgentPanelConnectorProps {
  /** `GET /folders/contents` para el árbol de «Una carpeta». */
  readonly folderContents: LoadFolderContents;
  readonly children: React.ReactNode;
}

/** El archivo vigente como ámbito sigue elegible en el selector (S-1). */
const pinnedFileOf = (scope: AgentScope): { readonly pinnedFile?: PinnedFile } =>
  scope.type === 'file' ? { pinnedFile: { id: scope.id, name: scope.name } } : {};

/** «Subir archivos» del estado vacío (CA-2): cierra el panel y lleva a Mis archivos, donde está la carga. */
function useUploadFiles(close: () => void): () => void {
  const router = useRouter();
  return () => {
    close();
    router.push(MY_FILES_PATH);
  };
}

interface ConnectedAgentPanelProps {
  readonly agent: AgentContextValue;
  readonly folderContents: LoadFolderContents;
}

/** El ámbito vigente y su selector; cambiarlo vale para las preguntas siguientes (CA-14). */
function ConnectedScopePicker({
  agent,
  folderContents,
}: ConnectedAgentPanelProps): React.JSX.Element {
  const { state, setScope } = agent.conversation;
  return (
    <AgentScopePicker
      scope={state.scope}
      {...pinnedFileOf(state.scope)}
      folderContents={folderContents}
      onChange={setScope}
    />
  );
}

/** El panel presentacional con la sesión del agente: estado, aviso por `code` (CA-8, CA-9, CA-16) y ámbito. */
function ConnectedAgentPanel(props: ConnectedAgentPanelProps): React.JSX.Element {
  const { conversation, close } = props.agent;
  const { state, screen } = conversation;
  const uploadFiles = useUploadFiles(close);
  return (
    <AgentPanel
      screen={screen}
      status={state.agentStatus}
      turns={state.turns}
      scopeControl={<ConnectedScopePicker {...props} />}
      onAsk={conversation.ask}
      onStop={conversation.stop}
      onUploadFiles={uploadFiles}
      onClose={close}
      notice={noticeFor(state, screen)}
      onRetry={conversation.retry}
    />
  );
}

/**
 * Llena la entrada del agente del `AppLayout` (020b D-4) desde la sesión de `AgentProvider`: «Agente Nimbo» abre el
 * panel con el ámbito vigente y el layout lo pinta mientras está abierto. Va dentro de `AgentProvider`.
 */
export function AgentPanelConnector({
  folderContents,
  children,
}: AgentPanelConnectorProps): React.JSX.Element {
  const agent = useAgent();
  const { open: openAgent } = agent;
  const open = React.useCallback(() => openAgent(), [openAgent]);
  const panel = agent.isOpen ? (
    <ConnectedAgentPanel agent={agent} folderContents={folderContents} />
  ) : null;
  return <AgentEntryProvider entry={{ open, panel }}>{children}</AgentEntryProvider>;
}

'use client';

import * as React from 'react';

import type { AgentScope } from '../agent-scope';
import {
  useAgentConversation,
  type AgentConversation,
  type AgentConversationDeps,
} from '../hooks/use-agent-conversation';

/** Lo que el panel y sus entradas («Agente Nimbo», «Preguntar sobre esto») consumen (020b D-4). */
export interface AgentContextValue {
  readonly conversation: AgentConversation;
  readonly isOpen: boolean;
  /** Abre el panel y relee el contador (D-9); con `scope`, lo deja como ámbito vigente (CA-15). */
  readonly open: (scope?: AgentScope) => void;
  readonly close: () => void;
}

const AgentContext = React.createContext<AgentContextValue | null>(null);

export interface AgentProviderProps {
  readonly deps: AgentConversationDeps;
  readonly children: React.ReactNode;
}

/**
 * Sostiene la sesión del agente por encima de las páginas del Cliente: navegar la conserva y recargar la vacía (CA-17).
 * No pinta el panel: eso es de `AgentPanelConnector` y del `AppLayout`.
 */
export function AgentProvider({ deps, children }: AgentProviderProps): React.JSX.Element {
  const conversation = useAgentConversation(deps);
  const [isOpen, setIsOpen] = React.useState(false);
  const { setScope, refreshStatus } = conversation;
  const open = React.useCallback(
    (scope?: AgentScope) => {
      if (scope !== undefined) setScope(scope);
      refreshStatus();
      setIsOpen(true);
    },
    [setScope, refreshStatus],
  );
  const close = React.useCallback(() => setIsOpen(false), []);
  const value = React.useMemo(
    () => ({ conversation, isOpen, open, close }),
    [conversation, isOpen, open, close],
  );
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): AgentContextValue {
  const value = React.useContext(AgentContext);
  if (value === null) throw new Error('useAgent debe usarse dentro de <AgentProvider>.');
  return value;
}

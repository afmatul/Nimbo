'use client';

import * as React from 'react';

/** Lo que el `AppLayout` necesita del agente: abrirlo desde «Agente Nimbo» y pintarlo mientras está abierto. */
export interface AgentEntry {
  readonly open: () => void;
  /** El panel ya armado mientras está abierto; `null` cerrado. */
  readonly panel: React.ReactNode;
}

const AgentEntryContext = React.createContext<AgentEntry | null>(null);

/**
 * La entrada del agente en el `AppLayout` (020b D-4): la pone el layout del Cliente, una sola vez, sin que
 * `components/nimbo` dependa de `features`. Sin ella no hay «Agente Nimbo» ni panel (roles internos, CA-18).
 */
export function AgentEntryProvider({
  entry,
  children,
}: {
  readonly entry: AgentEntry;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <AgentEntryContext.Provider value={entry}>{children}</AgentEntryContext.Provider>;
}

/** La entrada del agente, o `null` fuera del layout del Cliente. */
export function useAgentEntry(): AgentEntry | null {
  return React.useContext(AgentEntryContext);
}

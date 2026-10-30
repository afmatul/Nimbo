'use client';

import { Sparkles } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import { useOptionalAgent, type AgentScope } from '../../intelligence';

/**
 * «Preguntar sobre esto» (020b CA-15): abre el panel del agente con el archivo o la carpeta como ámbito. Solo existe en
 * el layout del Cliente: sin la sesión del agente (roles internos) no se pinta (CA-18).
 */
export function AskAgentButton({
  scope,
}: {
  readonly scope: Exclude<AgentScope, { type: 'all' }>;
}): React.JSX.Element | null {
  const agent = useOptionalAgent();
  if (agent === null) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-auto"
      onClick={() => agent.open(scope)}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      Preguntar sobre esto
    </Button>
  );
}

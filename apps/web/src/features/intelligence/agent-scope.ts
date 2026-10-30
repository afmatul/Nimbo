import type { AgentAskRequest, AgentScopeRequest } from '@nimbo/contracts';

/**
 * Ámbito de la pregunta en la web (RN-9 de 020, CA-14): todos los archivos, o una carpeta o un archivo con el nombre que
 * pinta el botón. El nombre nunca viaja al servidor.
 */
export type AgentScope =
  | { readonly type: 'all' }
  | { readonly type: 'folder'; readonly id: string; readonly name: string }
  | { readonly type: 'file'; readonly id: string; readonly name: string };

/** «Todos mis archivos», el ámbito por omisión (CA-1) y el que vuelve tras `AGENT_SCOPE_NOT_FOUND` (CA-16). */
export const ALL_FILES_SCOPE: AgentScope = { type: 'all' };

/** El ámbito como lo pide `agentScopeSchema`; `undefined` para todos los archivos (la petición no lleva `scope`). */
export function toScopeRequest(scope: AgentScope): AgentScopeRequest | undefined {
  return scope.type === 'all' ? undefined : { type: scope.type, id: scope.id };
}

/** Cuerpo de `POST /agent/ask` con la pregunta y su ámbito. */
export function toAskRequest(question: string, scope: AgentScope): AgentAskRequest {
  const scopeRequest = toScopeRequest(scope);
  return scopeRequest === undefined ? { question } : { question, scope: scopeRequest };
}

import { INTELLIGENCE_ERROR_CODES } from '@nimbo/contracts';

import {
  isPartialTurn,
  type AgentFailure,
  type AgentTurn,
  type ConversationState,
} from './agent-conversation';

/**
 * Estado de pantalla del panel (020b D-3), con los nombres del mockup `intelligence/panel-agente/`. El panel solo pinta:
 * decide aquí qué aviso, estado vacío o campo apagado corresponde. Los turnos se pintan siempre aparte. Suma al mockup
 * `cargando` (antes de leer el estado), `detenido` (CA-4), `ambito-no-disponible` (CA-16) y `error` (otro `code`).
 */
export type AgentScreen =
  | 'cargando'
  | 'inicio'
  | 'vacio'
  | 'respondiendo'
  | 'con-citas'
  | 'cita-incierta'
  | 'sin-resultados'
  | 'detenido'
  | 'limite-alcanzado'
  | 'no-disponible'
  | 'no-disponible-parcial'
  | 'error-pregunta'
  | 'error-pregunta-vacia'
  | 'ambito-no-disponible'
  | 'error';

const { AGENT_INVALID_QUESTION, AGENT_QUOTA_EXCEEDED, AGENT_SCOPE_NOT_FOUND, AGENT_UNAVAILABLE } =
  INTELLIGENCE_ERROR_CODES;

const lastTurnOf = (state: ConversationState): AgentTurn | undefined =>
  state.turns[state.turns.length - 1];

function errorScreen(error: AgentFailure, last: AgentTurn | undefined): AgentScreen {
  switch (error.code) {
    case AGENT_INVALID_QUESTION:
      return error.details['reason'] === 'empty' ? 'error-pregunta-vacia' : 'error-pregunta';
    case AGENT_QUOTA_EXCEEDED:
      return 'limite-alcanzado';
    case AGENT_UNAVAILABLE:
      return last !== undefined && isPartialTurn(last) ? 'no-disponible-parcial' : 'no-disponible';
    case AGENT_SCOPE_NOT_FOUND:
      return 'ambito-no-disponible';
    default:
      return 'error';
  }
}

function turnScreen(turn: AgentTurn): AgentScreen {
  if (turn.stopped) return 'detenido';
  if (turn.outcome === 'not_found') return 'sin-resultados';
  const uncertain = Object.values(turn.citations).some((cited) => !cited.isCertain);
  return uncertain ? 'cita-incierta' : 'con-citas';
}

/** Del estado de la sesión al estado de pantalla. Prioridad: en curso, error, carga, cuota agotada, turnos, vacío. */
export function agentScreen(state: ConversationState): AgentScreen {
  const last = lastTurnOf(state);
  if (state.status === 'streaming') return 'respondiendo';
  if (state.error !== null) return errorScreen(state.error, last);
  if (state.agentStatus === null) return 'cargando';
  if (state.agentStatus.used >= state.agentStatus.limit) return 'limite-alcanzado';
  if (last !== undefined) return turnScreen(last);
  return state.agentStatus.hasIndexedFiles ? 'inicio' : 'vacio';
}

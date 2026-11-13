import { INTELLIGENCE_ERROR_CODES, type AgentStatusResponse } from '@nimbo/contracts';

import type { AgentPanelNotice } from '../../components/nimbo/agent-panel';
import type { ApiErrorDetails } from '../../lib/api-error';
import { agentMessage, messageForCode } from '../../lib/error-catalog';
import { CHANGE_PLAN_PATH, RENEW_PATH } from '../billing';

import type { AgentFailure, ConversationState } from './agent-conversation';
import type { AgentScreen } from './agent-screen';

const { AGENT_QUOTA_EXCEEDED } = INTELLIGENCE_ERROR_CODES;

/** Encabezado del aviso de un `code` sin mensaje propio del agente; el catálogo pone qué hacer. */
const GENERIC_CAUSE = 'No pudimos responder tu pregunta.';

/** Las cifras del aviso de cuota cuando se llega por el contador agotado, sin error de la API (CA-8). */
function quotaDetailsOf(status: AgentStatusResponse | null): ApiErrorDetails {
  if (status === null) return {};
  return status.resetsAt === null
    ? { limit: status.limit }
    : { limit: status.limit, resetsAt: status.resetsAt };
}

/** CA-8, RN-5: con fecha, «Ver planes»; en solo lectura sin fecha, «Renovar plan». */
function quotaNotice(state: ConversationState): AgentPanelNotice | null {
  const { error } = state;
  const details =
    error?.code === AGENT_QUOTA_EXCEEDED ? error.details : quotaDetailsOf(state.agentStatus);
  const message = agentMessage(AGENT_QUOTA_EXCEEDED, details);
  if (message === null) return null;
  const link =
    typeof details['resetsAt'] === 'string'
      ? ({ label: 'Ver planes', href: CHANGE_PLAN_PATH } as const)
      : ({ label: 'Renovar plan', href: RENEW_PATH } as const);
  return { ...message, link };
}

/** Mensaje del catálogo para el error vigente (CA-7, CA-9, CA-16) o, si no es del agente, el genérico por `code`. */
function errorNotice(error: AgentFailure, screen: AgentScreen): AgentPanelNotice {
  const partial = screen === 'no-disponible-parcial';
  const agent = agentMessage(error.code, error.details, { partial });
  if (agent !== null) return agent;
  const { details, correlationId } = error;
  return { cause: GENERIC_CAUSE, fix: messageForCode(error.code, { details, correlationId }) };
}

/** El aviso que pinta el panel para su estado de pantalla; `null` sin fallo (020b D-4). */
export function noticeFor(state: ConversationState, screen: AgentScreen): AgentPanelNotice | null {
  if (screen === 'limite-alcanzado') return quotaNotice(state);
  return state.error === null ? null : errorNotice(state.error, screen);
}

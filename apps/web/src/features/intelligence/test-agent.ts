import {
  INTELLIGENCE_ERROR_CODES,
  type AgentCitationEvent,
  type AgentEvent,
  type AgentStatusResponse,
} from '@nimbo/contracts';

import type { AgentFailure } from './agent-conversation';

/** Fixtures del agente para las pruebas de la sesión y del panel (020b). Textos y cifras del contrato de la 020. */

export const FOLDER_ID = '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c';
export const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';

export function agentStatus(overrides: Partial<AgentStatusResponse> = {}): AgentStatusResponse {
  return {
    used: 3,
    limit: 20,
    resetsAt: '2026-11-01T06:00:00.000Z',
    hasIndexedFiles: true,
    maxQuestionChars: 1000,
    ...overrides,
  };
}

export function citation(overrides: Partial<AgentCitationEvent> = {}): AgentCitationEvent {
  return {
    type: 'citation',
    ordinal: 1,
    fileId: FILE_ID,
    versionId: '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f',
    fileName: 'Contrato.docx',
    label: 'Página 3',
    isCertain: true,
    ...overrides,
  };
}

export const delta = (text: string): AgentEvent => ({ type: 'delta', text });

export const DONE: AgentEvent = { type: 'done', outcome: 'answered', used: 4, limit: 20 };
export const NOT_FOUND_DONE: AgentEvent = {
  type: 'done',
  outcome: 'not_found',
  used: 4,
  limit: 20,
};
export const UNAVAILABLE_EVENT: AgentEvent = {
  type: 'error',
  code: INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE,
};

export function failure(code: string, details: AgentFailure['details'] = {}): AgentFailure {
  return { code, details, correlationId: '' };
}

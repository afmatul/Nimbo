import {
  INTELLIGENCE_ERROR_CODES,
  type AgentAnswerOutcome,
  type AgentCitationEvent,
  type AgentEvent,
  type AgentStatusResponse,
} from '@nimbo/contracts';

import type { ApiErrorDetails } from '../../lib/api-error';

import { ALL_FILES_SCOPE, type AgentScope } from './agent-scope';

/**
 * Sesión del agente (020b D-3), solo en memoria (RN-4, CA-17): un reductor puro e inmutable. Las reglas (cuota, ámbito,
 * citas) son del servidor (RN-1); aquí solo se refleja lo que la API responde.
 */

export type ConversationStatus = 'idle' | 'streaming';

/** Error por `code` con sus `details` (los del servidor, o los que suma la web: caracteres que sobran). */
export interface AgentFailure {
  readonly code: string;
  readonly details: ApiErrorDetails;
  readonly correlationId: string;
}

/** Una pregunta y su respuesta. Las citas van por ordinal, como las consume `AgentAnswer` (RN-2). */
export interface AgentTurn {
  readonly id: number;
  readonly question: string;
  readonly text: string;
  readonly citations: Readonly<Record<number, AgentCitationEvent>>;
  readonly outcome: AgentAnswerOutcome | null;
  readonly errorCode: string | null;
  readonly stopped: boolean;
}

export interface ConversationState {
  readonly status: ConversationStatus;
  readonly turns: readonly AgentTurn[];
  readonly nextTurnId: number;
  readonly scope: AgentScope;
  /** Último error: de la API, del flujo o de la validación local (CA-7). Se limpia al preguntar de nuevo. */
  readonly error: AgentFailure | null;
  /** `GET /agent/status`; `null` hasta la primera lectura. */
  readonly agentStatus: AgentStatusResponse | null;
}

export type ConversationAction =
  | { readonly type: 'statusLoaded'; readonly status: AgentStatusResponse }
  | { readonly type: 'statusFailed'; readonly failure: AgentFailure }
  | { readonly type: 'rejected'; readonly failure: AgentFailure }
  | { readonly type: 'asked'; readonly question: string }
  | { readonly type: 'received'; readonly event: AgentEvent }
  | { readonly type: 'failed'; readonly failure: AgentFailure }
  | { readonly type: 'stopped' }
  | { readonly type: 'scopeChanged'; readonly scope: AgentScope };

export const INITIAL_CONVERSATION: ConversationState = {
  status: 'idle',
  turns: [],
  nextTurnId: 1,
  scope: ALL_FILES_SCOPE,
  error: null,
  agentStatus: null,
};

const failureOf = (code: string, details: ApiErrorDetails = {}): AgentFailure => ({
  code,
  details,
  correlationId: '',
});

/** Terminó sin respuesta completa (detenido o con error) pero con algo de texto: se conserva lo recibido (CA-4, CA-9). */
export function isPartialTurn(turn: AgentTurn): boolean {
  return turn.text !== '' && turn.outcome === null && (turn.stopped || turn.errorCode !== null);
}

/** Terminó sin recibir nada: una pregunta nueva lo reemplaza en vez de repetir la burbuja. */
const isEmptyEnded = (turn: AgentTurn): boolean =>
  turn.text === '' && (turn.stopped || turn.errorCode !== null);

/**
 * Validación local de CA-7, con el máximo de la API (RN-1): vacía, o larga con los caracteres que sobran. Cuenta como el
 * servidor (recortada, unidades UTF-16). Sin máximo leído aún, la larga la decide el servidor.
 */
export function validateQuestion(question: string, maxChars: number | null): AgentFailure | null {
  const text = question.trim();
  const { AGENT_INVALID_QUESTION } = INTELLIGENCE_ERROR_CODES;
  if (text === '') return failureOf(AGENT_INVALID_QUESTION, { reason: 'empty' });
  if (maxChars === null || text.length <= maxChars) return null;
  return failureOf(AGENT_INVALID_QUESTION, {
    reason: 'too_long',
    excessChars: text.length - maxChars,
    maxChars,
  });
}

function newTurn(id: number, question: string): AgentTurn {
  return { id, question, text: '', citations: {}, outcome: null, errorCode: null, stopped: false };
}

/** Cambia el último turno sin mutar la lista. */
function withLastTurn(
  state: ConversationState,
  change: (turn: AgentTurn) => AgentTurn,
): ConversationState {
  const last = state.turns[state.turns.length - 1];
  if (last === undefined) return state;
  return { ...state, turns: [...state.turns.slice(0, -1), change(last)] };
}

function asked(state: ConversationState, question: string): ConversationState {
  const last = state.turns[state.turns.length - 1];
  const kept = last !== undefined && isEmptyEnded(last) ? state.turns.slice(0, -1) : state.turns;
  return {
    ...state,
    status: 'streaming',
    error: null,
    turns: [...kept, newTurn(state.nextTurnId, question)],
    nextTurnId: state.nextTurnId + 1,
  };
}

function failed(state: ConversationState, failure: AgentFailure): ConversationState {
  const ended = withLastTurn(state, (turn) => ({ ...turn, errorCode: failure.code }));
  const scopeGone = failure.code === INTELLIGENCE_ERROR_CODES.AGENT_SCOPE_NOT_FOUND;
  return {
    ...ended,
    status: 'idle',
    error: failure,
    scope: scopeGone ? ALL_FILES_SCOPE : state.scope,
  };
}

function finished(
  state: ConversationState,
  event: Extract<AgentEvent, { type: 'done' }>,
): ConversationState {
  const ended = withLastTurn(state, (turn) => ({ ...turn, outcome: event.outcome }));
  const counted = state.agentStatus && {
    ...state.agentStatus,
    used: event.used,
    limit: event.limit,
  };
  return { ...ended, status: 'idle', agentStatus: counted };
}

/** Un evento del flujo sobre el turno en curso (CA-3, CA-9). Fuera de una respuesta en curso se ignora. */
function received(state: ConversationState, event: AgentEvent): ConversationState {
  if (state.status !== 'streaming') return state;
  switch (event.type) {
    case 'citation':
      return withLastTurn(state, (turn) => ({
        ...turn,
        citations: { ...turn.citations, [event.ordinal]: event },
      }));
    case 'delta':
      return withLastTurn(state, (turn) => ({ ...turn, text: turn.text + event.text }));
    case 'done':
      return finished(state, event);
    case 'error':
      return failed(state, failureOf(event.code));
  }
}

function stopped(state: ConversationState): ConversationState {
  if (state.status !== 'streaming') return state;
  return { ...withLastTurn(state, (turn) => ({ ...turn, stopped: true })), status: 'idle' };
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case 'statusLoaded':
      return { ...state, agentStatus: action.status };
    case 'statusFailed':
      return state.agentStatus === null ? { ...state, error: action.failure } : state;
    case 'rejected':
      return { ...state, error: action.failure };
    case 'asked':
      return asked(state, action.question);
    case 'received':
      return received(state, action.event);
    case 'failed':
      return state.status === 'streaming' ? failed(state, action.failure) : state;
    case 'stopped':
      return stopped(state);
    case 'scopeChanged':
      return { ...state, scope: action.scope };
  }
}
